# CRM Expansion Plan

**Project:** lead-hunter
**Created:** 2026-04-16
**Scope:** Extend the current lead-hunter system into an operational CRM for prospecting and follow-up management
**Status:** Plans 01-02 and 04-06 implemented locally; Plan 03 pending

---

## Current Data Request Flow Review

The current system already has a strong v1 base for CRM evolution, but it is still lead-centric rather than relationship-centric.

### What already exists

- `scraper/scraper.py` discovers companies and enriches the lead record with site, phone, scores, and problems
- Supabase `leads` is the single source of truth for the current product
- `GET /api/leads` returns filtered lead data for the dashboard
- `PATCH /api/lead/[id]` updates `status`, `contact_channel`, `notes`, and `pitch`
- `POST /api/pitch` generates and persists the proposal text
- Dashboard supports list, detail, status update, pitch generation, and outbound deep links

### What is missing for CRM behavior

- No separation between a raw scraped lead and a managed CRM account/contact lifecycle
- No first-class concept of outreach attempts, replies, or follow-up timelines
- No thread/message history table
- No inbox sync state for email or WhatsApp
- No webhook ingestion or polling jobs for reply detection
- No verification model for “proposal sent / replied / waiting / bounced / unread”

### Architectural conclusion

The current `leads` table should remain as the discovery/intelligence layer, but a CRM layer should be added on top rather than trying to overload `leads` with every relationship concern.

Recommended principle:

- `leads` = discovery and qualification
- CRM tables = communication, engagement, reply detection, pipeline state

---

## CRM Goals

Build a CRM inside the system that can:

1. Track the essential business/account data
2. Record whether outreach has already happened
3. Store proposals and conversation events
4. Detect whether a reply was received from email or WhatsApp
5. Automate reply verification after the user connects platforms manually
6. Keep manual platform connection setup outside the product scope for now

---

## CRM Data Model Direction

Recommended new entities:

- `crm_accounts`
  - One CRM-managed company record linked to a discovered lead
- `crm_contacts`
  - Contact points per company (owner, reception, email, WhatsApp)
- `crm_deals`
  - Commercial opportunity/pipeline record
- `crm_outreach_events`
  - Every outreach action: pitch generated, email sent, WhatsApp sent, manual follow-up
- `crm_messages`
  - Normalized inbound/outbound message history from synced channels
- `crm_channel_connections`
  - Metadata about configured email/WhatsApp integrations
- `crm_sync_jobs`
  - Polling/webhook processing state

Recommended essential CRM fields:

- company name
- segment
- city
- phone
- email
- site
- lead source
- qualification scores
- current pipeline stage
- last contact date
- next follow-up date
- last outbound message
- reply status
- reply received at
- proposal status
- owner/internal notes

---

## What stays manual with you

The system should be prepared to automate reply detection after connection, but these parts stay manual for now:

- creating Meta/WhatsApp Business app credentials
- creating email provider credentials and OAuth/app-password setup
- configuring webhook endpoints in external dashboards
- reviewing legal/compliance requirements for message monitoring

The product should only consume the resulting tokens/configuration and expose health/status once connected.

---

## 6 Plans

### PLAN 01 — CRM Foundation Schema

**Goal:** Introduce a dedicated CRM data layer on top of `leads`

**Why first:** The current table is insufficient for lifecycle tracking. We need normalized CRM entities before building UI or automation.

**Deliverables**

- Supabase migrations for:
  - `crm_accounts`
  - `crm_contacts`
  - `crm_deals`
  - `crm_outreach_events`
  - `crm_messages`
  - `crm_channel_connections`
  - `crm_sync_jobs`
- TypeScript types aligned with the schema
- Foreign keys linking CRM records back to `leads`
- Status/stage enums for CRM pipeline

**Key decisions**

- `leads` remains the intelligence source
- `crm_accounts` becomes the operational source for sales workflow
- communication history must not be stored inside `notes`

**Success criteria**

- One discovered lead can be promoted into one CRM account
- Outreach history and reply history can be stored without mutating the raw discovery schema

**Execution status:** Implemented locally on 2026-04-16 with Supabase migration + shared TypeScript types

---

### PLAN 02 — Lead-to-CRM Conversion Flow

**Goal:** Convert qualified discovered leads into managed CRM accounts

**Why here:** Not every scraped lead should automatically become an active CRM company.

**Deliverables**

- `POST /api/crm/accounts/from-lead`
- conversion logic from `leads` to `crm_accounts` + default primary contact
- deduplication rules to avoid creating duplicate CRM accounts for the same company
- dashboard CTA such as “Adicionar ao CRM”
- CRM ownership fields like:
  - pipeline stage
  - contact started?
  - proposal created?

**Key decisions**

- conversion should be explicit, not automatic
- source lead id should always be preserved for traceability

**Success criteria**

- User can move a selected lead into CRM with essential fields prefilled
- CRM record is visible independently of the raw scraping flow

**Execution status:** Implemented locally on 2026-04-16 with conversion helper, API route, and dashboard CTA

---

### PLAN 03 — CRM Pipeline and Outreach Tracking

**Goal:** Manage the real commercial lifecycle of each company

**Why here:** After conversion, the system needs to track whether contact happened and what stage the company is in.

**Deliverables**

- CRM stages such as:
  - `new`
  - `researching`
  - `proposal_ready`
  - `contacted`
  - `awaiting_reply`
  - `replied`
  - `meeting_scheduled`
  - `won`
  - `lost`
- UI for:
  - last contact date
  - next follow-up date
  - contact channel used
  - manual notes
  - reply status
- `crm_outreach_events` writes for:
  - pitch generated
  - email opened manually
  - WhatsApp link opened manually
  - user-marked message sent

**Key decisions**

- opening a deep link is not the same as confirmed delivery
- the system should distinguish:
  - draft created
  - sent by user
  - reply detected

**Success criteria**

- A company’s CRM card clearly answers:
  - was contact already made?
  - by which channel?
  - when?
  - are we waiting for a reply?

---

### PLAN 04 — Email Reply Detection Automation

**Goal:** Automatically detect whether a proposal sent by email received a reply

**Why here:** Email is the easiest first channel for reliable automation.

**Deliverables**

- connection model in `crm_channel_connections` for email providers
- ingestion path for outbound/inbound email metadata
- polling or webhook processing into `crm_messages`
- message matching logic:
  - map replies to the correct CRM account/deal/outreach event
- derived CRM flags:
  - `reply_detected`
  - `reply_received_at`
  - `last_inbound_message_at`
  - `last_inbound_excerpt`

**Automation boundary**

- user handles provider connection manually
- system automates sync, mapping, and CRM state updates after connection exists

**Success criteria**

- A reply email automatically marks the CRM account as `replied`
- Timeline shows inbound email event without manual data entry

**Execution status:** Implemented locally on 2026-04-16 with secure email sync route, CRM message persistence, outreach event creation, and derived reply-state updates

---

### PLAN 05 — WhatsApp Reply Detection Automation

**Goal:** Detect reply signals from WhatsApp after the user manually connects the official platform

**Why here:** WhatsApp is commercially critical, but operationally more sensitive than email.

**Deliverables**

- WhatsApp connection metadata model in `crm_channel_connections`
- normalized WhatsApp message storage in `crm_messages`
- webhook/polling processors for inbound/outbound message events
- mapping logic between phone number and CRM account/contact
- derived CRM flags:
  - WhatsApp proposal sent?
  - WhatsApp reply received?
  - last inbound WhatsApp timestamp

**Important note**

- this should be designed for official integration inputs
- no automation should assume scraping personal inboxes or unsupported channels

**Success criteria**

- Once the connection exists, inbound WhatsApp replies update the CRM automatically
- User can see whether the proposal received an answer without manually checking the chat every time

**Execution status:** Implemented locally on 2026-04-16 with secure WhatsApp sync route, normalized message persistence, phone-based CRM matching, and derived reply-state updates

---

### PLAN 06 — CRM Workspace, Monitoring, and Safety Controls

**Goal:** Create the unified CRM workspace and operational guardrails

**Why last:** After schema, conversion, pipeline, and automation exist, the system needs one coherent CRM surface.

**Deliverables**

- CRM dashboard views:
  - pipeline board
  - company detail
  - timeline/history
  - “awaiting reply” queue
  - “follow-up due” queue
- sync health widgets for email/WhatsApp connectors
- operational audit trail for:
  - who triggered generation
  - what was sent
  - what reply was detected
  - when status changed
- security controls:
  - route auth
  - scoped access to CRM mutation endpoints
  - rate limiting on expensive sync/generation flows
  - origin validation for mutating endpoints

**Success criteria**

- User can manage the entire company lifecycle in one place
- CRM clearly separates:
  - raw lead data
  - commercial actions
  - communication history
  - reply monitoring state

**Execution status:** Implemented locally on 2026-04-16 with `/crm` workspace, connector health widgets, combined timeline, CRM account editing route, same-origin mutation checks, and in-memory rate limiting

---

## Recommended Execution Order

1. PLAN 01 — CRM Foundation Schema
2. PLAN 02 — Lead-to-CRM Conversion Flow
3. PLAN 03 — CRM Pipeline and Outreach Tracking
4. PLAN 04 — Email Reply Detection Automation
5. PLAN 05 — WhatsApp Reply Detection Automation
6. PLAN 06 — CRM Workspace, Monitoring, and Safety Controls

---

## Risks to acknowledge now

- The current system has no auth hardening yet, so CRM work should not be built on top of the current public mutation posture without fixing protection first
- Email automation is operationally easier than WhatsApp automation; WhatsApp should be treated as a separate integration track
- Reply detection requires canonical outbound message registration; otherwise the system cannot know whether an inbound message is a reply to a proposal
- CRM state should never depend only on the current `status` field in `leads`; it needs its own richer lifecycle model

---

## Bottom Line

The current product is ready to become a CRM, but only if we add a proper CRM layer instead of stretching the `leads` table further.

Best path:

- keep `leads` for discovery
- add CRM tables for relationship management
- automate reply verification after manual channel connection
- centralize company lifecycle, outreach, and reply monitoring in a dedicated CRM workspace
