---
phase: 04-scraper-persistence
plan: 02
subsystem: cli-reporting
tags: [python, cli, reporting, resilience]
dependency_graph:
  requires: [04-01]
  provides: [per-lead-reporting, trustworthy-summary]
  affects: [05-dashboard-api-routes]
tech_stack:
  added: []
  patterns: [tqdm-safe-logging, partial-failure-accounting]
key_files:
  created:
    - .planning/phases/04-scraper-persistence/04-02-SUMMARY.md
  modified:
    - scraper/scraper.py
decisions:
  - "Per-lead logs should expose site presence, analysis status, and scores without breaking tqdm rendering"
  - "Final summary should separate extraction, analysis, and persistence errors"
  - "Exit code becomes non-zero only when the run meaningfully fails"
metrics:
  completed_date: "2026-04-16"
---

# Phase 04 Plan 02: Reporting Summary

**One-liner:** Hardened CLI reporting so each run explains what happened and when it actually failed.

## What Was Built

- `build_lead_log_message()` prints save status plus site presence, analysis state, and score block
- `print_run_summary()` shows discovered leads, valid leads, inserts, updates, and error breakdown
- `run_meaningfully_failed()` keeps partial-success runs from returning a false failure code
- The processing loop now distinguishes extraction, analysis, and persistence errors

## Verification Results

- `python scraper/scraper.py --help` passed
- `python -m py_compile scraper/scraper.py` passed
- Mocked verification confirmed:
  - updated leads log `atualizado` with score context
  - new no-site leads log `sem-site`
  - meaningful-failure logic only returns non-zero when the run has zero successful writes after discoveries

## Live Verification Status

- Full end-to-end reporting still depends on a real Supabase project, Google credentials, and working Playwright runtime
