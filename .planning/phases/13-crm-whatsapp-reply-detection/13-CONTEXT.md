---
phase: 13-crm-whatsapp-reply-detection
status: completed-locally
created: 2026-04-16
depends_on: [09-crm-foundation, 10-crm-conversion]
provides: [whatsapp-sync-ingestion, whatsapp-reply-detection-automation]
---

# Phase 13 Context

## Goal

Automate CRM reply detection for WhatsApp after the external connector already exists.

## Why This Phase Exists

WhatsApp is a critical outreach channel in the CRM, but it needs a dedicated ingestion layer capable of:

- ingesting normalized WhatsApp metadata from the official integration
- matching inbound and outbound messages back to CRM accounts and contacts
- persisting normalized conversation history and timeline events
- updating CRM reply state automatically after inbound responses

## Boundary

- Manual platform setup, credentials, and external webhook registration remain outside the product scope
- This phase focuses on secure backend ingestion and automated CRM updates only
- CRM phase 03 UI/pipeline work can still land later without blocking this automation slice
