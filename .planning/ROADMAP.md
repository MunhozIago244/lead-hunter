# Roadmap: lead-hunter

## Overview

lead-hunter is built in 8 phases that follow the natural data flow: foundation schema first, then Python scraper (discovery → analysis → persistence), then the Next.js dashboard (API routes → lead list → lead detail → pitch). Each phase delivers a coherent, independently verifiable capability. The scraper and dashboard share Supabase as the data layer — the scraper writes, the dashboard reads.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Supabase schema and TypeScript types that the entire system shares
- [ ] **Phase 2: Scraper Discovery** - CLI that queries Google Maps and extracts raw business data
- [ ] **Phase 3: Scraper Analysis** - PageSpeed + Playwright site analysis producing scores and problems
- [ ] **Phase 4: Scraper Persistence** - Supabase upsert, deduplication, progress reporting, and resilience
- [ ] **Phase 5: Dashboard API Routes** - Next.js API layer for leads, pitch generation, and lead updates
- [ ] **Phase 6: Dashboard Lead List** - Left panel with lead list, filters, and search
- [ ] **Phase 7: Dashboard Lead Detail** - Right panel with scores, problems, contact info, and status update
- [ ] **Phase 8: Dashboard Pitch** - Pitch generation, copy, WhatsApp, and email send actions

## Phase Details

### Phase 1: Foundation
**Goal**: The shared data contract is in place — Supabase schema is deployed and TypeScript types match it exactly
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06
**Success Criteria** (what must be TRUE):
  1. Supabase `leads` table exists with all required columns and correct types
  2. Status column rejects values outside: new / contacted / replied / closed / discarded
  3. Queries on status, segment, and city use indexes (EXPLAIN confirms)
  4. Re-running the same (name, city) pair upserts instead of creating a duplicate row
  5. TypeScript compiler accepts Lead, LeadStatus, LeadUpdate types without errors
**Plans**: TBD

### Phase 2: Scraper Discovery
**Goal**: Running the CLI with --query, --city, --max returns a list of businesses fetched from Google Maps
**Depends on**: Phase 1
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06
**Success Criteria** (what must be TRUE):
  1. `python scraper.py --query "dentista" --city "Campinas" --max 20` runs without error
  2. Each result contains name, address, phone, website URL, segment, and city
  3. Running the same query twice does not produce duplicate entries (upsert by name+city)
  4. API errors trigger exponential backoff instead of hard crash
  5. Only field-masked fields are requested (no Pro SKU escalation in billing logs)
**Plans**: TBD

### Phase 3: Scraper Analysis
**Goal**: Each discovered business has quantified scores and a list of identified problems
**Depends on**: Phase 2
**Requirements**: ANAL-01, ANAL-02, ANAL-03, ANAL-04, ANAL-05, ANAL-06, ANAL-07, ANAL-08, ANAL-09
**Success Criteria** (what must be TRUE):
  1. A business with no website is saved with has_site=false, zero scores, and the standard no-presence problem
  2. A business with a site has score_mobile and score_speed populated from PageSpeed Insights
  3. Playwright check correctly detects WhatsApp button presence and OG/title tags for SEO score
  4. A CAPTCHA/blocked site saves null scores rather than fabricated data
  5. A PSI timeout or Playwright crash does not stop the run — lead is saved with null scores and error logged
**Plans**: TBD

### Phase 4: Scraper Persistence
**Goal**: Scraped leads are reliably saved to Supabase with progress feedback and graceful error handling
**Depends on**: Phase 3
**Requirements**: PERS-01, PERS-02, PERS-03, PERS-04, PERS-05
**Success Criteria** (what must be TRUE):
  1. Scraper connects to Supabase at startup and fails fast with a clear error if the key is invalid
  2. Running the same query twice updates existing records rather than creating duplicates
  3. A tqdm progress bar is visible while scraping runs
  4. Each processed company prints its name, scores obtained, and save status to the terminal
**Plans**: TBD

### Phase 5: Dashboard API Routes
**Goal**: Next.js API routes serve leads data, generate pitches via Claude, and accept lead updates
**Depends on**: Phase 1
**Requirements**: API-01, API-02, API-03, API-04, API-05
**Success Criteria** (what must be TRUE):
  1. GET /api/leads returns a JSON array of leads ordered by created_at desc, filterable by status/segment/city
  2. POST /api/pitch calls Claude with the correct prompt template and returns { pitch: string }
  3. PATCH /api/lead/[id] updates status, contact_channel, notes, or pitch without overwriting other fields
  4. All three routes return appropriate HTTP error codes (400, 404, 500) with error messages on failure
  5. Claude prompt construction does not allow lead data to escape the prompt template boundaries
**Plans**: TBD

### Phase 6: Dashboard Lead List
**Goal**: User can see and filter the lead list in the left panel of the dashboard
**Depends on**: Phase 5
**Requirements**: LIST-01, LIST-02, LIST-03, LIST-04, LIST-05, LIST-06
**Success Criteria** (what must be TRUE):
  1. Dashboard loads and shows leads from Supabase via GET /api/leads
  2. Clicking All / Critical / No site / Contacted filters update the visible lead list
  3. Typing in the search box narrows leads by name in real time without a network request
  4. Each list item shows name, segment, and a color-coded status badge
  5. The currently selected lead is visually highlighted in the list
**Plans**: TBD
**UI hint**: yes

### Phase 7: Dashboard Lead Detail
**Goal**: Selecting a lead shows its full detail — scores, problems, contact info, and status controls — in the right panel
**Depends on**: Phase 6
**Requirements**: DETL-01, DETL-02, DETL-03, DETL-04, DETL-05, DETL-06
**Success Criteria** (what must be TRUE):
  1. Detail panel shows name, segment, city, and external link to the business site
  2. Score grid shows Mobile, Speed, SEO, Design values with red/yellow/green color coding
  3. Problems list shows up to 5 identified issues for the lead
  4. "Marcar como contatado" button calls PATCH /api/lead/[id] and updates the status badge without full page reload
  5. All async actions (status update, pitch generation) show a loading indicator while pending
**Plans**: TBD
**UI hint**: yes

### Phase 8: Dashboard Pitch
**Goal**: User can generate, review, and send a personalized pitch via WhatsApp or email in one click
**Depends on**: Phase 7
**Requirements**: PITCH-01, PITCH-02, PITCH-03, PITCH-04, PITCH-05, PITCH-06, PITCH-07, PITCH-08, PITCH-09
**Success Criteria** (what must be TRUE):
  1. PitchBox shows a placeholder text when no pitch exists and the generated pitch once created
  2. "Gerar pitch" calls POST /api/pitch and displays the returned pitch; generated pitch is saved to Supabase
  3. "Regerar" overwrites the existing pitch with a new generation
  4. "Copiar" copies the pitch text to clipboard
  5. "WhatsApp" opens wa.me deep link in new tab with correctly encoded pitch and normalized Brazilian phone number
  6. "Email" opens a mailto link with subject and encoded pitch body
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/TBD | Not started | - |
| 2. Scraper Discovery | 0/TBD | Not started | - |
| 3. Scraper Analysis | 0/TBD | Not started | - |
| 4. Scraper Persistence | 0/TBD | Not started | - |
| 5. Dashboard API Routes | 0/TBD | Not started | - |
| 6. Dashboard Lead List | 0/TBD | Not started | - |
| 7. Dashboard Lead Detail | 0/TBD | Not started | - |
| 8. Dashboard Pitch | 0/TBD | Not started | - |
