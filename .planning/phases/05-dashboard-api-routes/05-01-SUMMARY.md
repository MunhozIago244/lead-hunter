---
phase: 05-dashboard-api-routes
plan: 01
subsystem: reads-and-updates
tags: [nextjs, route-handlers, supabase, validation]
dependency_graph:
  requires: [04-02]
  provides: [admin-supabase-client, leads-read-route, lead-patch-route]
  affects: [06-dashboard-lead-list, 07-dashboard-lead-detail]
tech_stack:
  added: []
  patterns: [uncached-json-responses, strict-payload-validation]
key_files:
  created:
    - lib/supabase/admin.ts
    - lib/api/response.ts
    - lib/leads.ts
    - app/api/leads/route.ts
    - app/api/lead/[id]/route.ts
  modified: []
decisions:
  - "Route handlers use a service-role Supabase client server-side only"
  - "PATCH payloads reject unknown fields instead of silently ignoring them"
metrics:
  completed_date: "2026-04-16"
---

# Phase 05 Plan 01: Read/Update Routes Summary

**One-liner:** Added the service-side Supabase API foundation plus `GET /api/leads` and `PATCH /api/lead/[id]`.

## What Was Built

- `createAdminClient()` centralizes server-only service-role access
- `apiJson()` / `apiError()` keep route responses uncached and structured
- `GET /api/leads` supports status, segment, city, search, and shortcut filters
- `PATCH /api/lead/[id]` validates allowed fields and performs partial updates safely

## Verification Results

- `npm run lint` passed
- `npm run typecheck` passed

## Live Verification Status

- Real Supabase-backed API calls still depend on a configured project and valid environment keys
