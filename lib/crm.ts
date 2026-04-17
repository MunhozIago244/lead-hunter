import type { SupabaseClient } from '@supabase/supabase-js'

import { isUuid } from '@/lib/leads'
import type {
  CrmAccount,
  CrmContact,
  CrmOutreachChannel,
  CrmPipelineStage,
  CrmProposalStatus,
  CrmReplyStatus,
} from '@/types/crm'
import type { Lead, LeadStatus } from '@/types/lead'

export const CRM_CONVERSION_RESULT_VALUES = [
  'created',
  'existing_lead',
  'existing_company',
] as const

export type CrmConversionResult =
  (typeof CRM_CONVERSION_RESULT_VALUES)[number]

export type CreateCrmAccountFromLeadInput = {
  leadId: string
}

export type CreateCrmAccountFromLeadResult = {
  account: CrmAccount
  primaryContact: CrmContact | null
  conversion: CrmConversionResult
  sourceLeadId: string
}

function sanitizeText(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return null
  }

  const normalized = value.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return null
  }

  return normalized.slice(0, maxLength)
}

function truncateText(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return null
  }

  const normalized = value.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return null
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized
}

function normalizeCrmChannel(
  value: string | null | undefined
): CrmOutreachChannel | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (normalized.includes('mail')) {
    return 'email'
  }

  if (normalized.includes('whats') || normalized.includes('zap')) {
    return 'whatsapp'
  }

  if (normalized.includes('phone') || normalized.includes('telefone')) {
    return 'phone'
  }

  if (normalized.includes('insta')) {
    return 'instagram'
  }

  if (normalized.includes('site') || normalized.includes('form')) {
    return 'website_form'
  }

  return 'manual'
}

function inferPipelineStage(status: LeadStatus): CrmPipelineStage {
  if (status === 'replied') {
    return 'replied'
  }

  if (status === 'contacted') {
    return 'contacted'
  }

  if (status === 'discarded') {
    return 'lost'
  }

  return 'new'
}

function inferReplyStatus(status: LeadStatus): CrmReplyStatus {
  if (status === 'replied') {
    return 'replied'
  }

  if (status === 'contacted') {
    return 'awaiting_reply'
  }

  return 'no_outreach'
}

function inferProposalStatus(lead: Lead): CrmProposalStatus {
  return lead.pitch ? 'ready' : 'none'
}

function inferContactStarted(lead: Lead) {
  return (
    lead.status === 'contacted' ||
    lead.status === 'replied' ||
    Boolean(sanitizeText(lead.contact_channel, 120))
  )
}

function buildPrimaryContactName(lead: Lead) {
  return truncateText(lead.name, 160) ?? 'Contato principal'
}

function buildAccountInsertPayload(lead: Lead) {
  const lastContactChannel = normalizeCrmChannel(lead.contact_channel)
  const proposalStatus = inferProposalStatus(lead)

  return {
    lead_id: lead.id,
    company_name: lead.name,
    segment: sanitizeText(lead.segment, 160),
    city: lead.city,
    address: sanitizeText(lead.address, 240),
    phone: sanitizeText(lead.phone, 80),
    email: sanitizeText(lead.email, 160),
    site: sanitizeText(lead.site, 240),
    lead_source: 'lead_hunter',
    score_mobile: lead.score_mobile,
    score_speed: lead.score_speed,
    score_seo: lead.score_seo,
    score_design: lead.score_design,
    stage: inferPipelineStage(lead.status),
    contact_started: inferContactStarted(lead),
    proposal_status: proposalStatus,
    reply_status: inferReplyStatus(lead.status),
    last_contact_channel: lastContactChannel,
    owner_notes: sanitizeText(lead.notes, 5000),
    last_outbound_excerpt:
      proposalStatus !== 'none' ? truncateText(lead.pitch, 240) : null,
  }
}

function buildAccountPatchPayload(account: CrmAccount, lead: Lead) {
  const patch: Record<string, unknown> = {}
  const nextChannel = normalizeCrmChannel(lead.contact_channel)
  const nextStage = inferPipelineStage(lead.status)
  const nextReplyStatus = inferReplyStatus(lead.status)
  const nextProposalStatus = inferProposalStatus(lead)
  const nextContactStarted = inferContactStarted(lead)

  // lead_id is immutable once set — it is the identity link between CRM account and lead.
  if (!account.lead_id) {
    patch.lead_id = lead.id
  }

  // Scraper-owned fields: always overwrite so the CRM reflects fresh data.
  if (lead.segment) patch.segment = sanitizeText(lead.segment, 160)
  if (lead.address) patch.address = sanitizeText(lead.address, 240)
  if (lead.phone) patch.phone = sanitizeText(lead.phone, 80)
  if (lead.email) patch.email = sanitizeText(lead.email, 160)
  if (lead.site) patch.site = sanitizeText(lead.site, 240)
  if (lead.score_mobile !== null) patch.score_mobile = lead.score_mobile
  if (lead.score_speed !== null) patch.score_speed = lead.score_speed
  if (lead.score_seo !== null) patch.score_seo = lead.score_seo
  if (lead.score_design !== null) patch.score_design = lead.score_design

  // Pipeline fields: only advance forward (prevent regression to earlier stage).
  if (account.stage === 'new' && nextStage !== 'new') {
    patch.stage = nextStage
  }

  if (!account.contact_started && nextContactStarted) {
    patch.contact_started = true
  }

  if (account.proposal_status === 'none' && nextProposalStatus !== 'none') {
    patch.proposal_status = nextProposalStatus
  }

  if (account.reply_status === 'no_outreach' && nextReplyStatus !== 'no_outreach') {
    patch.reply_status = nextReplyStatus
  }

  // User-editable fields: overwrite unconditionally so latest lead data shows.
  if (nextChannel) patch.last_contact_channel = nextChannel
  if (lead.notes) patch.owner_notes = sanitizeText(lead.notes, 5000)
  if (lead.pitch) patch.last_outbound_excerpt = truncateText(lead.pitch, 240)

  return patch
}

function buildPrimaryContactInsertPayload(
  accountId: string,
  lead: Lead
) {
  const preferredChannel =
    normalizeCrmChannel(lead.contact_channel) ??
    (lead.email ? 'email' : lead.phone ? 'whatsapp' : null)

  return {
    account_id: accountId,
    full_name: buildPrimaryContactName(lead),
    role: 'other' as const,
    email: sanitizeText(lead.email, 160),
    phone: sanitizeText(lead.phone, 80),
    whatsapp: sanitizeText(lead.phone, 80),
    preferred_channel: preferredChannel,
    is_primary: true,
    notes: 'Contato inicial criado automaticamente a partir do lead.',
  }
}

async function ensurePrimaryContact(
  supabase: SupabaseClient,
  accountId: string,
  lead: Lead
) {
  const existingContact = await supabase
    .from('crm_contacts')
    .select('*')
    .eq('account_id', accountId)
    .eq('is_primary', true)
    .maybeSingle()

  if (existingContact.error) {
    throw new Error(existingContact.error.message)
  }

  if (existingContact.data) {
    return existingContact.data as CrmContact
  }

  const insertedContact = await supabase
    .from('crm_contacts')
    .insert(buildPrimaryContactInsertPayload(accountId, lead))
    .select('*')
    .single()

  if (insertedContact.error) {
    throw new Error(insertedContact.error.message)
  }

  return insertedContact.data as CrmContact
}

export function parseCreateCrmAccountFromLeadPayload(
  payload: unknown
): { data: CreateCrmAccountFromLeadInput } | { error: string; details?: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      error: 'Invalid JSON payload.',
      details: 'POST body must be a JSON object with leadId.',
    }
  }

  const input = payload as Record<string, unknown>
  const unknownFields = Object.keys(input).filter((key) => key !== 'leadId')

  if (unknownFields.length > 0) {
    return {
      error: 'Unknown CRM conversion fields in payload.',
      details: 'Allowed fields: leadId.',
    }
  }

  if (typeof input.leadId !== 'string' || !isUuid(input.leadId)) {
    return {
      error: 'Invalid leadId value.',
      details: 'leadId must be a valid UUID.',
    }
  }

  return {
    data: {
      leadId: input.leadId,
    },
  }
}

export async function createCrmAccountFromLead(
  supabase: SupabaseClient,
  leadId: string
): Promise<CreateCrmAccountFromLeadResult> {
  const sourceLead = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .maybeSingle()

  if (sourceLead.error) {
    throw new Error(sourceLead.error.message)
  }

  if (!sourceLead.data) {
    throw new Error('Lead not found.')
  }

  const lead = sourceLead.data as Lead

  const existingByLead = await supabase
    .from('crm_accounts')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (existingByLead.error) {
    throw new Error(existingByLead.error.message)
  }

  if (existingByLead.data) {
    const account = existingByLead.data as CrmAccount
    const primaryContact = await ensurePrimaryContact(supabase, account.id, lead)

    return {
      account,
      primaryContact,
      conversion: 'existing_lead',
      sourceLeadId: leadId,
    }
  }

  const existingByCompany = await supabase
    .from('crm_accounts')
    .select('*')
    .eq('company_name', lead.name)
    .eq('city', lead.city)
    .maybeSingle()

  if (existingByCompany.error) {
    throw new Error(existingByCompany.error.message)
  }

  if (existingByCompany.data) {
    let account = existingByCompany.data as CrmAccount
    const patch = buildAccountPatchPayload(account, lead)

    if (Object.keys(patch).length > 0) {
      const updatedAccount = await supabase
        .from('crm_accounts')
        .update(patch)
        .eq('id', account.id)
        .select('*')
        .single()

      if (updatedAccount.error) {
        throw new Error(updatedAccount.error.message)
      }

      account = updatedAccount.data as CrmAccount
    }

    const primaryContact = await ensurePrimaryContact(supabase, account.id, lead)

    return {
      account,
      primaryContact,
      conversion: 'existing_company',
      sourceLeadId: leadId,
    }
  }

  const insertedAccount = await supabase
    .from('crm_accounts')
    .insert(buildAccountInsertPayload(lead))
    .select('*')
    .single()

  if (insertedAccount.error) {
    throw new Error(insertedAccount.error.message)
  }

  const account = insertedAccount.data as CrmAccount
  const primaryContact = await ensurePrimaryContact(supabase, account.id, lead)

  return {
    account,
    primaryContact,
    conversion: 'created',
    sourceLeadId: leadId,
  }
}
