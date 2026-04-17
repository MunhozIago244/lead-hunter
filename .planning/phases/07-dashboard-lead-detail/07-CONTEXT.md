# Phase 7: Dashboard Lead Detail - Context

**Gathered:** 2026-04-16
**Status:** Ready for implementation

<domain>
## Phase Boundary

Phase 7 turns the right column from a preview into an operational detail panel.

This phase is responsible for:

- rendering full lead detail for the selected item
- showing score cards, identified problems, and contact information
- exposing the business site as an external link when available
- updating lead status through `PATCH /api/lead/[id]`
- showing loading and error states for detail-side async actions

Phase 7 does not own pitch generation or outreach actions yet.
</domain>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — DETL-01 through DETL-06
- `.planning/research/ARCHITECTURE.md` — dashboard read/update flow
- `app/api/lead/[id]/route.ts` — canonical mutation contract
- `types/lead.ts` — shape of detail data
</canonical_refs>

<specifics>
## Specific Ideas

- Keep detail rendering local to the selected lead from phase 6 instead of creating a new fetch path
- Make score color coding visually obvious and consistent with list urgency semantics
- Treat status mutation as the first real interactive workflow in the dashboard
- Keep the right panel ready to host pitch controls in phase 8
</specifics>

---

*Phase: 07-dashboard-lead-detail*
*Context gathered: 2026-04-16*
