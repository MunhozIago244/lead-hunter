---
phase: 02-scraper-discovery
plan: 02
subsystem: persistence-and-resilience
tags: [python, supabase, upsert, pagination, backoff, tqdm]
dependency_graph:
  requires: [02-01]
  provides: [paginated-discovery, resilient-fetch, supabase-upsert, terminal-reporting]
  affects: [phase-03-scraper-analysis, phase-04-scraper-persistence]
tech_stack:
  added: []
  patterns: [nextPageToken, exponential-backoff, upsert-by-name-city, tqdm-progress]
key_files:
  created: []
  modified:
    - scraper/scraper.py
decisions:
  - "Used `nextPageToken` pagination directly in the discovery loop"
  - "Added exponential backoff for transient Places API failures"
  - "Persisted leads via `on_conflict=\"name,city\"` to match the phase 1 unique constraint"
  - "Kept per-lead terminal logging with `tqdm.write()` so the progress bar stays readable"
metrics:
  completed_date: "2026-04-16"
---

# Phase 02 Plan 02: Discovery Persistence Summary

**One-liner:** Implemented paginated discovery, exponential backoff, Supabase upsert, progress reporting, and final CLI summary output.

## What Was Built

- `fetch_with_backoff()` retries transient Places API failures with exponential delay
- `search_places()` now follows `nextPageToken` until `--max` is reached
- `save_lead()` checks whether a lead already exists and upserts with `on_conflict="name,city"`
- The CLI prints `[N/MAX] Nome — salvo/atualizado` while a `tqdm` progress bar advances
- A final summary line reports `Concluído: X novos, Y atualizados, Z erros`

## Key Decisions

- Used `tqdm.write()` for per-lead logs instead of raw `print()` to preserve progress bar rendering
- Counted extraction failures separately from persistence failures so terminal output stays honest
- Returned exit code `1` only when runtime execution actually fails beyond skipped extraction issues

## Deviations From Plan

- The script validates runtime dependencies before execution instead of assuming the Python environment is already ready
- Import handling was hardened because the local `supabase/` folder can shadow the installed `supabase-py` package when importing the module from the repo root

## Verification Results

- `python scraper/scraper.py --help` passed
- `python -m py_compile scraper/scraper.py` passed
- A mocked end-to-end verification confirmed:
  - paginated `search_places()`
  - `extract_lead()` website detection
  - `save_lead()` returning `salvo` on insert and `atualizado` on duplicate upsert
- Local output matched the expected log style and final summary behavior

## Live Verification Status

- Real Google Places calls still require valid `GOOGLE_MAPS_API_KEY`
- Real Supabase writes still require a valid project URL and service role key
- Because those credentials were not available in this session, phase 2 is implemented locally but still pending live end-to-end verification
