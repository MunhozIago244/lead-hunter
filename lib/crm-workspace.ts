import type { SupabaseClient } from '@supabase/supabase-js'

import {
  CRM_PIPELINE_STAGE_VALUES,
  CRM_REPLY_STATUS_VALUES,
  isCrmPipelineStage,
  isCrmReplyStatus,
} from '@/lib/crm-constants'
import { isUuid } from '@/lib/leads'
import type {
  CrmAccount,
  CrmChannelConnection,
  CrmContact,
  CrmMessage,
  CrmOutreachEvent,
  CrmReplyStatus,
  CrmPipelineStage,
  CrmSyncJob,
} from '@/types/crm'

export type CrmWorkspaceData = {
  accounts: CrmAccount[]
  primaryContacts: CrmContact[]
  connections: CrmChannelConnection[]
  recentMessages: CrmMessage[]
  recentOutreachEvents: CrmOutreachEvent[]
  recentSyncJobs: CrmSyncJob[]
}

export type CrmAccountUpdate = {
  stage?: CrmPipelineStage
  reply_status?: CrmReplyStatus
  next_follow_up_at?: string | null
  owner_name?: string | null
  owner_notes?: string | null
}

type CrmWorkspaceAccountPatchResult =
  | { data: CrmAccountUpdate }
  | { error: string; details?: string }

const MUTABLE_ACCOUNT_FIELDS: Array<keyof CrmAccountUpdate> = [
  'stage',
  'reply_status',
  'next_follow_up_at',
  'owner_name',
  'owner_notes',
]

function sanitizeNullableText(value: string | null, maxLength: number) {
  if (value === null) {
    return null
  }

  const normalized = value.replace(/\r\n/g, '\n').trim()

  if (!normalized) {
    return null
  }

  return normalized.slice(0, maxLength)
}

function normalizeNullableTimestamp(value: unknown) {
  if (value === null) {
    return null
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()

  if (!normalized) {
    return null
  }

  const date = new Date(normalized)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString()
}

export function parseCrmAccountUpdatePayload(
  payload: unknown
): CrmWorkspaceAccountPatchResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      error: 'Invalid JSON payload.',
      details: 'PATCH body must be a JSON object.',
    }
  }

  const input = payload as Record<string, unknown>
  const unknownFields = Object.keys(input).filter(
    (key) => !MUTABLE_ACCOUNT_FIELDS.includes(key as keyof CrmAccountUpdate)
  )

  if (unknownFields.length > 0) {
    return {
      error: 'Unknown CRM account fields in payload.',
      details: `Allowed fields: ${MUTABLE_ACCOUNT_FIELDS.join(', ')}.`,
    }
  }

  const data: CrmAccountUpdate = {}

  if ('stage' in input) {
    if (typeof input.stage !== 'string' || !isCrmPipelineStage(input.stage)) {
      return {
        error: 'Invalid stage value.',
        details: `Allowed values: ${CRM_PIPELINE_STAGE_VALUES.join(', ')}.`,
      }
    }

    data.stage = input.stage
  }

  if ('reply_status' in input) {
    if (
      typeof input.reply_status !== 'string' ||
      !isCrmReplyStatus(input.reply_status)
    ) {
      return {
        error: 'Invalid reply_status value.',
        details: `Allowed values: ${CRM_REPLY_STATUS_VALUES.join(', ')}.`,
      }
    }

    data.reply_status = input.reply_status
  }

  if ('next_follow_up_at' in input) {
    const normalized = normalizeNullableTimestamp(input.next_follow_up_at ?? null)

    if (
      input.next_follow_up_at !== null &&
      input.next_follow_up_at !== '' &&
      !normalized
    ) {
      return {
        error: 'Invalid next_follow_up_at value.',
        details: 'Use an ISO date string, a datetime-local-compatible string, or null.',
      }
    }

    data.next_follow_up_at = normalized
  }

  if ('owner_name' in input) {
    if (input.owner_name !== null && typeof input.owner_name !== 'string') {
      return {
        error: 'Invalid owner_name value.',
        details: 'owner_name must be a string or null.',
      }
    }

    data.owner_name = sanitizeNullableText(input.owner_name ?? null, 120)
  }

  if ('owner_notes' in input) {
    if (input.owner_notes !== null && typeof input.owner_notes !== 'string') {
      return {
        error: 'Invalid owner_notes value.',
        details: 'owner_notes must be a string or null.',
      }
    }

    data.owner_notes = sanitizeNullableText(input.owner_notes ?? null, 5000)
  }

  if (Object.keys(data).length === 0) {
    return {
      error: 'No updatable CRM account fields were provided.',
      details: `Provide at least one of: ${MUTABLE_ACCOUNT_FIELDS.join(', ')}.`,
    }
  }

  return { data }
}

export async function getCrmWorkspaceData(
  supabase: SupabaseClient
): Promise<CrmWorkspaceData> {
  const accountsResult = await supabase
    .from('crm_accounts')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (accountsResult.error) {
    throw new Error(accountsResult.error.message)
  }

  const accounts = (accountsResult.data ?? []) as CrmAccount[]
  const accountIds = accounts.map((account) => account.id).filter(isUuid)

  const connectionsPromise = supabase
    .from('crm_channel_connections')
    .select('*')
    .order('created_at', { ascending: false })

  const syncJobsPromise = supabase
    .from('crm_sync_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(24)

  const contactsPromise =
    accountIds.length > 0
      ? supabase
          .from('crm_contacts')
          .select('*')
          .in('account_id', accountIds)
          .eq('is_primary', true)
      : Promise.resolve({ data: [], error: null })

  const messagesPromise =
    accountIds.length > 0
      ? supabase
          .from('crm_messages')
          .select('*')
          .in('account_id', accountIds)
          .order('created_at', { ascending: false })
          .limit(240)
      : Promise.resolve({ data: [], error: null })

  const eventsPromise =
    accountIds.length > 0
      ? supabase
          .from('crm_outreach_events')
          .select('*')
          .in('account_id', accountIds)
          .order('happened_at', { ascending: false })
          .limit(240)
      : Promise.resolve({ data: [], error: null })

  const [
    connectionsResult,
    syncJobsResult,
    contactsResult,
    messagesResult,
    eventsResult,
  ] = await Promise.all([
    connectionsPromise,
    syncJobsPromise,
    contactsPromise,
    messagesPromise,
    eventsPromise,
  ])

  if (connectionsResult.error) {
    throw new Error(connectionsResult.error.message)
  }

  if (syncJobsResult.error) {
    throw new Error(syncJobsResult.error.message)
  }

  if (contactsResult.error) {
    throw new Error(contactsResult.error.message)
  }

  if (messagesResult.error) {
    throw new Error(messagesResult.error.message)
  }

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message)
  }

  return {
    accounts,
    primaryContacts: (contactsResult.data ?? []) as CrmContact[],
    connections: (connectionsResult.data ?? []) as CrmChannelConnection[],
    recentMessages: (messagesResult.data ?? []) as CrmMessage[],
    recentOutreachEvents: (eventsResult.data ?? []) as CrmOutreachEvent[],
    recentSyncJobs: (syncJobsResult.data ?? []) as CrmSyncJob[],
  }
}
