---
phase: 10-crm-conversion
status: completed-locally
created: 2026-04-16
depends_on: [09-crm-foundation]
provides: [crm-conversion-route, crm-conversion-cta]
---

# Phase 10 Context

## Goal

Convert qualified discovered leads into operational CRM accounts explicitly, not automatically.

## Why This Phase Exists

The CRM schema now exists, but the system still needs a bridge between a discovered lead and a managed company account. That bridge must:

- keep the conversion explicit
- preserve the source lead link when possible
- prefill account and contact data from the discovered lead
- avoid duplicate CRM companies when the same business appears twice

## Output

- Conversion helper logic in the app layer
- `POST /api/crm/accounts/from-lead`
- Dashboard CTA to add the selected lead into CRM
