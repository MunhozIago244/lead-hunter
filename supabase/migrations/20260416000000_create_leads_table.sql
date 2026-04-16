-- Migration: Create leads table
-- Phase 1: Foundation
-- Requirements: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05

-- 1. Create status enum type
CREATE TYPE lead_status AS ENUM (
  'new',
  'contacted',
  'replied',
  'closed',
  'discarded'
);

-- 2. Create leads table (FOUND-01)
CREATE TABLE leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  segment       TEXT,
  city          TEXT NOT NULL,
  address       TEXT,
  phone         TEXT,
  email         TEXT,
  site          TEXT,
  has_site      BOOLEAN NOT NULL DEFAULT false,
  score_mobile  INTEGER CHECK (score_mobile IS NULL OR (score_mobile >= 0 AND score_mobile <= 100)),
  score_speed   INTEGER CHECK (score_speed IS NULL OR (score_speed >= 0 AND score_speed <= 100)),
  score_seo     INTEGER CHECK (score_seo IS NULL OR (score_seo >= 0 AND score_seo <= 100)),
  score_design  INTEGER CHECK (score_design IS NULL OR (score_design >= 0 AND score_design <= 100)),
  problems      JSONB,
  pitch         TEXT,
  status        lead_status NOT NULL DEFAULT 'new',  -- FOUND-02: enforced via enum type
  contact_channel TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- FOUND-04: UNIQUE constraint for upsert deduplication
  CONSTRAINT leads_name_city_unique UNIQUE (name, city)
);

-- 3. Indexes for query performance (FOUND-03)
CREATE INDEX idx_leads_status   ON leads (status);
CREATE INDEX idx_leads_segment  ON leads (segment);
CREATE INDEX idx_leads_city     ON leads (city);

-- 4. Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Row Level Security (FOUND-05)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- anon role: read-only access (dashboard using publishable key)
CREATE POLICY "anon_read_leads"
  ON leads
  FOR SELECT
  TO anon
  USING (true);

-- service_role: full access (scraper using service role key)
-- Note: service_role bypasses RLS by default in Supabase.
-- These policies are explicit for documentation and future-proofing.
CREATE POLICY "service_role_insert_leads"
  ON leads
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "service_role_update_leads"
  ON leads
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
