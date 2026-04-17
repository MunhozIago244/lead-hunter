---
phase: 08-dashboard-pitch
plan: 02
subsystem: outreach-actions
tags: [react, clipboard, whatsapp, email]
dependency_graph:
  requires: [08-01]
  provides: [copy-action, whatsapp-link, email-link]
  affects: [v1-completion]
tech_stack:
  added: []
  patterns: [client-derived-send-actions, brazilian-phone-normalization]
key_files:
  created:
    - lib/outreach.ts
  modified:
    - components/dashboard/lead-pitch-box.tsx
decisions:
  - "Clipboard and deep-link actions are derived in the client from the persisted pitch text"
  - "WhatsApp URLs normalize Brazilian numbers before opening `wa.me`"
metrics:
  completed_date: "2026-04-16"
---

# Phase 08 Plan 02: Outreach Actions Summary

**One-liner:** Added copy, WhatsApp, and email actions on top of the generated pitch, including Brazilian phone normalization.

## What Was Built

- `Copiar` uses the browser clipboard API with inline feedback
- `WhatsApp` opens a `wa.me` URL in a new tab with encoded pitch text
- `Email` opens a `mailto` link with encoded subject and body
- `normalizeBrazilianWhatsAppNumber()` applies the 9th-digit rule for DDDs 11–28 before building the deep link

## Verification Results

- `npm run lint` passed
- `npm run typecheck` passed

## Live Verification Status

- Real WhatsApp/email opening depends on browser behavior and available lead contact data
