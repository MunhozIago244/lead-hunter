# Database Indexes

This document lists every table, its primary key, and recommended indexes with the SQL to create them. Indexes marked **[in migration]** are already included in `supabase/migrations/`. Those marked **[missing]** should be added to the next migration.

---

## `leads`

**Primary key:** `id` (UUID)

| Column | Type | Index | Status | Reason |
|--------|------|-------|--------|--------|
| `status` | enum | `idx_leads_status` | [in migration] | Dashboard filters by status constantly |
| `segment` | text | `idx_leads_segment` | [in migration] | Segment filter in `GET /api/leads` |
| `city` | text | `idx_leads_city` | [in migration] | City filter in `GET /api/leads` |
| `created_at` | timestamptz | `idx_leads_created_at` | [missing] | Default sort order for the lead list |
| `name` | text | `idx_leads_name` | [missing] | ILIKE search — GIN trigram index preferred |
| `has_site` | boolean | `idx_leads_has_site` | [missing] | `no-site` filter |

```sql
-- Missing indexes to add to the next migration:
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_has_site ON leads (has_site) WHERE has_site = false;

-- Optional: trigram index for name search (requires pg_trgm extension)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_leads_name_trgm ON leads USING gin (name gin_trgm_ops);
```

---

## `crm_accounts`

**Primary key:** `id` (UUID)

| Column | Type | Index | Status | Reason |
|--------|------|-------|--------|--------|
| `lead_id` | uuid | `idx_crm_accounts_lead_id` | [missing] | Deduplication check on conversion |
| `company_name` | text | `idx_crm_accounts_company_name` | [missing] | Deduplication check by name+city |
| `city` | text | `idx_crm_accounts_city` | [missing] | Deduplication check by name+city |
| `stage` | enum | `idx_crm_accounts_stage` | [missing] | CRM workspace filter by pipeline stage |
| `created_at` | timestamptz | `idx_crm_accounts_created_at` | [missing] | Default sort in CRM workspace |

```sql
CREATE INDEX IF NOT EXISTS idx_crm_accounts_lead_id ON crm_accounts (lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_company_name_city ON crm_accounts (company_name, city);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_stage ON crm_accounts (stage);
CREATE INDEX IF NOT EXISTS idx_crm_accounts_created_at ON crm_accounts (created_at DESC);
```

---

## `crm_contacts`

**Primary key:** `id` (UUID)

| Column | Type | Index | Status | Reason |
|--------|------|-------|--------|--------|
| `account_id` | uuid | `idx_crm_contacts_account_id` | [missing] | FK join from crm_accounts |
| `email` | text | `idx_crm_contacts_email` | [missing] | Email-based account resolution in sync |
| `phone` | text | `idx_crm_contacts_phone` | [missing] | Phone-based account resolution in sync |

```sql
CREATE INDEX IF NOT EXISTS idx_crm_contacts_account_id ON crm_contacts (account_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone ON crm_contacts (phone) WHERE phone IS NOT NULL;
```

---

## `crm_messages`

**Primary key:** `id` (UUID)

| Column | Type | Index | Status | Reason |
|--------|------|-------|--------|--------|
| `account_id` | uuid | `idx_crm_messages_account_id` | [missing] | FK join and CRM workspace messages list |
| `thread_id` | text | `idx_crm_messages_thread_id` | [missing] | Thread matching in email sync |
| `provider_message_id` | text | `idx_crm_messages_provider_message_id` | [missing] | Deduplication upsert key |
| `conversation_id` | text | `idx_crm_messages_conversation_id` | [missing] | Conversation matching in WhatsApp sync |
| `sender_identifier` | text | `idx_crm_messages_sender` | [missing] | Cross-account thread narrowing (bug fix) |

```sql
CREATE INDEX IF NOT EXISTS idx_crm_messages_account_id ON crm_messages (account_id);
CREATE INDEX IF NOT EXISTS idx_crm_messages_thread_id ON crm_messages (thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_messages_provider_message_id ON crm_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_messages_conversation_id ON crm_messages (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_messages_sender ON crm_messages (sender_identifier) WHERE sender_identifier IS NOT NULL;
```

---

## `crm_outreach_events`

**Primary key:** `id` (UUID)

| Column | Type | Index | Status | Reason |
|--------|------|-------|--------|--------|
| `account_id` | uuid | `idx_crm_outreach_events_account_id` | [missing] | FK join |
| `provider_event_id` | text | `idx_crm_outreach_events_provider_event_id` | [missing] | Deduplication upsert key |

```sql
CREATE INDEX IF NOT EXISTS idx_crm_outreach_events_account_id ON crm_outreach_events (account_id);
CREATE INDEX IF NOT EXISTS idx_crm_outreach_events_provider_event_id ON crm_outreach_events (provider_event_id) WHERE provider_event_id IS NOT NULL;
```

---

## `crm_channel_connections`

**Primary key:** `id` (UUID)

| Column | Type | Index | Status | Reason |
|--------|------|-------|--------|--------|
| `channel` | enum | `idx_crm_channel_connections_channel` | [missing] | Sync lookup by channel type |

```sql
CREATE INDEX IF NOT EXISTS idx_crm_channel_connections_channel ON crm_channel_connections (channel);
```

---

## Adding Missing Indexes

All missing indexes above should be consolidated into a single migration:

```bash
supabase migration new add_performance_indexes
```

Then add the SQL statements from each section above to the generated file and apply with:

```bash
supabase db push
```
