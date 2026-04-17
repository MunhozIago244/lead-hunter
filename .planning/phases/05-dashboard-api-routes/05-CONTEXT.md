# Phase 5: Dashboard API Routes - Context

**Gathered:** 2026-04-16
**Status:** Ready for implementation

<domain>
## Phase Boundary

Phase 5 adds the internal HTTP interface that the dashboard will call.

This phase is responsible for:

- reading leads through `GET /api/leads`
- updating user-owned fields through `PATCH /api/lead/[id]`
- generating and persisting pitch text through `POST /api/pitch`
- keeping Supabase service credentials and Anthropic credentials server-side only

Phase 5 does not own the visual dashboard UI yet.
</domain>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — API-01 through API-05
- `.planning/research/ARCHITECTURE.md` — canonical API surface and trust boundaries
- `.planning/research/PITFALLS.md` — prompt injection and route-level failure modes
- `types/lead.ts` — allowed mutable fields for PATCH
</canonical_refs>

<specifics>
## Specific Ideas

- Use a service-role Supabase client only on the server
- Reject unknown PATCH fields explicitly
- Wrap scraped business data inside `<business_data>` tags before Anthropic calls
- Keep route responses uncached and structured for the dashboard
</specifics>

---

*Phase: 05-dashboard-api-routes*
*Context gathered: 2026-04-16*
