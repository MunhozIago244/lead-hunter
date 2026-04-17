# Phase 4: Scraper Persistence - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 hardens how the scraper persists and reports enriched leads.

Even though discovery already writes leads in phase 2, this phase focuses on production-like persistence behavior:

- validating Supabase connectivity at startup
- protecting user-owned fields during re-scrapes
- making logs and summary output trustworthy
- ensuring partial failures are visible without aborting the run
</domain>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — PERS-01 through PERS-05
- `.planning/research/ARCHITECTURE.md` — scraper-owned vs user-owned field ownership
- `.planning/research/PITFALLS.md` — Supabase key confusion, RLS, and upsert edge cases
- `types/lead.ts` — user-owned fields that must not be overwritten
</canonical_refs>

<specifics>
## Specific Ideas

- Run a lightweight Supabase validation before the expensive scrape work
- Keep progress reporting readable when errors occur mid-run
- Distinguish between discovery failures, analysis failures, and persistence failures in the summary
- Preserve `pitch`, `status`, `contact_channel`, and `notes` on re-scrape
</specifics>

---

*Phase: 04-scraper-persistence*
*Context gathered: 2026-04-16*
