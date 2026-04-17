---
phase: 05-dashboard-api-routes
plan: 02
subsystem: pitch-generation
tags: [nextjs, anthropic, prompt-safety, persistence]
dependency_graph:
  requires: [05-01]
  provides: [pitch-route, prompt-builder]
  affects: [08-dashboard-pitch]
tech_stack:
  added:
    - "@anthropic-ai/sdk"
  patterns: [prompt-injection-defense, atomic-route-persistence]
key_files:
  created:
    - lib/pitch.ts
    - app/api/pitch/route.ts
  modified:
    - package.json
    - .env.example
decisions:
  - "Pitch generation stays server-side so `ANTHROPIC_API_KEY` never reaches the browser"
  - "Business data is wrapped in `<business_data>` and treated as untrusted input"
metrics:
  completed_date: "2026-04-16"
---

# Phase 05 Plan 02: Pitch Route Summary

**One-liner:** Added `POST /api/pitch` with Anthropic generation, prompt sanitization, and Supabase persistence.

## What Was Built

- Added `@anthropic-ai/sdk` to the Next.js app
- Documented `ANTHROPIC_API_KEY` in `.env.example`
- `buildPitchPrompt()` sanitizes lead data and wraps it inside `<business_data>`
- `POST /api/pitch` loads the lead, calls Anthropic, saves `leads.pitch`, and returns `{ pitch }`

## Verification Results

- `npm run lint` passed
- `npm run typecheck` passed

## Live Verification Status

- Real pitch generation still depends on `ANTHROPIC_API_KEY` and a valid Supabase project
