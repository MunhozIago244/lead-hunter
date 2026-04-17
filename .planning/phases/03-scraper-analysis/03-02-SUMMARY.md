---
phase: 03-scraper-analysis
plan: 02
subsystem: playwright-heuristics
tags: [python, playwright, heuristics, scoring, resilience]
dependency_graph:
  requires: [03-01]
  provides: [playwright-analysis, heuristic-design-score, ordered-problems]
  affects: [04-scraper-persistence, 05-dashboard-api-routes]
tech_stack:
  added: []
  patterns: [blocked-site-detection, partial-failure-handling, sanitized-upsert-payloads]
key_files:
  created:
    - .planning/phases/03-scraper-analysis/03-02-SUMMARY.md
  modified:
    - scraper/scraper.py
decisions:
  - "Blocked or CAPTCHA pages produce null scores instead of fabricated analysis data"
  - "Problem generation is capped at five items and ordered by sales impact"
  - "Runtime-only analysis markers stay internal and are stripped before Supabase upsert"
metrics:
  completed_date: "2026-04-16"
---

# Phase 03 Plan 02: Playwright Analysis Summary

**One-liner:** Added Playwright-based site heuristics, ordered problem generation, and safe handling for blocked or partially failed analyses.

## What Was Built

- `analyze_with_playwright()` opens the site, checks WhatsApp CTA presence, reads title/description/OG signals, and inspects basic visual freshness heuristics
- `detect_blocked_page()` marks CAPTCHA/challenge/login pages so the scraper saves null scores instead of bad data
- `compute_seo_score()` now combines PSI SEO with on-page metadata completeness
- `compute_design_score()` uses responsiveness, favicon, HTTPS, custom font, image, alt-text, and freshness signals
- `build_problems()` creates up to 5 ordered issues per lead
- `sanitize_lead_for_storage()` strips internal analysis markers before upsert so Supabase only receives schema-safe fields

## Key Decisions

- Social-profile URLs are treated as a strong lead signal with deterministic zeroed scores instead of being sent to Playwright
- Partial analysis failures log warnings but still save the lead
- Design score stays null when there are not enough browser-derived signals to justify a real heuristic score

## Verification Results

- `python -m py_compile scraper/scraper.py` passed
- `python scraper/scraper.py --help` passed
- Grep verification confirmed:
  - `def analyze_with_playwright`
  - `def build_problems`
  - `Empresa sem presença digital`
- Mocked verification confirmed:
  - no-site leads keep the deterministic fallback
  - social-profile URLs receive deterministic zeroed scores
  - blocked sites return null scores
  - PSI timeout + Playwright error do not abort persistence flow
  - upserts exclude runtime-only keys

## Live Verification Status

- Real browser execution is still pending; Playwright Chromium launch timed out in this session environment
- Full end-to-end validation still depends on valid Google Places, PageSpeed, Supabase, and local Playwright runtime setup
