---
phase: 01-foundation
plan: 02
subsystem: database-schema
tags: [sql, migration, supabase, typescript, types, schema]
dependency_graph:
  requires: []
  provides: [leads-table-schema, lead-typescript-types]
  affects: [scraper-writes, dashboard-reads, api-routes]
tech_stack:
  added: []
  patterns: [supabase-rls, postgres-enum, upsert-deduplication, trigger-updated-at]
key_files:
  created:
    - supabase/migrations/20260416000000_create_leads_table.sql
    - types/lead.ts
  modified: []
decisions:
  - "problems column stored as JSONB (array of strings in TypeScript) rather than separate table — single-table simplicity for v1"
  - "status enforced via PostgreSQL ENUM type (lead_status) rather than CHECK constraint — cleaner error messages and future-proof"
  - "service_role RLS policies added explicitly even though service_role bypasses RLS by default — documentation and future-proofing"
  - "LeadUpdate type restricts updatable fields to status, contact_channel, notes, pitch — prevents accidental overwrite of scraper-managed fields"
metrics:
  duration: 5
  completed_date: "2026-04-16"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 01 Plan 02: Leads Table Schema & TypeScript Types Summary

**One-liner:** PostgreSQL leads table with ENUM status, 3 indexes, upsert constraint, RLS policies, and mirroring TypeScript interfaces.

## What Was Built

Two files that form the shared data contract between the Python scraper and Next.js dashboard:

1. **`supabase/migrations/20260416000000_create_leads_table.sql`** — Complete DDL for the `leads` table:
   - `lead_status` ENUM type with 5 values (new, contacted, replied, closed, discarded)
   - `leads` table with all 20 columns and correct PostgreSQL types
   - CHECK constraints on score columns (0–100 range, nullable)
   - UNIQUE constraint on `(name, city)` enabling upsert deduplication
   - Indexes on `status`, `segment`, `city` for dashboard filter performance
   - `update_updated_at_column()` trigger function + trigger
   - RLS enabled with `anon_read_leads` (SELECT), `service_role_insert_leads` (INSERT), `service_role_update_leads` (UPDATE) policies

2. **`types/lead.ts`** — TypeScript interfaces:
   - `LeadStatus` union type literal (mirrors SQL enum exactly)
   - `Lead` interface with all 20 fields in snake_case (mirrors SQL column names)
   - `LeadUpdate` partial type restricting which fields the dashboard can modify

## Verification Results

- `grep -c "CREATE TABLE leads" ...` → 1
- `grep "UNIQUE (name, city)"` → match found
- `grep "idx_leads_status|idx_leads_segment|idx_leads_city" | wc -l` → 3
- `grep "ENABLE ROW LEVEL SECURITY"` → match found
- `grep "export type LeadStatus"` → match found
- `grep "export interface Lead"` → match found
- `grep "export type LeadUpdate"` → match found
- `npx tsc --noEmit` → exit 0 (no errors)

## Decisions Made

1. **problems as JSONB / string[]:** Storing problems as a JSONB array avoids a separate `lead_problems` join table. For v1 with up to 5 problems per lead, a JSONB column is simpler and performant enough.

2. **status as ENUM not CHECK:** PostgreSQL ENUM provides better error messages than a CHECK constraint and integrates cleanly with the TypeScript union type.

3. **Explicit service_role policies:** Even though `service_role` bypasses RLS by default in Supabase, the explicit policies serve as documentation of intent and guard against any future configuration changes.

4. **LeadUpdate scope:** Limited to `status`, `contact_channel`, `notes`, `pitch` — all fields a human operator modifies via the dashboard. Scraper-managed fields (name, segment, city, scores, etc.) are excluded to prevent accidental overwrites.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan produces schema/type files only. No UI or data-fetching code was created.

## Self-Check: PASSED

- `supabase/migrations/20260416000000_create_leads_table.sql` — FOUND
- `types/lead.ts` — FOUND
- Commit `df1411e` (Task 1) — FOUND
- Commit `d52c088` (Task 2) — FOUND
