---
phase: 03-scraper-analysis
plan: 01
subsystem: pagespeed-mobile
tags: [python, pagespeed, analysis, scoring]
dependency_graph:
  requires: [02-02]
  provides: [no-site-fallback, pagespeed-mobile-analysis]
  affects: [03-02, 04-scraper-persistence]
tech_stack:
  added: []
  patterns: [null-safe-analysis, deterministic-no-site-defaults, lighthouse-score-normalization]
key_files:
  created: []
  modified:
    - scraper/scraper.py
decisions:
  - "Companies without a site receive deterministic zeroed scores plus a single high-signal problem"
  - "PageSpeed mobile performance is the first quantitative analysis signal added to the scraper"
  - "When PSI fails, the scraper keeps null-safe scores instead of aborting the run"
metrics:
  completed_date: "2026-04-16"
---

# Phase 03 Plan 01: PageSpeed Analysis Summary

**One-liner:** Added no-site fallback enrichment and mobile PageSpeed analysis to the scraper pipeline.

## What Was Built

- `build_no_site_analysis()` sets deterministic scores and problem list for leads without a website
- `analyze_pagespeed()` calls PageSpeed Insights v5 with `strategy=mobile`
- `normalize_score()` converts Lighthouse 0-1 scores into 0-100 integers
- `enrich_lead()` now merges discovery output with either no-site defaults or PageSpeed analysis before persistence
- The runtime env contract now includes `PAGESPEED_API_KEY`

## Key Decisions

- `score_mobile` uses the PageSpeed performance category score
- `score_speed` uses the `speed-index` audit score and falls back to performance if unavailable
- `score_seo` is populated early from the PSI SEO category even before Playwright-based SEO heuristics are added
- PSI request failures return null-safe values and an internal `pagespeed_error` marker instead of crashing the scrape

## Deviations From Plan

- `score_seo` is already enriched in this step from PageSpeed because the API makes it available with almost no additional complexity
- The analysis payload includes `pagespeed_error` internally so later persistence/reporting work can inspect failures if needed

## Verification Results

- `python scraper/scraper.py --help` passed
- `python -m py_compile scraper/scraper.py` passed
- Mocked analysis verification confirmed:
  - `score_mobile = 42`
  - `score_speed = 31`
  - `score_seo = 88`
  - no-site fallback returns `Empresa sem presença digital`

## Live Verification Status

- Real PSI execution still depends on `PAGESPEED_API_KEY`
- Full end-to-end validation still depends on valid Google Places and Supabase credentials
