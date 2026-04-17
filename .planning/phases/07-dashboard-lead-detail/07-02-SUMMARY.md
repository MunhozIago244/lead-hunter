---
phase: 07-dashboard-lead-detail
plan: 02
subsystem: detail-mutations
tags: [react, patch, status, ux]
dependency_graph:
  requires: [07-01]
  provides: [status-action, local-detail-sync]
  affects: [08-dashboard-pitch]
tech_stack:
  added: []
  patterns: [route-driven-mutation, local-state-merge]
key_files:
  created: []
  modified:
    - components/dashboard/lead-detail-panel.tsx
    - components/dashboard/lead-list-dashboard.tsx
decisions:
  - "Status updates go through the existing PATCH route rather than direct Supabase writes"
  - "The returned lead object is merged into list state so the UI updates without reload"
metrics:
  completed_date: "2026-04-16"
---

# Phase 07 Plan 02: Status Flow Summary

**One-liner:** Added the first real dashboard mutation flow by letting the user mark a lead as contacted directly from the detail panel.

## What Was Built

- `Marcar como contatado` calls `PATCH /api/lead/[id]`
- Button, success, and error states are rendered inline in the right panel
- Local list state is updated with the returned lead so badges and detail stay synchronized
- Active filter slices remain coherent after the local status change

## Verification Results

- `npm run lint` passed
- `npm run typecheck` passed

## Live Verification Status

- Real mutation verification still depends on a configured Supabase project with writable rows
