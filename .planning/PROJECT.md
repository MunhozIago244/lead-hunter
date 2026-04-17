# lead-hunter

## What This Is

lead-hunter is a semi-automated freelance client prospecting system for a web developer. It discovers local businesses with poor or no web presence, analyzes their digital quality, generates personalized pitches via Claude AI, and presents everything in a dashboard where the user selects leads and opens WhatsApp or email with one click.

## Core Value

A developer can go from "I need clients" to "I have 30 qualified leads with personalized pitches" in under an hour — without manually searching or writing cold messages.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [x] User can define niche + city and trigger a company search
- [x] System fetches businesses via Google Maps Places API
- [x] System analyzes each site: PageSpeed mobile score, speed score, SEO score, design score
- [x] System detects presence of WhatsApp button, meta tags, and last content date
- [x] System identifies and lists up to 5 problems per company
- [x] Leads are saved to Supabase with deduplication
- [x] Dashboard shows leads with filters (status, segment, city, score)
- [x] Dashboard supports local lead search and visual selection state
- [x] User can view full lead detail: scores, problems, contact info
- [x] User can update lead status from the detail panel without page reload
- [x] User can generate a personalized pitch via Claude API
- [x] User can regenerate, copy, or send pitch via WhatsApp or email
- [ ] User can update lead status (new → contacted → replied → closed → discarded)
- [x] CLI scraper with argparse: --query, --city, --max flags
- [x] Progress bar and clear logs during scraping

### Out of Scope

- Mobile app — web dashboard is sufficient for a solo developer
- Multi-user / team features — single user tool
- Automated sending of messages — user always reviews and sends manually
- CRM integrations (HubSpot, Pipedrive) — out of scope for v1
- Lead scoring ML model — heuristic scores are sufficient for v1

## Context

- Built for a solo freelance web developer prospecting local clients in Brazilian cities
- All UI text in Portuguese; code/variables in English
- Python scraper runs separately from Next.js dashboard — they share Supabase as the data layer
- All planned v1 phases are implemented locally; live verification still depends on valid Google API keys, a real Supabase project, a working Playwright Chromium runtime, and an Anthropic API key
- The home route now renders the live lead list fed by `GET /api/leads`, with quick filters backed by the API, free-text search running locally in the browser, and a richer right panel for details, status mutation, and pitch/send actions
- PageSpeed Insights API should use an API key to avoid rate limiting and unstable behavior
- Playwright is used headless for site analysis (screenshot, WhatsApp detection, SEO checks)
- Claude API model: `claude-sonnet-4-6` for pitch generation (max 300 tokens per pitch)
- WhatsApp deep link format: `https://wa.me/55{phone}?text={encodedPitch}`

## Constraints

- **Tech Stack**: Next.js 15 App Router, TypeScript strict, Tailwind CSS, Supabase, Python 3.11+ — locked per spec
- **AI Model**: `claude-sonnet-4-6` — specified by user
- **Python runtime**: Python 3.11+ with playwright, requests, supabase-py, tqdm
- **No unnecessary deps**: Only use what's in the defined stack
- **Responsiveness**: Dashboard must work at 1024px+ minimum width

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Split Python scraper + Next.js dashboard | Scraper needs Playwright/Python ecosystem; dashboard needs React/TS ecosystem | — Pending |
| Supabase as shared data layer | Provides real-time DB, auth-ready, free tier, works with both Python and JS | — Pending |
| Claude API for pitch generation | Contextual, customizable pitches outperform templates | — Pending |
| Heuristic design score (not ML) | Simple, fast, no training data needed | — Pending |
| Pitch stored in DB after generation | Avoids re-generating on every load; user can edit before sending | — Pending |
| API-backed operational filters + client-side search | Keeps list navigation fast without re-requesting on every keystroke | Implemented in Phase 06 |
| Detail panel patches status through the API and syncs the selected lead locally | Keeps mutations consistent without forcing a page reload | Implemented in Phase 07 |
| Outreach links are derived locally from the persisted pitch text | Keeps send actions instant while the pitch itself remains server-generated and stored | Implemented in Phase 08 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-16 after initialization*
