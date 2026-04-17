<!-- GSD:project-start source:PROJECT.md -->
## Project

**lead-hunter**

lead-hunter is a semi-automated freelance client prospecting system for a web developer. It discovers local businesses with poor or no web presence, analyzes their digital quality, generates personalized pitches via Claude AI, and presents everything in a dashboard where the user selects leads and opens WhatsApp or email with one click.

**Core Value:** A developer can go from "I need clients" to "I have 30 qualified leads with personalized pitches" in under an hour — without manually searching or writing cold messages.

### Constraints

- **Tech Stack**: Next.js 15 App Router, TypeScript strict, Tailwind CSS, Supabase, Python 3.11+ — locked per spec
- **AI Model**: `claude-sonnet-4-6` — current target for pitch generation
- **Python runtime**: Python 3.11+ with playwright, requests, supabase-py, tqdm
- **No unnecessary deps**: Only use what's in the defined stack
- **Responsiveness**: Dashboard must work at 1024px+ minimum width
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Frontend
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 15.3.x | App framework | Locked per spec. App Router is stable; 15.3 is current. Use `use cache` directive instead of fetch-level caching (fetch is no longer cached by default in Next.js 15). |
| React | 19.x | UI runtime | Ships with Next.js 15; no separate pin needed. |
| TypeScript | 5.x (strict) | Type safety | Locked per spec. Strict mode enforced from init. |
| Tailwind CSS | 4.x | Styling | v4 released January 2025. No `tailwind.config.js` required — design tokens via `@theme` in CSS. Next.js 15.3 generates Tailwind v4 by default. Do NOT start a v3 project. |
| @supabase/supabase-js | 2.x (latest) | Supabase JS client | Core client used by both browser and server helpers. |
| @supabase/ssr | latest | SSR cookie management | **Required** for Next.js App Router. Replaces deprecated `@supabase/auth-helpers-nextjs` entirely. Exports `createBrowserClient` (client components) and `createServerClient` (server components, server actions, route handlers, middleware). |
- Server Components, Server Actions, Route Handlers: `createServerClient` from `@supabase/ssr` + `cookies()` from `next/headers`. Uses a Proxy to handle token refresh since Server Components cannot write cookies directly.
- Client Components: `createBrowserClient` from `@supabase/ssr` as a singleton (one instance per render, not per call).
- Middleware (`middleware.ts`): `createServerClient` with `request.cookies` / `response.cookies` — required to keep sessions fresh on every request.
- Env vars use the new key name: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not the old `NEXT_PUBLIC_SUPABASE_ANON_KEY` name used in older tutorials).
### Backend / API (Next.js side)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js Route Handlers | built-in | REST endpoints | `app/api/` routes receive scraper output, serve dashboard data. No separate Express server needed. |
| Supabase Row Level Security | built-in | Data access control | Even for single-user, enable RLS from the start. Prevents accidental data exposure if auth is added later. |
| Supabase Realtime | built-in | Live lead updates | Optional for v1 — dashboard can poll. Upgrade to realtime subscription if scraper runs while dashboard is open. |
### Scraper (Python)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Python | 3.11+ | Runtime | Locked per spec. 3.11 has significant performance improvements; 3.12 is also fine. Avoid 3.13 (still early for ecosystem compatibility). |
| playwright (Python) | 1.49+ (latest stable) | Headless browser for site analysis | Best async support, CDP access, screenshot capability. Superior to Selenium for modern sites. Install chromium via `playwright install chromium` — do NOT install full browser suite. |
| playwright-stealth (tf-playwright-stealth) | 2.0.2 | Anti-bot fingerprint patching | Use `tf-playwright-stealth` on PyPI (actively maintained fork). Original `playwright-stealth` package is abandoned. Patches WebDriver flags, HeadlessChrome UA, missing plugins. Use `Stealth().use_async(page)` pattern (NOT the old `stealth_async(page)` from v1.x). |
| supabase-py | 2.28.3 | Supabase writes from scraper | Latest stable (March 2026). Supports both sync and async clients. For this scraper, sync client is sufficient — no need for async unless running concurrent requests. Use `acreate_client()` for async. |
| requests | 2.31+ | HTTP client for site checks | Used for local site fetch analysis, SSL/response heuristics, and lightweight exports. Simpler than httpx for this sync CLI. |
| tqdm | 4.x | Progress bar | Locked per spec. |
| python-dotenv | 1.x | Env var loading | Load API keys from `.env` in CLI context. |
| argparse | stdlib | CLI flags | Locked per spec (`--query`, `--city`, `--max`). No extra dep needed. |
### External Sources (Python scraper)
#### Google Maps public web
| Decision | Detail |
|----------|--------|
| Source strategy | Scrape public Google Maps result pages locally with Playwright instead of using Places API. |
| Why | Removes recurring API cost while preserving the best local-business coverage for Brazil. |
| Authentication | None. Public browsing only; no Google login and no API key. |
| Risk | Google can throttle or change DOM structure. Mitigate with real browser context, small batches, and resilient selectors. |
| Compatibility | Discovery still maps into the same `leads` schema used by the Next.js dashboard and CRM. |
#### Local site analysis
| Decision | Detail |
|----------|--------|
| Strategy | Replace PageSpeed API with local fetch + Playwright heuristics. |
| Signals | HTTPS, response time, viewport meta, contact presence, content depth, title/description/OG tags, favicon, WhatsApp CTA, image alt coverage, copyright freshness. |
| Cost | Zero API cost. Requires only local network access and Playwright Chromium. |
| Tradeoff | Scores are heuristic and not identical to Lighthouse/PageSpeed, but they are cheaper and sufficient for lead qualification. |
### Database
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase (PostgreSQL) | Cloud (managed) | Primary data store | Locked per spec. Free tier covers this project. Provides REST API (PostgREST) for both Python and JS clients, auth-ready, realtime capable. |
- `leads` table: all scraped + analyzed data in one table with a `status` enum column
- `pitches` table or `pitch` column on `leads`: store generated pitch text after first generation
- Deduplication: unique constraint on `(website_url)` or `(google_place_id)` — use `upsert` from Python scraper
- Enable RLS from day one, even for single-user. Use service role key in Python scraper (server-side only, never in browser).
### AI Integration
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| anthropic (Python SDK) | 0.96.0 | Pitch generation | Latest stable (April 16, 2026). Used in Python scraper OR triggered from Next.js API route. |
| Model | `claude-sonnet-4-6` | Pitch text generation | Current target model for pitch generation in this repo. |
## What NOT to Use
| Category | Avoid | Reason |
|----------|-------|--------|
| Supabase client | `@supabase/auth-helpers-nextjs` | Deprecated. Replaced by `@supabase/ssr`. Tutorials using `createClientComponentClient` / `createServerComponentClient` are outdated. |
| Playwright stealth | `playwright-stealth` (original, `AtuboDad/playwright_stealth`) | Abandoned. Use `tf-playwright-stealth` instead. |
| Playwright stealth API | `stealth_async(page)` / `stealth_sync(page)` | v1.x API. Use `Stealth().use_async(page)` (v2.x). |
| Google Maps Python | `googlemaps` PyPI package | Tied to legacy API flows and unnecessary for the local scraping approach. |
| Playwright | Sync API for scraper | Sync API blocks on every operation. With 30+ leads per run, async is significantly faster. |
| AI API | `claude-sonnet-4-6` alias only | The alias resolves to current latest — safe, but pin the explicit model ID in production to avoid unexpected behavior changes on model updates. |
| Paid Google APIs | Places/PageSpeed as a hard dependency | Adds avoidable cost to a solo local prospecting workflow. Prefer local scraping + heuristic analysis. |
| Supabase | anon key in Python scraper | Python scraper runs server-side. Use `SUPABASE_SERVICE_ROLE_KEY` for scraper writes (bypasses RLS safely). Use anon/publishable key only in the browser. |
| Tailwind | v3 config style (`tailwind.config.js` with `content` array) | v4 uses CSS-native `@theme`. Starting a new project with v3 patterns with a v4 install breaks silently. |
| Next.js Route Handlers | Express.js or separate API server | No separate backend needed. Route Handlers in App Router are sufficient and eliminate an extra deployment target. |
## Key Version Constraints
# Python scraper (requirements.txt)
# Next.js dashboard (package.json)
## Confidence Levels
| Area | Confidence | Source | Notes |
|------|------------|--------|-------|
| Next.js 15 + @supabase/ssr pattern | HIGH | Official Supabase docs (supabase.com/docs) | Two-client pattern (createBrowserClient / createServerClient) is current and documented |
| Supabase-py version (2.28.3) | HIGH | PyPI direct fetch | Confirmed April 2026 |
| Anthropic SDK version (0.96.0) | HIGH | PyPI direct fetch | Confirmed April 16, 2026 |
| Claude model IDs | HIGH | Official Anthropic docs (platform.claude.com) | `claude-sonnet-4-6` is the active model target used by the pitch flow. |
| tf-playwright-stealth v2 API | MEDIUM | PyPI + multiple scraping blogs | Original package abandoned; tf fork is maintained. v2 API change from v1 confirmed across multiple sources. |
| Local Google Maps scraping viability | MEDIUM | Practical implementation choice | Works well for low-volume local use, but selectors may need maintenance when Google changes UI. |
| Local site heuristics | MEDIUM | Internal scoring logic | Sufficient for qualification; not equivalent to Lighthouse. |
| Tailwind v4 / Next.js 15.3 defaults | HIGH | Multiple current blog posts + official Next.js docs | v4 is standard for new Next.js 15 projects as of 2025 |
| Async Playwright recommendation | MEDIUM | Official Playwright docs + community patterns | Async is the recommended pattern per docs; concurrent benefit for this use case is inference, not benchmarked. |
## Sources
- Supabase SSR setup: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase SSR client creation: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Anthropic model IDs (official): https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic SDK on PyPI: https://pypi.org/project/anthropic/
- supabase-py on PyPI: https://pypi.org/project/supabase/
- tf-playwright-stealth: https://pypi.org/project/tf-playwright-stealth/
- Playwright Python docs: https://playwright.dev/python/docs/library
- Next.js 15 + Tailwind v4: https://dev.to/darshan_bajgain/setting-up-2025-nextjs-15-with-shadcn-tailwind-css-v4-no-config-needed-dark-mode-5kl
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

lead-hunter uses a 3-layer architecture:

- **Python CLI scraper** (`scraper/scraper.py`) handles discovery, site analysis, heuristic scoring, and Supabase upserts
- **Supabase** is the shared integration boundary; v1 centers on a single `leads` table
- **Next.js dashboard** renders the UI and talks to internal API routes for reads and mutations

Canonical dashboard interfaces:

- `GET /api/leads` for filtered lead reads
- `PATCH /api/lead/[id]` for status/notes/contact updates
- `POST /api/pitch` for Claude-generated pitches persisted to the DB

Field ownership is explicit:

- scraper-owned: business identity, contact discovery, site scores, problems
- user-owned: `pitch`, `status`, `contact_channel`, `notes`

Re-scrapes must never overwrite user-owned fields.

Current repo status: all planned v1 phases are implemented locally (schema, types, Supabase helpers, local Google Maps scraping discovery, no-site fallback, local fetch-based site analysis, Playwright heuristics, blocked-site safeguards, ordered problems, startup Supabase validation, user-field preservation on re-scrape, hardened CLI reporting, optional FastAPI local scraper endpoints, internal Next.js routes for leads, lead PATCH updates, pitch generation, and a homepage dashboard that consumes `GET /api/leads` with quick filters, local search, selected-lead highlighting, score cards, problems/contact rendering, async status mutation, pitch generation/re-generation, copy-to-clipboard, WhatsApp deep links, and email deep links). Live integration verification is still planned.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
