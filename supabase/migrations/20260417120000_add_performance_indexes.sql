-- Migration: Add performance indexes across all tables
-- See docs/database-indexes.md for rationale

-- leads
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_has_site ON leads (has_site) WHERE has_site = false;

-- crm_accounts
CREATE INDEX IF NOT EXISTS idx_crm_accounts_lead_id ON crm_accounts (lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_company_name_city ON crm_accounts (company_name, city);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_stage ON crm_accounts (stage);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_created_at ON crm_accounts (created_at DESC);

-- crm_contacts
CREATE INDEX IF NOT EXISTS idx_crm_contacts_account_id ON crm_contacts (account_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone ON crm_contacts (phone) WHERE phone IS NOT NULL;

-- crm_messages
CREATE INDEX IF NOT EXISTS idx_crm_messages_account_id ON crm_messages (account_id);
CREATE INDEX IF NOT EXISTS idx_crm_messages_thread_id ON crm_messages (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_messages_provider_message_id ON crm_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_messages_conversation_id ON crm_messages (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_messages_sender ON crm_messages (sender_identifier) WHERE sender_identifier IS NOT NULL;

-- crm_outreach_events
CREATE INDEX IF NOT EXISTS idx_crm_outreach_events_account_id ON crm_outreach_events (account_id);
CREATE INDEX IF NOT EXISTS idx_crm_outreach_events_provider_event_id ON crm_outreach_events (provider_event_id) WHERE provider_event_id IS NOT NULL;

-- crm_channel_connections
CREATE INDEX IF NOT EXISTS idx_crm_channel_connections_channel ON crm_channel_connections (channel);
