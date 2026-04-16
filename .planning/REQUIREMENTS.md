# Requirements: lead-hunter

**Defined:** 2026-04-16
**Core Value:** A developer can go from "I need clients" to "I have 30 qualified leads with personalized pitches" in under an hour — without manually searching or writing cold messages.

## v1 Requirements

### Foundation

- [x] **FOUND-01**: Supabase `leads` table exists with all required columns (uuid PK, name, segment, city, address, phone, email, site, has_site, score_mobile, score_speed, score_seo, score_design, problems, pitch, status, contact_channel, notes, created_at, updated_at)
- [x] **FOUND-02**: Status column has CHECK constraint: new / contacted / replied / closed / discarded
- [x] **FOUND-03**: Indexes exist on status, segment, and city columns
- [x] **FOUND-04**: UNIQUE constraint on (name, city) to enable upsert deduplication
- [x] **FOUND-05**: RLS policy allows scraper (service_role) to insert/update and dashboard (anon) to read
- [x] **FOUND-06**: TypeScript interfaces match schema exactly (Lead, LeadStatus, LeadUpdate types)

### Scraper — Discovery

- [ ] **DISC-01**: CLI accepts --query, --city, --max flags via argparse
- [ ] **DISC-02**: Google Maps Places API (New) Text Search returns businesses for niche + city query
- [ ] **DISC-03**: Each result extracts: name, address, phone, website URL, segment, city
- [ ] **DISC-04**: Results deduplicated by name+city before saving (upsert on UNIQUE constraint)
- [ ] **DISC-05**: Rate limiting with exponential backoff on Places API errors
- [ ] **DISC-06**: Billing guard: Places API uses field masks to request only needed fields (avoids Pro SKU escalation)

### Scraper — Analysis

- [ ] **ANAL-01**: Companies without a site saved with has_site=false, zero scores, problem "Empresa sem presença digital"
- [ ] **ANAL-02**: PageSpeed Insights API called with strategy=mobile for each site URL
- [ ] **ANAL-03**: score_mobile and score_speed extracted from PSI response (0–100)
- [ ] **ANAL-04**: Playwright headless opens each site and checks for WhatsApp button/link presence
- [ ] **ANAL-05**: Playwright extracts OG tags and title meta tag for SEO score calculation (0–100)
- [ ] **ANAL-06**: score_design computed via heuristic (custom font, images, non-default template detection)
- [ ] **ANAL-07**: Up to 5 problems generated per company, ordered by impact
- [ ] **ANAL-08**: Playwright detects CAPTCHA/block pages via page.title() check — marks lead scores as null rather than fabricating data
- [ ] **ANAL-09**: Partial failures (PSI timeout, Playwright error) do not kill the run — lead saved with null scores and error logged

### Scraper — Persistence

- [ ] **PERS-01**: Scraper connects to Supabase using service_role key
- [ ] **PERS-02**: Connection validated at startup (fails fast with clear error if key invalid)
- [ ] **PERS-03**: Leads upserted (not inserted) — re-running same query updates existing records
- [ ] **PERS-04**: Progress bar shown during scraping via tqdm
- [ ] **PERS-05**: Each processed company logged: name, scores obtained, save status

### Dashboard — Lead List

- [ ] **LIST-01**: Dashboard shows leads fetched from Supabase via GET /api/leads
- [ ] **LIST-02**: Leads filterable by: All / Critical (avg score < 40) / No site / Contacted
- [ ] **LIST-03**: Text search filters leads by name in real time
- [ ] **LIST-04**: Each list item shows: name, segment, status badge (color-coded)
- [ ] **LIST-05**: Selected lead highlighted visually
- [ ] **LIST-06**: Query params status, segment, city passed to GET /api/leads

### Dashboard — Lead Detail

- [ ] **DETL-01**: Lead detail panel shows: name, segment, city, site (external link)
- [ ] **DETL-02**: Score grid (2×2) shows Mobile, Speed, SEO, Design scores with color coding (red <40, yellow 40–70, green >70)
- [ ] **DETL-03**: Problems list shows up to 5 identified issues
- [ ] **DETL-04**: Contact section shows phone and email
- [ ] **DETL-05**: "Marcar como contatado" button calls PATCH /api/lead/[id] to update status
- [ ] **DETL-06**: Loading states shown for all async actions

### Dashboard — Pitch

- [ ] **PITCH-01**: PitchBox displays current pitch text or placeholder if not yet generated
- [ ] **PITCH-02**: "Gerar pitch" button calls POST /api/pitch with lead_id
- [ ] **PITCH-03**: Claude API called with exact prompt template (name, segment, city, has_site, problems) using claude-sonnet-4-20250514, max_tokens 300
- [ ] **PITCH-04**: Generated pitch saved to leads.pitch in Supabase
- [ ] **PITCH-05**: "Regerar" button regenerates and overwrites pitch
- [ ] **PITCH-06**: "Copiar" button copies pitch to clipboard
- [ ] **PITCH-07**: "WhatsApp" button opens wa.me deep link with encoded pitch in new tab
- [ ] **PITCH-08**: "Email" button opens mailto link with subject and encoded pitch body
- [ ] **PITCH-09**: Brazilian phone numbers normalized before WhatsApp link (9th-digit rule for area codes 11–28)

### Dashboard — API Routes

- [ ] **API-01**: GET /api/leads returns leads array ordered by created_at desc, filtered by optional query params
- [ ] **API-02**: POST /api/pitch fetches lead, calls Claude API, saves pitch, returns { pitch: string }
- [ ] **API-03**: PATCH /api/lead/[id] updates status, contact_channel, notes, or pitch fields
- [ ] **API-04**: All routes handle errors with try/catch and appropriate HTTP status codes
- [ ] **API-05**: Claude prompt wraps scraped data safely to prevent prompt injection

## v2 Requirements

### Outreach Tracking

- **TRACK-01**: Contact date recorded when lead status changes to "contacted"
- **TRACK-02**: Follow-up reminder: flag leads contacted >7 days without reply
- **TRACK-03**: Notes field editable inline in dashboard

### Scraper Enhancements

- **SCR-01**: Screenshot saved to Supabase Storage for each analyzed site
- **SCR-02**: Last content date detected from blog/news sections
- **SCR-03**: Social media presence detected (Instagram, Facebook links)

### Dashboard Enhancements

- **DASH-01**: Lead count badge per filter category
- **DASH-02**: Export leads to CSV
- **DASH-03**: Bulk status update

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile app | Web dashboard sufficient; solo tool |
| Multi-user / team features | Single user tool; auth adds complexity without value |
| Automated message sending | User must always review and send manually — legal/ethical boundary |
| CRM integrations (HubSpot, Pipedrive) | Over-engineering for a solo freelancer |
| ML-based scoring | Heuristic scores are sufficient and faster to build |
| Email finding / enrichment | Not in spec; would require paid APIs |
| Real-time scraper progress in dashboard | Scraper is a CLI tool; dashboard reads completed results |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| FOUND-05 | Phase 1 | Complete |
| FOUND-06 | Phase 1 | Complete |
| DISC-01 | Phase 2 | Pending |
| DISC-02 | Phase 2 | Pending |
| DISC-03 | Phase 2 | Pending |
| DISC-04 | Phase 2 | Pending |
| DISC-05 | Phase 2 | Pending |
| DISC-06 | Phase 2 | Pending |
| ANAL-01 | Phase 3 | Pending |
| ANAL-02 | Phase 3 | Pending |
| ANAL-03 | Phase 3 | Pending |
| ANAL-04 | Phase 3 | Pending |
| ANAL-05 | Phase 3 | Pending |
| ANAL-06 | Phase 3 | Pending |
| ANAL-07 | Phase 3 | Pending |
| ANAL-08 | Phase 3 | Pending |
| ANAL-09 | Phase 3 | Pending |
| PERS-01 | Phase 4 | Pending |
| PERS-02 | Phase 4 | Pending |
| PERS-03 | Phase 4 | Pending |
| PERS-04 | Phase 4 | Pending |
| PERS-05 | Phase 4 | Pending |
| API-01 | Phase 5 | Pending |
| API-02 | Phase 5 | Pending |
| API-03 | Phase 5 | Pending |
| API-04 | Phase 5 | Pending |
| API-05 | Phase 5 | Pending |
| LIST-01 | Phase 6 | Pending |
| LIST-02 | Phase 6 | Pending |
| LIST-03 | Phase 6 | Pending |
| LIST-04 | Phase 6 | Pending |
| LIST-05 | Phase 6 | Pending |
| LIST-06 | Phase 6 | Pending |
| DETL-01 | Phase 7 | Pending |
| DETL-02 | Phase 7 | Pending |
| DETL-03 | Phase 7 | Pending |
| DETL-04 | Phase 7 | Pending |
| DETL-05 | Phase 7 | Pending |
| DETL-06 | Phase 7 | Pending |
| PITCH-01 | Phase 8 | Pending |
| PITCH-02 | Phase 8 | Pending |
| PITCH-03 | Phase 8 | Pending |
| PITCH-04 | Phase 8 | Pending |
| PITCH-05 | Phase 8 | Pending |
| PITCH-06 | Phase 8 | Pending |
| PITCH-07 | Phase 8 | Pending |
| PITCH-08 | Phase 8 | Pending |
| PITCH-09 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-16 after roadmap creation*
