-- Migration: Create CRM foundation tables
-- CRM Expansion Plan 01: CRM Foundation Schema
-- Scope: Dedicated CRM operational layer on top of leads

-- 1. CRM enum types
CREATE TYPE crm_pipeline_stage AS ENUM (
  'new',
  'researching',
  'proposal_ready',
  'contacted',
  'awaiting_reply',
  'replied',
  'meeting_scheduled',
  'won',
  'lost'
);

CREATE TYPE crm_reply_status AS ENUM (
  'no_outreach',
  'awaiting_reply',
  'replied',
  'bounced',
  'opted_out'
);

CREATE TYPE crm_proposal_status AS ENUM (
  'none',
  'draft',
  'ready',
  'sent',
  'accepted',
  'rejected',
  'expired'
);

CREATE TYPE crm_outreach_channel AS ENUM (
  'email',
  'whatsapp',
  'phone',
  'instagram',
  'website_form',
  'manual'
);

CREATE TYPE crm_contact_role AS ENUM (
  'owner',
  'manager',
  'reception',
  'commercial',
  'other'
);

CREATE TYPE crm_outreach_event_type AS ENUM (
  'pitch_generated',
  'draft_prepared',
  'link_opened',
  'marked_sent',
  'reply_detected',
  'follow_up_scheduled',
  'manual_note'
);

CREATE TYPE crm_message_direction AS ENUM (
  'outbound',
  'inbound'
);

CREATE TYPE crm_message_status AS ENUM (
  'draft',
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'received'
);

CREATE TYPE crm_connection_channel AS ENUM (
  'email',
  'whatsapp'
);

CREATE TYPE crm_connection_provider AS ENUM (
  'gmail',
  'outlook',
  'smtp',
  'whatsapp_business'
);

CREATE TYPE crm_connection_status AS ENUM (
  'disconnected',
  'connected',
  'paused',
  'error'
);

CREATE TYPE crm_sync_job_type AS ENUM (
  'email_poll',
  'email_webhook',
  'whatsapp_poll',
  'whatsapp_webhook',
  'manual_backfill'
);

CREATE TYPE crm_sync_job_status AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed',
  'partial'
);

-- 2. Operational CRM account table
CREATE TABLE crm_accounts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                 UUID UNIQUE REFERENCES leads(id) ON DELETE SET NULL,
  company_name            TEXT NOT NULL,
  segment                 TEXT,
  city                    TEXT NOT NULL,
  address                 TEXT,
  phone                   TEXT,
  email                   TEXT,
  site                    TEXT,
  lead_source             TEXT NOT NULL DEFAULT 'lead_hunter',
  score_mobile            INTEGER CHECK (score_mobile IS NULL OR (score_mobile >= 0 AND score_mobile <= 100)),
  score_speed             INTEGER CHECK (score_speed IS NULL OR (score_speed >= 0 AND score_speed <= 100)),
  score_seo               INTEGER CHECK (score_seo IS NULL OR (score_seo >= 0 AND score_seo <= 100)),
  score_design            INTEGER CHECK (score_design IS NULL OR (score_design >= 0 AND score_design <= 100)),
  stage                   crm_pipeline_stage NOT NULL DEFAULT 'new',
  contact_started         BOOLEAN NOT NULL DEFAULT false,
  proposal_status         crm_proposal_status NOT NULL DEFAULT 'none',
  reply_status            crm_reply_status NOT NULL DEFAULT 'no_outreach',
  last_contact_channel    crm_outreach_channel,
  last_contact_at         TIMESTAMPTZ,
  next_follow_up_at       TIMESTAMPTZ,
  proposal_sent_at        TIMESTAMPTZ,
  reply_received_at       TIMESTAMPTZ,
  last_outbound_message_at TIMESTAMPTZ,
  last_inbound_message_at TIMESTAMPTZ,
  last_outbound_excerpt   TEXT,
  last_inbound_excerpt    TEXT,
  owner_name              TEXT,
  owner_notes             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT crm_accounts_company_city_unique UNIQUE (company_name, city)
);

-- 3. Contacts per CRM account
CREATE TABLE crm_contacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  full_name         TEXT NOT NULL,
  role              crm_contact_role NOT NULL DEFAULT 'other',
  email             TEXT,
  phone             TEXT,
  whatsapp          TEXT,
  preferred_channel crm_outreach_channel,
  is_primary        BOOLEAN NOT NULL DEFAULT false,
  contactable       BOOLEAN NOT NULL DEFAULT true,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Commercial opportunity / pipeline record
CREATE TABLE crm_deals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  stage           crm_pipeline_stage NOT NULL DEFAULT 'new',
  proposal_status crm_proposal_status NOT NULL DEFAULT 'none',
  estimated_value NUMERIC(12, 2),
  currency        TEXT NOT NULL DEFAULT 'BRL',
  proposed_at     TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  lost_reason     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Outreach events (drafted, sent, reply-detected, etc.)
CREATE TABLE crm_outreach_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  deal_id             UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  channel             crm_outreach_channel NOT NULL,
  event_type          crm_outreach_event_type NOT NULL,
  subject             TEXT,
  body                TEXT,
  confirmed_sent      BOOLEAN NOT NULL DEFAULT false,
  reply_expected      BOOLEAN NOT NULL DEFAULT false,
  external_message_id TEXT,
  happened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Normalized inbound/outbound message history
CREATE TABLE crm_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES crm_accounts(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  deal_id             UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  outreach_event_id   UUID REFERENCES crm_outreach_events(id) ON DELETE SET NULL,
  channel             crm_outreach_channel NOT NULL,
  direction           crm_message_direction NOT NULL,
  message_status      crm_message_status NOT NULL DEFAULT 'draft',
  provider_message_id TEXT,
  thread_id           TEXT,
  subject             TEXT,
  body                TEXT,
  excerpt             TEXT,
  sender_identifier   TEXT,
  recipient_identifier TEXT,
  sent_at             TIMESTAMPTZ,
  received_at         TIMESTAMPTZ,
  replied_to_message_id UUID REFERENCES crm_messages(id) ON DELETE SET NULL,
  is_reply            BOOLEAN NOT NULL DEFAULT false,
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Connector metadata (manual setup done outside the product)
CREATE TABLE crm_channel_connections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel            crm_connection_channel NOT NULL,
  provider           crm_connection_provider NOT NULL,
  connection_status  crm_connection_status NOT NULL DEFAULT 'disconnected',
  display_name       TEXT,
  external_account_id TEXT,
  config             JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at     TIMESTAMPTZ,
  last_webhook_at    TIMESTAMPTZ,
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Polling / webhook job history
CREATE TABLE crm_sync_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     UUID NOT NULL REFERENCES crm_channel_connections(id) ON DELETE CASCADE,
  account_id        UUID REFERENCES crm_accounts(id) ON DELETE SET NULL,
  job_type          crm_sync_job_type NOT NULL,
  job_status        crm_sync_job_status NOT NULL DEFAULT 'queued',
  started_at        TIMESTAMPTZ,
  finished_at       TIMESTAMPTZ,
  cursor            TEXT,
  records_processed INTEGER NOT NULL DEFAULT 0 CHECK (records_processed >= 0),
  error_message     TEXT,
  payload           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Indexes
CREATE INDEX idx_crm_accounts_stage ON crm_accounts (stage);
CREATE INDEX idx_crm_accounts_reply_status ON crm_accounts (reply_status);
CREATE INDEX idx_crm_accounts_city ON crm_accounts (city);
CREATE INDEX idx_crm_accounts_next_follow_up_at ON crm_accounts (next_follow_up_at);

CREATE INDEX idx_crm_contacts_account_id ON crm_contacts (account_id);
CREATE UNIQUE INDEX idx_crm_contacts_primary_per_account
  ON crm_contacts (account_id)
  WHERE is_primary = true;

CREATE INDEX idx_crm_deals_account_id ON crm_deals (account_id);
CREATE INDEX idx_crm_deals_stage ON crm_deals (stage);

CREATE INDEX idx_crm_outreach_events_account_id ON crm_outreach_events (account_id);
CREATE INDEX idx_crm_outreach_events_contact_id ON crm_outreach_events (contact_id);
CREATE INDEX idx_crm_outreach_events_happened_at ON crm_outreach_events (happened_at DESC);

CREATE INDEX idx_crm_messages_account_id ON crm_messages (account_id);
CREATE INDEX idx_crm_messages_contact_id ON crm_messages (contact_id);
CREATE INDEX idx_crm_messages_direction ON crm_messages (direction);
CREATE INDEX idx_crm_messages_received_at ON crm_messages (received_at DESC);
CREATE UNIQUE INDEX idx_crm_messages_provider_message_id
  ON crm_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX idx_crm_channel_connections_channel ON crm_channel_connections (channel);
CREATE INDEX idx_crm_channel_connections_status ON crm_channel_connections (connection_status);

CREATE INDEX idx_crm_sync_jobs_connection_id ON crm_sync_jobs (connection_id);
CREATE INDEX idx_crm_sync_jobs_status ON crm_sync_jobs (job_status);
CREATE INDEX idx_crm_sync_jobs_created_at ON crm_sync_jobs (created_at DESC);

-- 10. updated_at triggers (reuse function from Phase 1 foundation)
CREATE TRIGGER crm_accounts_updated_at
  BEFORE UPDATE ON crm_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER crm_contacts_updated_at
  BEFORE UPDATE ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER crm_deals_updated_at
  BEFORE UPDATE ON crm_deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER crm_outreach_events_updated_at
  BEFORE UPDATE ON crm_outreach_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER crm_messages_updated_at
  BEFORE UPDATE ON crm_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER crm_channel_connections_updated_at
  BEFORE UPDATE ON crm_channel_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER crm_sync_jobs_updated_at
  BEFORE UPDATE ON crm_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 11. RLS
ALTER TABLE crm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_outreach_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Access stays private by default until CRM auth is introduced.
-- service_role bypasses RLS in Supabase; explicit policies keep the contract documented.
CREATE POLICY "service_role_manage_crm_accounts"
  ON crm_accounts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_manage_crm_contacts"
  ON crm_contacts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_manage_crm_deals"
  ON crm_deals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_manage_crm_outreach_events"
  ON crm_outreach_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_manage_crm_messages"
  ON crm_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_manage_crm_channel_connections"
  ON crm_channel_connections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_manage_crm_sync_jobs"
  ON crm_sync_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
