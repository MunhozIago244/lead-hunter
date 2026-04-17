/**
 * TypeScript types for the CRM foundation tables.
 * Source of truth: supabase/migrations/20260416210000_create_crm_foundation_tables.sql
 * Scope: CRM Expansion Plan 01
 */

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[]

export type CrmPipelineStage =
  | 'new'
  | 'researching'
  | 'proposal_ready'
  | 'contacted'
  | 'awaiting_reply'
  | 'replied'
  | 'meeting_scheduled'
  | 'won'
  | 'lost'

export type CrmReplyStatus =
  | 'no_outreach'
  | 'awaiting_reply'
  | 'replied'
  | 'bounced'
  | 'opted_out'

export type CrmProposalStatus =
  | 'none'
  | 'draft'
  | 'ready'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired'

export type CrmOutreachChannel =
  | 'email'
  | 'whatsapp'
  | 'phone'
  | 'instagram'
  | 'website_form'
  | 'manual'

export type CrmContactRole =
  | 'owner'
  | 'manager'
  | 'reception'
  | 'commercial'
  | 'other'

export type CrmOutreachEventType =
  | 'pitch_generated'
  | 'draft_prepared'
  | 'link_opened'
  | 'marked_sent'
  | 'reply_detected'
  | 'follow_up_scheduled'
  | 'manual_note'

export type CrmMessageDirection = 'outbound' | 'inbound'

export type CrmMessageStatus =
  | 'draft'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'received'

export type CrmConnectionChannel = 'email' | 'whatsapp'

export type CrmConnectionProvider =
  | 'gmail'
  | 'outlook'
  | 'smtp'
  | 'whatsapp_business'

export type CrmConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'paused'
  | 'error'

export type CrmSyncJobType =
  | 'email_poll'
  | 'email_webhook'
  | 'whatsapp_poll'
  | 'whatsapp_webhook'
  | 'manual_backfill'

export type CrmSyncJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'partial'

export interface CrmAccount {
  id: string
  lead_id: string | null
  company_name: string
  segment: string | null
  city: string
  address: string | null
  phone: string | null
  email: string | null
  site: string | null
  lead_source: string
  score_mobile: number | null
  score_speed: number | null
  score_seo: number | null
  score_design: number | null
  stage: CrmPipelineStage
  contact_started: boolean
  proposal_status: CrmProposalStatus
  reply_status: CrmReplyStatus
  last_contact_channel: CrmOutreachChannel | null
  last_contact_at: string | null
  next_follow_up_at: string | null
  proposal_sent_at: string | null
  reply_received_at: string | null
  last_outbound_message_at: string | null
  last_inbound_message_at: string | null
  last_outbound_excerpt: string | null
  last_inbound_excerpt: string | null
  owner_name: string | null
  owner_notes: string | null
  created_at: string
  updated_at: string
}

export interface CrmContact {
  id: string
  account_id: string
  full_name: string
  role: CrmContactRole
  email: string | null
  phone: string | null
  whatsapp: string | null
  preferred_channel: CrmOutreachChannel | null
  is_primary: boolean
  contactable: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CrmDeal {
  id: string
  account_id: string
  title: string
  stage: CrmPipelineStage
  proposal_status: CrmProposalStatus
  estimated_value: number | null
  currency: string
  proposed_at: string | null
  closed_at: string | null
  lost_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CrmOutreachEvent {
  id: string
  account_id: string
  contact_id: string | null
  deal_id: string | null
  channel: CrmOutreachChannel
  event_type: CrmOutreachEventType
  subject: string | null
  body: string | null
  confirmed_sent: boolean
  reply_expected: boolean
  external_message_id: string | null
  happened_at: string
  metadata: JsonValue | null
  created_at: string
  updated_at: string
}

export interface CrmMessage {
  id: string
  account_id: string
  contact_id: string | null
  deal_id: string | null
  outreach_event_id: string | null
  channel: CrmOutreachChannel
  direction: CrmMessageDirection
  message_status: CrmMessageStatus
  provider_message_id: string | null
  thread_id: string | null
  subject: string | null
  body: string | null
  excerpt: string | null
  sender_identifier: string | null
  recipient_identifier: string | null
  sent_at: string | null
  received_at: string | null
  replied_to_message_id: string | null
  is_reply: boolean
  metadata: JsonValue | null
  created_at: string
  updated_at: string
}

export interface CrmChannelConnection {
  id: string
  channel: CrmConnectionChannel
  provider: CrmConnectionProvider
  connection_status: CrmConnectionStatus
  display_name: string | null
  external_account_id: string | null
  config: JsonValue
  last_synced_at: string | null
  last_webhook_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface CrmSyncJob {
  id: string
  connection_id: string
  account_id: string | null
  job_type: CrmSyncJobType
  job_status: CrmSyncJobStatus
  started_at: string | null
  finished_at: string | null
  cursor: string | null
  records_processed: number
  error_message: string | null
  payload: JsonValue | null
  created_at: string
  updated_at: string
}
