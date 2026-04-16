# Architecture Research

**Project:** lead-hunter
**Researched:** 2026-04-16
**Overall confidence:** HIGH (Next.js/Supabase patterns), MEDIUM (scraper patterns)

---

## Component Map

```
┌─────────────────────────────────────────────────────────────────┐
│  SCRAPER PROCESS (Python 3.11+)                                 │
│                                                                 │
│  CLI Entry (argparse)                                           │
│    └─► ScraperOrchestrator                                      │
│          ├─► GoogleMapsClient      (Places API)                 │
│          ├─► PageSpeedClient       (PSI API, free tier)         │
│          ├─► PlaywrightAnalyzer    (headless browser)           │
│          │     ├── screenshot                                   │
│          │     ├── whatsapp_detection                           │
│          │     ├── meta_tag_check                               │
│          │     └── last_content_date                            │
│          ├─► ScoreCalculator       (heuristic, pure fn)         │
│          └─► SupabaseWriter        (supabase-py, upsert)        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ writes to
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SUPABASE (shared data layer)                                   │
│                                                                 │
│  Tables:                                                        │
│    leads          (id, query, city, status, scores, problems,   │
│                    contact_info, pitch, created_at, updated_at) │
│    scrape_runs    (id, query, city, started_at, finished_at,    │
│                    leads_found, errors)                         │
│                                                                 │
│  RLS: service_role key for scraper (bypasses RLS)              │
│       anon key + policy for dashboard (scoped to owner)        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ reads/mutates via
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  DASHBOARD (Next.js 15 App Router, TypeScript)                  │
│                                                                 │
│  Server Components (read-only, direct Supabase query)          │
│    ├── /leads              (list with filters)                  │
│    └── /leads/[id]         (lead detail + scores)              │
│                                                                 │
│  Server Actions (mutations from React components)              │
│    ├── generatePitch()     (calls Claude API server-side)       │
│    ├── updateLeadStatus()  (status state machine)              │
│    └── savePitch()         (persists edited pitch to DB)       │
│                                                                 │
│  Client Components (interactivity only)                        │
│    ├── LeadFilters         (filter bar, client state)          │
│    ├── PitchEditor         (textarea + copy/send buttons)      │
│    └── StatusSelector      (dropdown, calls Server Action)     │
│                                                                 │
│  Route Handlers (external-facing only)                         │
│    └── (none needed for v1 — no webhooks or external callers)  │
└─────────────────────────────────────────────────────────────────┘
```

**What does NOT talk directly to what:**
- Python scraper never calls Next.js — it only writes to Supabase
- Next.js never calls the scraper — it only reads from Supabase
- Client components never call Supabase directly — they go through Server Actions or read from Server Component props
- Claude API is called only from Server Actions, never from the browser (keeps API key server-side)

---

## Data Flow

### Scrape Flow (Python)

```
User runs CLI
  --query "restaurantes" --city "Curitiba" --max 30
    │
    ▼
GoogleMapsClient.search(query, city, max)
  → GET Places API → list of {name, address, website, phone}
    │
    ▼  (for each business, with semaphore limiting concurrency)
PageSpeedClient.analyze(website_url)
  → GET PageSpeed Insights API → {mobile_score, performance, seo}
    │
PlaywrightAnalyzer.analyze(website_url)
  → headless browser → {screenshot_url, has_whatsapp, meta_tags, last_date}
    │
ScoreCalculator.score(pagespeed_data, playwright_data)
  → pure function → {design_score, seo_score, speed_score, problems[]}
    │
    ▼
SupabaseWriter.upsert(lead_data)
  → INSERT ... ON CONFLICT (website_url) DO UPDATE
  → uses service_role key (bypasses RLS)
```

### Dashboard Read Flow (Next.js)

```
Browser navigates to /leads
  │
  ▼
Server Component (runs on server at request time)
  → createServerClient(supabase_url, anon_key, cookies())
  → SELECT * FROM leads WHERE status != 'discarded' ORDER BY score DESC
  → renders HTML with lead cards
    │
    ▼
Browser receives full HTML (no loading spinner, no client fetch)
  → Client Component hydrates filter bar (client state only)
  → User filters → URL search params update → Server Component re-renders
```

### Pitch Generation Flow

```
User clicks "Gerar Pitch" on /leads/[id]
  │
  ▼
Client Component fires Server Action: generatePitch(leadId)
  │
  ▼
Server Action (runs on server)
  → fetch lead data from Supabase (service_role for internal mutations)
  → build prompt with lead problems, scores, contact info
  → POST anthropic API (claude-sonnet-4-20250514, max_tokens: 300)
  → UPDATE leads SET pitch = result WHERE id = leadId
  → return pitch text to client
    │
    ▼
Client Component updates UI optimistically, shows pitch in textarea
User edits → clicks "Salvar" → savePitch() Server Action
User clicks "WhatsApp" → window.open(wa.me link) on client
```

### Lead Status Update Flow

```
User selects new status in StatusSelector
  │
  ▼
Client Component calls Server Action: updateLeadStatus(leadId, newStatus)
  → validates transition (new→contacted→replied→closed or discarded)
  → UPDATE leads SET status = newStatus, updated_at = now()
  → revalidatePath('/leads') — forces Server Component cache invalidation
```

---

## Recommended Patterns

### Python Scraper

**Async with bounded concurrency, not fully parallel.**

Use `asyncio` + `httpx` for Google Maps and PageSpeed API calls.
Use `asyncio.Semaphore(5)` to cap concurrent requests — PageSpeed free tier rate-limits aggressively (approximately 25 requests per 100 seconds).
Use Playwright in sync mode inside an `asyncio.to_thread()` wrapper — Playwright's async API is available but adds complexity; sync in a thread pool is simpler and sufficient for this scale.

```python
# Pattern: bounded semaphore for rate limiting
sem = asyncio.Semaphore(5)

async def analyze_one(business, sem):
    async with sem:
        await asyncio.sleep(0.5)  # polite delay
        pagespeed = await pagespeed_client.analyze(business.website)
        playwright_data = await asyncio.to_thread(playwright_analyzer.analyze, business.website)
        return build_lead(business, pagespeed, playwright_data)
```

**Retry with exponential backoff + jitter for external APIs.**

Google Maps and PageSpeed both return 429 on overload. Retry up to 3 times with delays of 2^attempt + random(0, 1) seconds. Do not retry Playwright failures (site is just broken — log and skip).

**Progress with tqdm.**

Wrap the business list with `tqdm(businesses, desc="Analisando")` before the async gather. Update manually inside the semaphore block with `pbar.update(1)`.

**Deduplication via upsert on website_url.**

The scraper never checks if a lead exists before inserting. Use Supabase upsert with `on_conflict="website_url"` and update only the analytical fields, not `status` or `pitch` (those are user-owned).

```python
supabase.table("leads").upsert(
    lead_data,
    on_conflict="website_url",
    # Do NOT overwrite user data on re-scrape
    ignoreDuplicates=False
).execute()
```

### Next.js Dashboard

**Server Components for all reads. Server Actions for all mutations.**

Do not create Route Handlers for internal use. They add a network round-trip and lose type safety. Route Handlers are only needed when an external caller (webhook, mobile app, third party) needs to hit an HTTP endpoint — none exist in v1.

**Supabase client creation pattern:**

- Server Components: `createServerClient()` from `@supabase/ssr` using `cookies()` from `next/headers`
- Server Actions: same `createServerClient()` — they run on the server and have access to cookies
- Never instantiate `createBrowserClient()` in a Server Component

**Caching strategy:**

Server Component reads are cached by Next.js by default. After any mutation (status update, pitch save), call `revalidatePath('/leads')` or `revalidatePath('/leads/' + leadId)` inside the Server Action. This is the recommended invalidation pattern for App Router — no need for manual cache keys.

**Error handling for Claude API:**

Wrap the Anthropic API call in a try/catch inside the Server Action. Return a typed result union:

```typescript
type PitchResult =
  | { ok: true; pitch: string }
  | { ok: false; error: "rate_limit" | "api_error" | "timeout" };
```

The Client Component reads this result and shows an inline error message without crashing. Do not throw from Server Actions — it triggers React's error boundary at the wrong level.

### Supabase / RLS

**For a solo-user tool, RLS adds complexity for near-zero security gain.** The scraper runs locally. The dashboard is not publicly deployed in v1. The pragmatic choice is:

- Enable RLS on all tables (good habit, keeps options open)
- Create a single permissive policy: `USING (true)` for all operations on the authenticated role
- Scraper uses `service_role` key (env var, never committed) — bypasses RLS entirely
- Dashboard uses `anon` key with Supabase Auth (a single email/password user) — goes through RLS

If you add auth later (e.g., deploy to Vercel), change the policy to `USING (auth.uid() = owner_id)` with a fixed owner_id — one-line change.

```sql
-- Permissive for now, swap when deploying publicly
CREATE POLICY "owner can do everything"
ON leads
FOR ALL
USING (true)
WITH CHECK (true);
```

---

## Build Order

Dependencies flow strictly downward. Each phase produces something the next one consumes.

```
Phase 1: Foundation
  ├── Supabase project + schema (leads, scrape_runs tables)
  ├── RLS policies + both keys stored in .env
  └── shared TypeScript types (generated from Supabase schema)
        ↓ (schema must exist before anything queries it)

Phase 2: Scraper Core
  ├── Google Maps client + deduplication upsert
  ├── PageSpeed client + async rate limiting
  ├── Playwright analyzer
  ├── Score calculator (pure function, unit testable)
  └── CLI wiring with tqdm progress
        ↓ (DB must have data before dashboard is useful)

Phase 3: Dashboard Read Layer
  ├── Next.js project scaffold (App Router, Supabase SSR)
  ├── /leads page — Server Component reading from DB
  ├── Lead detail page /leads/[id]
  └── Filter bar (client component, URL params)
        ↓ (read layer must work before adding mutations)

Phase 4: Actions + Pitch Generation
  ├── generatePitch() Server Action (Claude API)
  ├── savePitch() Server Action
  ├── updateLeadStatus() Server Action
  └── WhatsApp / email deep links (client-side only)
```

**Why this order:**
- You cannot build the dashboard without data; you cannot have data without the schema.
- The scraper is purely additive — it only writes. It can be extended without touching the dashboard.
- Pitch generation depends on lead data existing, so it must come after the read layer validates the schema is correct.
- Mutations come last because they require the read layer to verify state before and after.

---

## Trade-offs

### 1. Sync CLI vs Background Queue for the Scraper

| Option | Sync CLI (recommended) | Background Queue (Celery + Redis) |
|--------|------------------------|-----------------------------------|
| Complexity | Low — one Python process | High — broker, worker, result backend |
| Visibility | tqdm in terminal | Requires separate monitoring UI |
| Failure recovery | Re-run CLI | Automatic retry |
| Trigger from dashboard | Not possible | Possible via HTTP |
| Right for solo tool? | Yes | No — massive over-engineering |

**Decision: sync CLI.** The user runs the scraper deliberately before working in the dashboard. No need for background processing. If 30 leads takes 5 minutes, that is acceptable. A progress bar provides all the feedback needed.

The one limitation: you cannot trigger scraping from the dashboard UI. This is explicitly acceptable — the requirements specify a CLI tool. If this changes in v2, add a `/api/scrape` Route Handler that shells out to the Python process or moves to a queue at that point.

### 2. Server Components + Server Actions vs Pure API Routes

| Option | Server Components + Actions (recommended) | API Route Handlers |
|--------|-------------------------------------------|--------------------|
| Type safety | End-to-end, no serialization gap | Manual, requires shared types |
| Bundle size | Server code stays on server | Same |
| External access | Not possible | Possible |
| Form handling | Built-in React integration | Manual fetch() |
| Caching | revalidatePath() native | Manual cache invalidation |
| Right for internal app? | Yes | No — adds unnecessary indirection |

**Decision: Server Actions for all mutations.** The dashboard has no external callers in v1. Every mutation is triggered from within the React component tree. Server Actions give type-safe, co-located mutation functions with native cache invalidation. Add Route Handlers only if you later need a webhook (e.g., WhatsApp delivery status callback).

### 3. Supabase anon key in dashboard vs service_role key

| Option | anon key + RLS | service_role key |
|--------|----------------|------------------|
| Correct for server-side? | Yes (with auth) | Yes, but risky |
| Accidentally leaks to client? | Low risk (anon key is public by design) | HIGH risk — bypasses all RLS |
| Multi-user ready? | Yes | No |

**Decision: anon key for the dashboard, service_role only in the scraper.** Even though this is a single-user tool, the service_role key should never be inside a Next.js app because build-time errors, client bundle leaks, or misconfigured Server Actions could expose it. The anon key with a permissive RLS policy gives the same access with far less risk.

### 4. Playwright sync vs async in the scraper

| Option | Playwright sync (recommended) | Playwright async |
|--------|-------------------------------|------------------|
| API clarity | Simple, no async/await overhead | Consistent with rest of async code |
| Runs in asyncio loop | Via asyncio.to_thread() | Direct |
| Debugging | Simpler stack traces | More complex |
| Performance difference | Negligible for this scale | Negligible |

**Decision: Playwright sync API wrapped in `asyncio.to_thread()`.** The scraper launches one Playwright browser and runs site analysis sequentially per site. Parallelizing Playwright across 30 sites simultaneously would consume 30x memory and likely trigger bot detection on target sites. Sequential sync in a thread is cleaner and safer.

---

## Error Boundary Map

```
External API         Failure Mode              Handling
─────────────────────────────────────────────────────────────
Google Maps API      429 rate limit            retry 3x exponential backoff
                     0 results                 log warning, continue
                     network timeout           retry 2x, then skip query

PageSpeed API        429 rate limit            retry 3x with 60s ceiling
                     site unreachable          score = null, mark "unanalyzed"
                     malformed response        parse defensively, fallback 0

Playwright           site timeout              mark "unanalyzed", log URL
                     JS crash in page          catch, continue to next step
                     screenshot fails          skip screenshot, continue

Claude API           rate limit (429)          return { ok: false, error: "rate_limit" }
                     API error (5xx)           return { ok: false, error: "api_error" }
                     timeout                   return { ok: false, error: "timeout" }
                     (never throw — Server Actions catch at wrong level)

Supabase             connection error          surface to CLI as fatal, exit 1
                     upsert conflict           handled by ON CONFLICT clause
                     RLS violation             would indicate wrong key config
```

The key principle: **partial failures must not abort the full scrape run.** If PageSpeed fails for one site, log it and continue to the next. The lead still gets saved with `pagespeed_score = null`. The dashboard should render gracefully when scores are null (show "N/A" not crash).
