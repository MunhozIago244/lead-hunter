# Architecture Research

**Project:** lead-hunter
**Researched:** 2026-04-16
**Overall confidence:** HIGH (repo state + roadmap alignment), MEDIUM (future scraper internals)

---

## Architecture Summary

lead-hunter is a three-part system:

1. A Python CLI scraper discovers and analyzes local businesses.
2. Supabase stores the shared lead record and acts as the integration boundary.
3. A Next.js dashboard reads, updates, and enriches leads through internal API routes.

The important architectural rule for v1 is separation of responsibilities:

- The scraper talks to Google APIs, Playwright, Anthropic when needed, and Supabase.
- The dashboard talks to Next.js route handlers, not directly to external services.
- Supabase is the only shared data layer between scraper and dashboard.

This keeps the system simple for a solo workflow and matches the current roadmap phases.

---

## Current Reality

Phase 1 is complete. The repository currently contains the foundation, not the full product:

- Next.js scaffold exists in `app/`
- Supabase browser/server helpers exist in `lib/supabase/`
- The `leads` schema exists in `supabase/migrations/`
- Shared lead types exist in `types/lead.ts`

Implemented locally:

- Python scraper runtime for discovery
- Google Places API search with field mask, pagination, and backoff
- Supabase upsert flow for discovered leads
- no-site fallback enrichment and mobile PageSpeed analysis
- Playwright heuristics for WhatsApp/meta/freshness signals plus blocked-site safeguards
- ordered problems generation and sanitized scraper writes
- Supabase startup validation and explicit preservation of user-owned fields on re-scrape
- CLI reporting with trustworthy counts for extraction, analysis, and persistence failures
- Next.js internal API routes for lead reads, lead updates, and pitch generation
- Anthropic-backed prompt building with business data isolation inside `<business_data>`
- Dashboard lead list UI at `/` backed by `GET /api/leads`
- API-backed quick filters plus `status` / `segment` / `city` selects
- Client-side free-text search and selected-lead highlight/preview state
- Dashboard detail panel with site link, score grid, problems, contact data, and `PATCH /api/lead/[id]` status updates
- Dashboard pitch box with `POST /api/pitch`, copy-to-clipboard, WhatsApp deep links, and email deep links

Still not implemented:

- Live end-to-end verification with real Supabase rows, Anthropic credentials, and real outreach targets

This document therefore describes the **target architecture for v1**, while staying faithful to what is actually in the repo today.

---

## System Map

```text
┌──────────────────────────────────────────────────────────────────────┐
│ User: terminal workflow                                             │
│  python scraper/scraper.py --query "...\" --city \"...\" --max 20     │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Python Scraper (`scraper/scraper.py`)                               │
│                                                                      │
│ Responsibilities:                                                    │
│ - parse CLI flags                                                    │
│ - search Google Maps Places API                                     │
│ - analyze websites with PageSpeed + Playwright                      │
│ - compute heuristic problems/scores                                 │
│ - upsert leads into Supabase                                         │
└──────────────────────────────────────────────────────────────────────┘
             │                 │                    │
             │                 │                    │
             ▼                 ▼                    ▼
     Google Places API   PageSpeed API        Playwright browser
             \                 |                    /
              \                |                   /
               \               |                  /
                └──────────────┴─────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Supabase                                                            │
│                                                                      │
│ Canonical table in v1: `leads`                                       │
│ - scraper writes analytical fields                                   │
│ - dashboard reads all visible fields                                 │
│ - dashboard updates user-owned fields                                │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Next.js Dashboard                                                    │
│                                                                      │
│ UI layer                                                             │
│ - dashboard page shell                                               │
│ - lead list                                                          │
│ - lead detail                                                        │
│ - pitch box                                                          │
│                                                                      │
│ Internal API layer                                                   │
│ - GET /api/leads                                                     │
│ - PATCH /api/lead/[id]                                               │
│ - POST /api/pitch                                                    │
└──────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                          Anthropic API
                         (pitch generation)
```

### Direct communication rules

- The scraper does **not** call Next.js.
- The browser does **not** call Google APIs, PageSpeed, Playwright, or Anthropic directly.
- The browser does **not** write to Supabase directly for v1 mutations.
- Supabase is the only shared integration point between scraper and dashboard.

---

## Canonical File Responsibilities

These are the intended architectural responsibilities for the codebase as it evolves.

```text
app/
  page.tsx                     -> dashboard shell / initial route
  api/leads/route.ts           -> filtered lead reads
  api/lead/[id]/route.ts       -> lead PATCH updates
  api/pitch/route.ts           -> pitch generation + persistence

components/dashboard/          -> interactive UI units
  lead-list.tsx
  lead-filters.tsx
  lead-detail.tsx
  pitch-box.tsx
  status-select.tsx

lib/supabase/
  client.ts                    -> browser client
  server.ts                    -> request-scoped server client
  admin.ts                     -> planned server-only service-role client

scraper/
  scraper.py                   -> CLI entrypoint + orchestration

types/
  lead.ts                      -> canonical TypeScript data contract

supabase/migrations/
  *.sql                        -> schema source of truth
```

Notes:

- `components/dashboard/lead-list-dashboard.tsx`, `components/dashboard/lead-status-badge.tsx`, and `lib/supabase/admin.ts` are now present.
- `components/dashboard/lead-detail-panel.tsx` and `components/dashboard/lead-score-card.tsx` are now present.
- `components/dashboard/lead-pitch-box.tsx` and `lib/outreach.ts` are now present.
- `scraper/scraper.py` remains intentionally consolidated in one file while the scraper flow stabilizes.

---

## Data Model Ownership

The `leads` table is the core contract. Architectural ownership matters because re-scrapes must not overwrite user work.

### Scraper-owned fields

These are written and refreshed by the scraper:

- `name`
- `segment`
- `city`
- `address`
- `phone`
- `email`
- `site`
- `has_site`
- `score_mobile`
- `score_speed`
- `score_seo`
- `score_design`
- `problems`

### User-owned fields

These are created or updated from the dashboard:

- `pitch`
- `status`
- `contact_channel`
- `notes`

### Shared system fields

- `id`
- `created_at`
- `updated_at`

### Upsert rule

When the scraper reprocesses an existing business, it should update scraper-owned fields only. It must never overwrite `pitch`, `status`, `contact_channel`, or `notes`.

This rule is one of the key architectural boundaries of the project.

---

## Read and Write Paths

## 1. Scraper Flow

```text
CLI args
  -> normalize query/city/max
  -> Google Places search
  -> normalize each business into lead-shaped data
  -> if site exists:
       -> PageSpeed analysis
       -> Playwright analysis
       -> score/problem calculation
  -> if site does not exist:
       -> has_site = false
       -> standard no-presence problem
  -> Supabase upsert by (name, city)
  -> log result + update progress bar
```

Architectural intent:

- Discovery, analysis, and persistence remain in the scraper process.
- Partial failures are tolerated. A single bad site must not abort the full run.
- Null scores are valid state when a site is unreachable or blocked.

## 2. Dashboard Read Flow

```text
Browser opens dashboard
  -> client dashboard requests GET /api/leads
  -> route handler reads from Supabase
  -> returns JSON array of leads
  -> UI renders list, filters, and selected lead
```

Why API routes for reads in v1:

- The roadmap explicitly defines `GET /api/leads` as the canonical read interface.
- It creates one stable contract for the UI, later exports, and any future automation.
- It keeps filter parsing and data shaping in one place.

Current implementation note:

- quick operational filters and select filters call `GET /api/leads`
- free-text name search runs in the client after data load to avoid a request per keystroke

## 3. Lead Update Flow

```text
User changes status / notes / contact channel
  -> client sends PATCH /api/lead/[id]
  -> route validates payload against LeadUpdate shape
  -> route updates only user-owned columns
  -> route returns updated lead or success response
  -> client refreshes local state
```

Current implementation note:

- phase 7 currently uses this path for the "Marcar como contatado" action
- the returned lead is merged into local dashboard state so the badge changes without a full reload

## 4. Pitch Generation Flow

```text
User clicks "Gerar pitch"
  -> client sends POST /api/pitch with lead_id
  -> route loads lead from Supabase
  -> route sanitizes scraped content
  -> route builds Claude prompt
  -> route calls Anthropic
  -> route persists `pitch` to Supabase
  -> route returns { pitch }
  -> client displays pitch and enables copy/send actions
```

Pitch generation stays in the Next.js server layer because:

- the Anthropic key must never reach the browser
- prompt construction is sensitive logic
- the generated pitch must be saved atomically with the request

Current implementation note:

- copy, WhatsApp, and email actions are derived locally from the persisted pitch text already stored in the selected lead
- WhatsApp links normalize Brazilian numbers before building the `wa.me` URL

---

## API Surface

The v1 dashboard is built around three internal endpoints.

### `GET /api/leads`

Purpose:

- list leads for the dashboard
- support filtering by status, segment, city, and search term

Response shape:

- array of `Lead`

Responsibilities:

- parse query params
- map filter shortcuts such as "critical" or "no site" into DB filters
- order records predictably for the UI

### `PATCH /api/lead/[id]`

Purpose:

- update mutable user-owned lead fields

Allowed fields:

- `status`
- `contact_channel`
- `notes`
- `pitch`

Responsibilities:

- reject unknown fields
- preserve scraper-owned data
- return structured 400 / 404 / 500 errors

### `POST /api/pitch`

Purpose:

- generate or regenerate a pitch for one lead

Responsibilities:

- load the lead
- sanitize untrusted scraped data before prompt construction
- call Anthropic with the pinned model
- persist the generated pitch
- return `{ pitch: string }`

---

## Security Boundaries

The current repo is a solo internal tool, but the architecture should still be explicit about trust boundaries.

### Browser

The browser is untrusted. It may:

- read lead data through the dashboard API
- submit update requests to approved endpoints

It must never receive:

- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- raw external API credentials for Places or PageSpeed

### Scraper

The scraper is trusted server-side code. It can use:

- `SUPABASE_SERVICE_ROLE_KEY`
- Google API keys
- Anthropic key if pitch generation is ever moved into the scraper

### Next.js route handlers

These are the controlled mutation boundary for dashboard writes.

- Read routes can use the existing server Supabase helper.
- Mutation routes should use a server-only admin client backed by `SUPABASE_SERVICE_ROLE_KEY`, because the current RLS policy only grants anon read access.

Important caveat:

- This is acceptable for a local/internal v1 tool.
- If the dashboard is deployed publicly, auth must be added before exposing mutation routes.

---

## Supabase Architecture

Current schema truth lives in:

- `supabase/migrations/20260416000000_create_leads_table.sql`
- `types/lead.ts`

### Current table design

The current architecture uses a single `leads` table for v1.

This is the right call for now because:

- one lead is the main unit of work
- the scraper and dashboard both center on the same record
- a single-table design minimizes migration and UI complexity

### Deferred tables

Tables such as `scrape_runs`, `settings`, or `activity_log` are deliberately deferred.

They may be added later if one of these becomes true:

- scrape observability becomes important
- reusable user profile/social proof is needed for prompts
- audit history becomes a real operational need

They are not required for the first working MVP.

---

## Error Handling Model

The architecture assumes failures are local and recoverable whenever possible.

### Scraper failures

- Google API throttling: retry with backoff
- PageSpeed timeout: save lead with null scores and continue
- Playwright blocked page: mark analysis as unavailable and continue
- Supabase connection failure: fail fast before long runs

### Dashboard failures

- malformed request: `400`
- lead not found: `404`
- unexpected integration error: `500`

### UI behavior

- null scores render as "N/A", not as zero unless the business truly has no site
- pitch errors show inline feedback
- lead updates should not blank the whole page

---

## Recommended Implementation Order

This architecture maps directly to the roadmap:

1. Foundation
   - already done: schema, types, Supabase helpers
2. Scraper Discovery
   - CLI, Places lookup, normalization
3. Scraper Analysis
   - PageSpeed, Playwright, heuristic scoring
4. Scraper Persistence
   - upsert behavior, progress, resilience
5. Dashboard API Routes
   - `/api/leads`, `/api/lead/[id]`, `/api/pitch`
6. Dashboard Lead List
   - list UI, filters, selection
7. Dashboard Lead Detail
   - score grid, problems, contact info, status update
8. Dashboard Pitch
   - generation, copy, WhatsApp, email

Why this order:

- The scraper must exist before the dashboard has real data.
- The API layer must exist before the UI can depend on stable contracts.
- Pitch generation should come after the read/update flows are already trustworthy.

---

## Architectural Decisions

### 1. Use API routes as the dashboard contract

Decision:

- Use `GET /api/leads`, `PATCH /api/lead/[id]`, and `POST /api/pitch` as canonical interfaces.

Why:

- This matches the roadmap and requirements exactly.
- It keeps UI state management decoupled from raw DB queries.
- It provides a clean future seam for exports, automation, or external callers.

### 2. Keep scraper and dashboard decoupled

Decision:

- The scraper writes to Supabase directly instead of calling the dashboard API.

Why:

- fewer moving parts
- no need to run both systems to scrape
- easier CLI iteration and debugging

### 3. Keep the scraper in one file until it hurts

Decision:

- Start with `scraper/scraper.py` as one orchestrated file.

Why:

- faster to ship
- fewer abstractions before behavior stabilizes
- planned phases can still split the file later if it becomes noisy

### 4. Preserve user-owned fields on re-scrape

Decision:

- Re-scraping refreshes analytical data only.

Why:

- status, notes, and pitch are user work
- overwriting them would break the tool's operational value

### 5. Split filtering between server and client

Decision:

- API-backed filters handle operational slices such as critical / no-site / contacted plus `status`, `segment`, and `city`
- free-text name search stays client-side

Why:

- operational filters need canonical backend behavior and scale better as the dataset grows
- keystroke search should feel immediate and should not spam the API

### 6. Keep selected-lead detail local to the dashboard tree

Decision:

- the list owns the selected lead id and passes the resolved lead into a local detail panel
- mutations return an updated lead object that is merged into the in-memory list

Why:

- this keeps phase 7 simple without introducing a second detail-fetch endpoint
- the current API surface already returns everything needed for v1 detail rendering

### 7. Derive send actions in the client after pitch persistence

Decision:

- pitch generation remains server-side, but `copy`, `mailto`, and `wa.me` actions are built locally from the saved pitch text

Why:

- no extra route is needed for deterministic send links
- the browser is the right place to open clipboard and deep-link actions
- the single source of truth for the text stays in `leads.pitch`

---

## Open Questions

These do not block the architecture, but they should be revisited during implementation:

- Whether `app/page.tsx` becomes the dashboard directly or redirects to `/leads`
- Whether pitch prompt settings need a future `settings` table
- Whether `(name, city)` remains sufficient deduplication or should later move to `google_place_id`

---

## Bottom Line

The architecture for v1 is:

- one Python CLI scraper
- one Supabase `leads` table as the shared contract
- one Next.js dashboard using internal API routes
- one strict ownership rule between scraper-managed and user-managed fields

That is enough architecture to ship a useful MVP without over-engineering the repo.
