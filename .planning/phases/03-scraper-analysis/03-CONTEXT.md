# Phase 3: Scraper Analysis - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

After discovery finds and persists businesses, phase 3 enriches each lead with website analysis.

This phase is responsible for:

- handling leads with no site
- collecting PageSpeed mobile metrics
- inspecting sites with Playwright
- generating `score_mobile`, `score_speed`, `score_seo`, `score_design`
- producing up to 5 problems per company

Phase 3 does not own dashboard UI, pitch generation, or API routes.
</domain>

<working_assumptions>
## Working Assumptions

- Discovery remains in `scraper/scraper.py`; no module split yet
- PageSpeed runs before Playwright because it is a cheaper and more deterministic signal source
- A blocked or broken site must yield null scores, never fabricated values
- Companies without a site should still be saved and prioritized as strong leads
</working_assumptions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — ANAL-01 through ANAL-09
- `.planning/research/FEATURES.md` — lead analysis signals and weighting ideas
- `.planning/research/PITFALLS.md` — bot detection, PSI timeouts, and failure modes
- `.planning/research/STACK.md` — PageSpeed, Playwright, and dependency guidance
- `supabase/migrations/20260416000000_create_leads_table.sql` — analysis fields in the `leads` table
</canonical_refs>

<integration_points>
## Integration Points

- Input: discovered lead dicts from phase 2
- Output: enriched lead dicts with scores and problems
- Persistence target: same `leads` table via upsert
- Runtime dependencies already available in `scraper/requirements.txt`
</integration_points>

<specifics>
## Specific Ideas

- `has_site = false` should produce a deterministic problem such as `Empresa sem presença digital`
- PageSpeed mobile score is the main performance signal for local businesses
- Playwright should inspect:
  - WhatsApp CTA presence
  - meta title
  - meta description
  - OG tags
  - signs of outdated or neglected design
- Null-safe behavior matters more than aggressive scraping
</specifics>

---

*Phase: 03-scraper-analysis*
*Context gathered: 2026-04-16*
