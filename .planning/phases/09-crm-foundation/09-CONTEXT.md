---
phase: 09-crm-foundation
status: completed-locally
created: 2026-04-16
depends_on: [08-dashboard-pitch]
provides: [crm-schema, crm-types, crm-layer]
---

# Phase 09 Context

## Goal

Introduce a dedicated CRM operational layer on top of the existing `leads` discovery layer.

## Why This Phase Exists

The current product already discovers, qualifies, and pitches leads, but it still stores the commercial workflow in lead-oriented fields such as `status`, `contact_channel`, `notes`, and `pitch`. That is enough for v1 outreach, but it is not enough for a CRM that needs:

- account lifecycle
- contact ownership
- proposal tracking
- message history
- reply detection
- channel sync metadata

## Boundaries

- `leads` remains the raw discovery and qualification source
- CRM data is additive and does not replace the existing lead pipeline
- Manual connection work for email and WhatsApp stays outside product scope
- This phase does not add routes or UI yet; it only creates the foundation schema and shared TypeScript contracts

## Output

- Supabase CRM migration
- Shared CRM TypeScript types
- Documentation trail for the next CRM phases
