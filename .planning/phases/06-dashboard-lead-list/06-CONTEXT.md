# Phase 6: Dashboard Lead List - Context

**Gathered:** 2026-04-16
**Status:** Ready for implementation

<domain>
## Phase Boundary

Phase 6 adds the first real dashboard UI on top of the API routes completed in phase 5.

This phase is responsible for:

- rendering the lead list at the home route
- loading leads through `GET /api/leads`
- exposing quick filters and select-based filters
- keeping text search local to the browser
- highlighting the selected lead and preparing the right panel for phase 7

Phase 6 does not own detail actions or pitch actions yet.
</domain>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — LIST-01 through LIST-06
- `.planning/research/ARCHITECTURE.md` — dashboard read flow and filtering boundary
- `app/api/leads/route.ts` — canonical read contract
- `types/lead.ts` — lead shape rendered by the dashboard
</canonical_refs>

<specifics>
## Specific Ideas

- Keep operational filters API-backed so list state stays canonical
- Keep free-text search local so typing feels instant
- Make the selected item visually strong because the right panel depends on it in phase 7
- Reuse status semantics from the shared lead types rather than inventing new UI-only values
</specifics>

---

*Phase: 06-dashboard-lead-list*
*Context gathered: 2026-04-16*
