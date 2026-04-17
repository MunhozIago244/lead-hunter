---
phase: 12-crm-email-reply-detection
status: completed-locally
created: 2026-04-16
depends_on: [09-crm-foundation, 10-crm-conversion]
provides: [email-sync-ingestion, reply-detection-automation]
---

# Phase 12 Context

## Goal

Automate CRM reply detection for email after the external provider connection already exists.

## Why This Phase Exists

The CRM schema can already store messages, events, connections, and sync jobs, but it still needs a backend automation layer capable of:

- ingesting normalized email metadata
- matching outbound and inbound messages back to CRM accounts
- persisting message history and timeline events
- updating derived CRM reply state automatically

## Boundary

- Manual provider setup, OAuth, and external dashboard configuration stay outside the product scope
- This phase focuses on the backend ingestion and reply-state automation layer
- CRM pipeline UI work from plan 03 can still land later without blocking this backend slice
