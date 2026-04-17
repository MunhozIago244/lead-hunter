# Phase 8: Dashboard Pitch - Context

**Gathered:** 2026-04-16
**Status:** Ready for implementation

<domain>
## Phase Boundary

Phase 8 completes the v1 dashboard workflow by turning analysis into an actionable outreach draft.

This phase is responsible for:

- rendering a pitch box inside the detail panel
- generating and re-generating pitch text through `POST /api/pitch`
- keeping the generated pitch synchronized in local dashboard state
- supporting copy-to-clipboard
- opening WhatsApp and email with the current pitch content
- normalizing Brazilian phone numbers for `wa.me` links

Phase 8 does not own automated sending or CRM integrations.
</domain>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — PITCH-01 through PITCH-09
- `.planning/research/ARCHITECTURE.md` — pitch generation flow and trust boundaries
- `app/api/pitch/route.ts` — canonical generation contract
- `lib/pitch.ts` — prompt building and Anthropic integration
</canonical_refs>

<specifics>
## Specific Ideas

- Keep generation server-side so Anthropic credentials never leave the server
- Treat send actions as client-derived affordances from the persisted pitch text
- Reuse the selected lead from the detail panel instead of fetching separate pitch state
- Normalize Brazilian WhatsApp numbers before building links so older 10-digit inputs still work
</specifics>

---

*Phase: 08-dashboard-pitch*
*Context gathered: 2026-04-16*
