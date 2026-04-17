---
phase: 02-scraper-discovery
plan: 01
subsystem: google-places-discovery
tags: [python, cli, google-places, discovery]
dependency_graph:
  requires: [01-foundation]
  provides: [discovery-cli, places-search, lead-extraction]
  affects: [phase-03-scraper-analysis, phase-04-scraper-persistence]
tech_stack:
  added: []
  patterns: [single-file-cli, explicit-field-mask, query-normalization]
key_files:
  created: []
  modified:
    - scraper/scraper.py
decisions:
  - "Kept scraper discovery in a single file while the workflow is still stabilizing"
  - "Normalized `segment` from `--query` via strip + title case"
  - "Used explicit Places API field mask to avoid unnecessary response fields"
metrics:
  completed_date: "2026-04-16"
---

# Phase 02 Plan 01: Scraper Discovery Core Summary

**One-liner:** Implemented the discovery CLI, Google Places Text Search integration, and raw place-to-lead extraction.

## What Was Built

- `scraper/scraper.py` now exposes a real CLI with `--query`, `--city`, and `--max`
- Environment loading supports `scraper/.env`, project `.env.local`, or process env
- `search_places()` calls `https://places.googleapis.com/v1/places:searchText`
- `extract_lead()` maps Places results into the lead schema fields used by discovery
- `segment` is derived from `--query` using normalized title case

## Key Decisions

- The script accepts both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` to make local setup easier without duplicating config
- Runtime dependencies are checked explicitly so `python scraper.py --help` still works even if Python packages are missing
- `displayName`, `formattedAddress`, `internationalPhoneNumber`, `websiteUri`, and `businessStatus` remain the core discovery payload

## Deviations From Plan

- Plan 01 and Plan 02 were implemented together in the same edit cycle to avoid leaving `scraper.py` in an unstable half-discovery state
- The script now has safer import guards than the original plan so CLI help does not break when Python deps are absent

## Verification Results

- `python scraper/scraper.py --help` passed
- `python -m py_compile scraper/scraper.py` passed
- Mocked import-level verification confirmed `search_places()` and `extract_lead()` work with paginated fake Places responses

## Live Verification Status

- Real Google Places execution still depends on valid `GOOGLE_MAPS_API_KEY`
- Real Supabase persistence is covered in Plan 02 and still needs live credentials for end-to-end verification
