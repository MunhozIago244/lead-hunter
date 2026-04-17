---
phase: 04-scraper-persistence
plan: 01
subsystem: persistence-guards
tags: [python, supabase, upsert, ownership]
dependency_graph:
  requires: [03-02]
  provides: [supabase-startup-validation, user-field-preservation]
  affects: [04-02, 05-dashboard-api-routes]
tech_stack:
  added: []
  patterns: [fail-fast-validation, field-ownership-preservation]
key_files:
  created:
    - .planning/phases/04-scraper-persistence/04-01-SUMMARY.md
  modified:
    - scraper/scraper.py
decisions:
  - "Supabase is validated before any external API call to fail fast on bad configuration"
  - "Re-scrapes preserve dashboard-owned fields even when scraper-owned fields are refreshed"
metrics:
  completed_date: "2026-04-16"
---

# Phase 04 Plan 01: Persistence Guards Summary

**One-liner:** Added startup Supabase validation and explicit preservation of user-owned fields during re-scrapes.

## What Was Built

- `validate_supabase_connection()` confirms access to the `leads` table before expensive scraping work starts
- `get_existing_lead_row()` loads the current user-owned fields for an existing lead
- `merge_user_owned_fields()` preserves `pitch`, `status`, `contact_channel`, and `notes`
- `LEAD_UPSERT_FIELDS` now reflects both scraper-owned and user-owned database fields, while runtime-only fields remain excluded

## Verification Results

- `python -m py_compile scraper/scraper.py` passed
- Mocked validation confirmed:
  - Supabase startup validation succeeds on healthy client
  - invalid client raises a clear runtime error
  - existing lead upserts preserve `pitch`, `status`, `contact_channel`, and `notes`

## Live Verification Status

- Real Supabase validation still depends on a configured project and valid service role key
