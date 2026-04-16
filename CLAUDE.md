<!-- GSD:project-start source:PROJECT.md -->
## Project

**lead-hunter**

lead-hunter is a semi-automated freelance client prospecting system for a web developer. It discovers local businesses with poor or no web presence, analyzes their digital quality, generates personalized pitches via Claude AI, and presents everything in a dashboard where the user selects leads and opens WhatsApp or email with one click.

**Core Value:** A developer can go from "I need clients" to "I have 30 qualified leads with personalized pitches" in under an hour — without manually searching or writing cold messages.

### Constraints

- **Tech Stack**: Next.js 15 App Router, TypeScript strict, Tailwind CSS, Supabase, Python 3.11+ — locked per spec
- **AI Model**: `claude-sonnet-4-20250514` — specified by user
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
| requests | 2.31+ | HTTP client for APIs | Used for Google Maps Places API and PageSpeed Insights API calls. Simpler than httpx for non-async contexts. |
| tqdm | 4.x | Progress bar | Locked per spec. |
| python-dotenv | 1.x | Env var loading | Load API keys from `.env` in CLI context. |
| argparse | stdlib | CLI flags | Locked per spec (`--query`, `--city`, `--max`). No extra dep needed. |
### External APIs (Python scraper)
#### Google Maps Places API
| Decision | Detail |
|----------|--------|
| Use **Places API (New)**, not legacy | Effective March 1, 2025, new projects cannot enable legacy services. Legacy is deprecated with no new features. |
| Endpoints to use | **Text Search (New)**: `POST https://places.googleapis.com/v1/places:searchText` — query by niche + city string. Returns structured place data. |
| Field masking | Use `X-Goog-FieldMask` header to request only needed fields: `places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus` — billed at lowest applicable SKU tier. |
| Free tier | Essentials SKUs: 10,000 free billable events/month. Pro SKUs: 5,000/month. Text Search is a Pro SKU. For a solo prospecting tool running a few searches per day, free tier is sufficient. |
| Quota limits | No hard daily quota documented for Places API (New); billing kicks in after free tier. Set a budget alert in Google Cloud to avoid surprise charges. |
| Authentication | API key in request header `X-Goog-Api-Key`. Store in `.env`, never commit. |
| Client | Raw `requests` calls — no official Python SDK needed. The `googlemaps` PyPI package still uses legacy endpoints; avoid it. |
#### PageSpeed Insights API
| Decision | Detail |
|----------|--------|
| Version | v5 (current, no v6) |
| Authentication | API key optional for low volume. Without key: undocumented per-origin rate limiting applies (reports suggest ~1 req/min per IP). With free key: 25,000 queries/day, 400/100 seconds. Use an API key. |
| Strategy | Call twice per site: `strategy=mobile` (primary score for pitch) and `strategy=desktop`. Mobile score is the more impactful signal for local businesses. |
| Fields to extract | From `lighthouseResult.categories`: `performance.score`, `seo.score`, `accessibility.score`. From `lighthouseResult.audits`: `first-contentful-paint.displayValue`, `speed-index.displayValue`, `largest-contentful-paint.displayValue`. From `loadingExperience`: `LARGEST_CONTENTFUL_PAINT_MS.category` for real-world CWV rating. |
| Rate limiting in scraper | Add 2-second sleep between PSI calls. PSI runs a live Lighthouse test — it's slow (~5-10 seconds per call) so this isn't a bottleneck. |
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
| Model | `claude-sonnet-4-20250514` | Pitch text generation | Specified by user. Note: this model is **deprecated** and will be retired June 15, 2026. It still works until then. For post-June production use, migrate to `claude-sonnet-4-6`. Both are identical in pricing ($3/MTok input, $15/MTok output). |
## What NOT to Use
| Category | Avoid | Reason |
|----------|-------|--------|
| Supabase client | `@supabase/auth-helpers-nextjs` | Deprecated. Replaced by `@supabase/ssr`. Tutorials using `createClientComponentClient` / `createServerComponentClient` are outdated. |
| Playwright stealth | `playwright-stealth` (original, `AtuboDad/playwright_stealth`) | Abandoned. Use `tf-playwright-stealth` instead. |
| Playwright stealth API | `stealth_async(page)` / `stealth_sync(page)` | v1.x API. Use `Stealth().use_async(page)` (v2.x). |
| Google Maps Python | `googlemaps` PyPI package | Uses legacy Places API endpoints. Will break post-legacy deprecation. Use raw `requests` to Places API (New). |
| Playwright | Sync API for scraper | Sync API blocks on every operation. With 30+ leads per run, async is significantly faster. |
| AI API | `claude-sonnet-4-6` alias only | The alias resolves to current latest — safe, but pin the explicit model ID in production to avoid unexpected behavior changes on model updates. |
| PageSpeed API | Without API key | Triggers undocumented per-IP rate limiting that will silently fail at scale. Get a free key. |
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
| Claude model IDs | HIGH | Official Anthropic docs (platform.claude.com) | `claude-sonnet-4-20250514` confirmed as legacy/deprecated but functional until June 15, 2026 |
| tf-playwright-stealth v2 API | MEDIUM | PyPI + multiple scraping blogs | Original package abandoned; tf fork is maintained. v2 API change from v1 confirmed across multiple sources. |
| Places API (New) migration | HIGH | Google official docs (March 2025 billing changes) | Legacy disabled for new projects from March 1, 2025 — confirmed |
| PageSpeed Insights rate limits | MEDIUM | Google docs + community reports | Official limit (25k/day with key) is HIGH confidence. Undocumented per-IP throttling is MEDIUM — reported but not officially documented. |
| Tailwind v4 / Next.js 15.3 defaults | HIGH | Multiple current blog posts + official Next.js docs | v4 is standard for new Next.js 15 projects as of 2025 |
| Async Playwright recommendation | MEDIUM | Official Playwright docs + community patterns | Async is the recommended pattern per docs; concurrent benefit for this use case is inference, not benchmarked. |
## Sources
- Supabase SSR setup: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase SSR client creation: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Anthropic model IDs (official): https://platform.claude.com/docs/en/about-claude/models/overview
- Anthropic SDK on PyPI: https://pypi.org/project/anthropic/
- supabase-py on PyPI: https://pypi.org/project/supabase/
- Google Maps Places API (New) billing March 2025: https://developers.google.com/maps/billing-and-pricing/march-2025
- Places API (New) usage and billing: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
- Places API Legacy overview: https://developers.google.com/maps/documentation/places/web-service/legacy/overview-legacy
- PageSpeed Insights API reference: https://developers.google.com/speed/docs/insights/v5/reference
- PageSpeed Insights rate limits (community): https://bjb.dev/log/20221009-pagespeed-api/
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

Architecture not yet mapped. Follow existing patterns found in the codebase.
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
