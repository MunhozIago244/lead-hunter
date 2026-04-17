---
phase: 14-crm-workspace-safety
status: completed-locally
created: 2026-04-16
depends_on: [09-crm-foundation, 10-crm-conversion, 12-crm-email-reply-detection, 13-crm-whatsapp-reply-detection]
provides: [crm-workspace, crm-monitoring, crm-route-guardrails]
---

# Phase 14 Context

## Goal

Create the first unified CRM workspace and add operational guardrails to the most sensitive mutation routes.

## Why This Phase Exists

The CRM already has schema, conversion, and automation foundations, but it still needs:

- one surface to view pipeline, queues, timeline, and connector health together
- a direct way to update CRM account state from the workspace
- basic server-side guardrails to reduce abuse on expensive or sensitive routes

## Output

- `/crm` workspace page
- CRM account mutation route used by the workspace
- rate limiting and same-origin validation on key browser-facing mutations
