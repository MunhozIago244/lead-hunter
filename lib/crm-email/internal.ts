import type { SupabaseClient } from '@supabase/supabase-js'

import { isUuid } from '@/lib/leads'
import type {
  CrmAccount,
  CrmChannelConnection,
  CrmConnectionStatus,
  CrmMessage,
  CrmMessageDirection,
  CrmMessageStatus,
  CrmOutreachEvent,
  CrmPipelineStage,
  CrmReplyStatus,
  CrmSyncJobStatus,
  CrmSyncJobType,
  JsonValue,
} from '@/types/crm'

import type {
  CrmEmailSyncMessageInput,
  CrmEmailSyncPayload,
  CrmEmailSyncResult,
  EmailSyncJobType,
} from './types'

const EMAIL_SYNC_JOB_TYPES = ['email_poll', 'email_webhook'] as const

const CRM_MESSAGE_STATUS_VALUES = [
  'draft',
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'received',
] as const

const MAX_SYNC_MESSAGES = 100

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

function sanitizeEmailIdentifier(value: string | null | undefined) {
  const sanitized = sanitizeText(value, 160)
  return sanitized ? sanitized.toLowerCase() : null
}

function sanitizeMetadata(value: unknown): JsonValue | null {
  if (value === null || value === undefined) {
    return null
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadata(item)) as JsonValue
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, nestedValue]) => [key, sanitizeMetadata(nestedValue)]
    )

    return Object.fromEntries(entries) as JsonValue
  }

  return null
}

function normalizeTimestamp(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString()
}

function isCrmMessageStatus(value: string): value is CrmMessageStatus {
  return CRM_MESSAGE_STATUS_VALUES.includes(value as CrmMessageStatus)
}

function buildExcerpt(input: Pick<CrmEmailSyncMessageInput, 'excerpt' | 'body' | 'subject'>) {
  return (
    sanitizeText(input.excerpt, 240) ??
    sanitizeText(input.body, 240) ??
    sanitizeText(input.subject, 240)
  )
}

function getOccurredAt(message: CrmEmailSyncMessageInput) {
  if (message.direction === 'outbound') {
    return message.sentAt ?? message.receivedAt ?? new Date().toISOString()
  }

  return message.receivedAt ?? message.sentAt ?? new Date().toISOString()
}

function shouldPromoteToAwaitingReply(stage: CrmPipelineStage) {
  return ['new', 'researching', 'proposal_ready', 'contacted'].includes(stage)
}

function shouldPromoteToReplied(stage: CrmPipelineStage) {
  return !['won', 'lost'].includes(stage)
}

function normalizeReplyStatusAfterOutbound(
  current: CrmReplyStatus
): CrmReplyStatus {
  return current === 'replied' ? current : 'awaiting_reply'
}

function isEmailSyncJobType(value: string): value is EmailSyncJobType {
  return EMAIL_SYNC_JOB_TYPES.includes(value as EmailSyncJobType)
}

function isCrmConnectionConnected(status: CrmConnectionStatus) {
  return status === 'connected'
}

function isSyncableEmailDirection(value: unknown): value is CrmMessageDirection {
  return value === 'outbound' || value === 'inbound'
}

export function parseCrmEmailSyncPayload(
  payload: unknown
): { data: CrmEmailSyncPayload } | { error: string; details?: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      error: 'Invalid JSON payload.',
      details: 'POST body must be a JSON object.',
    }
  }

  const input = payload as Record<string, unknown>
  const unknownFields = Object.keys(input).filter(
    (key) => !['connectionId', 'jobType', 'cursor', 'messages'].includes(key)
  )

  if (unknownFields.length > 0) {
    return {
      error: 'Unknown email sync fields in payload.',
      details: 'Allowed fields: connectionId, jobType, cursor, messages.',
    }
  }

  if (typeof input.connectionId !== 'string' || !isUuid(input.connectionId)) {
    return {
      error: 'Invalid connectionId value.',
      details: 'connectionId must be a valid UUID.',
    }
  }

  if (typeof input.jobType !== 'string' || !isEmailSyncJobType(input.jobType)) {
    return {
      error: 'Invalid jobType value.',
      details: 'Use one of: email_poll, email_webhook.',
    }
  }

  if (
    input.cursor !== undefined &&
    input.cursor !== null &&
    typeof input.cursor !== 'string'
  ) {
    return {
      error: 'Invalid cursor value.',
      details: 'cursor must be a string or null.',
    }
  }

  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    return {
      error: 'Invalid messages payload.',
      details: 'messages must be a non-empty array.',
    }
  }

  if (input.messages.length > MAX_SYNC_MESSAGES) {
    return {
      error: 'Too many email sync messages.',
      details: `Maximum supported batch size is ${MAX_SYNC_MESSAGES}.`,
    }
  }

  const messages: CrmEmailSyncMessageInput[] = []

  for (const [index, rawMessage] of input.messages.entries()) {
    if (!rawMessage || typeof rawMessage !== 'object' || Array.isArray(rawMessage)) {
      return {
        error: 'Invalid email message payload.',
        details: `Message at index ${index} must be a JSON object.`,
      }
    }

    const message = rawMessage as Record<string, unknown>

    if (!isSyncableEmailDirection(message.direction)) {
      return {
        error: 'Invalid message direction.',
        details: `Message at index ${index} must include direction "outbound" or "inbound".`,
      }
    }

    if (
      message.messageStatus !== undefined &&
      message.messageStatus !== null &&
      (typeof message.messageStatus !== 'string' ||
        !isCrmMessageStatus(message.messageStatus))
    ) {
      return {
        error: 'Invalid messageStatus value.',
        details: `Message at index ${index} has an unsupported status.`,
      }
    }

    const accountId =
      typeof message.accountId === 'string' && isUuid(message.accountId)
        ? message.accountId
        : null
    const contactId =
      typeof message.contactId === 'string' && isUuid(message.contactId)
        ? message.contactId
        : null
    const dealId =
      typeof message.dealId === 'string' && isUuid(message.dealId)
        ? message.dealId
        : null
    const outreachEventId =
      typeof message.outreachEventId === 'string' && isUuid(message.outreachEventId)
        ? message.outreachEventId
        : null

    const providerMessageId = sanitizeText(
      typeof message.providerMessageId === 'string'
        ? message.providerMessageId
        : null,
      240
    )
    const threadId = sanitizeText(
      typeof message.threadId === 'string' ? message.threadId : null,
      240
    )

    const senderIdentifier = sanitizeEmailIdentifier(
      typeof message.senderIdentifier === 'string'
        ? message.senderIdentifier
        : null
    )
    const recipientIdentifier = sanitizeEmailIdentifier(
      typeof message.recipientIdentifier === 'string'
        ? message.recipientIdentifier
        : null
    )

    if (!accountId && !senderIdentifier && !recipientIdentifier && !threadId) {
      return {
        error: 'Insufficient email matching data.',
        details: `Message at index ${index} must include accountId, senderIdentifier, recipientIdentifier, or threadId.`,
      }
    }

    const sentAt = normalizeTimestamp(message.sentAt)
    const receivedAt = normalizeTimestamp(message.receivedAt)

    messages.push({
      providerMessageId,
      threadId,
      direction: message.direction,
      messageStatus:
        (message.messageStatus as CrmMessageStatus | null | undefined) ?? null,
      subject: sanitizeText(
        typeof message.subject === 'string' ? message.subject : null,
        240
      ),
      body: sanitizeText(
        typeof message.body === 'string' ? message.body : null,
        5000
      ),
      excerpt: sanitizeText(
        typeof message.excerpt === 'string' ? message.excerpt : null,
        240
      ),
      senderIdentifier,
      recipientIdentifier,
      sentAt,
      receivedAt,
      inReplyToProviderMessageId: sanitizeText(
        typeof message.inReplyToProviderMessageId === 'string'
          ? message.inReplyToProviderMessageId
          : null,
        240
      ),
      accountId,
      contactId,
      dealId,
      outreachEventId,
      metadata: sanitizeMetadata(message.metadata),
    })
  }

  return {
    data: {
      connectionId: input.connectionId,
      jobType: input.jobType,
      cursor: sanitizeText(input.cursor as string | null | undefined, 500),
      messages,
    },
  }
}

type ResolvedEmailContext = {
  account: CrmAccount
  contactId: string | null
  dealId: string | null
  outreachEventId: string | null
  repliedToMessageId: string | null
  matchedThread: boolean
}

type PersistedEmailMessage = {
  message: CrmMessage
  created: boolean
}

type PersistedOutreachEvent = {
  event: CrmOutreachEvent
  created: boolean
}

async function loadEmailConnection(
  supabase: SupabaseClient,
  connectionId: string
) {
  const connection = await supabase
    .from('crm_channel_connections')
    .select('*')
    .eq('id', connectionId)
    .maybeSingle()

  if (connection.error) {
    throw new Error(connection.error.message)
  }

  if (!connection.data) {
    throw new Error('CRM email connection not found.')
  }

  const data = connection.data as CrmChannelConnection

  if (data.channel !== 'email') {
    throw new Error('The provided CRM connection is not an email channel.')
  }

  if (!isCrmConnectionConnected(data.connection_status)) {
    throw new Error('The CRM email connection is not active.')
  }

  return data
}

async function createSyncJob(
  supabase: SupabaseClient,
  payload: CrmEmailSyncPayload
) {
  const createdJob = await supabase
    .from('crm_sync_jobs')
    .insert({
      connection_id: payload.connectionId,
      job_type: payload.jobType satisfies CrmSyncJobType,
      job_status: 'running' satisfies CrmSyncJobStatus,
      started_at: new Date().toISOString(),
      cursor: payload.cursor,
      payload: {
        requested_messages: payload.messages.length,
      },
    })
    .select('id')
    .single()

  if (createdJob.error || !createdJob.data) {
    throw new Error(createdJob.error?.message ?? 'Failed to create CRM sync job.')
  }

  return createdJob.data.id as string
}

async function updateSyncJob(
  supabase: SupabaseClient,
  jobId: string,
  result: CrmEmailSyncResult
) {
  const update = await supabase
    .from('crm_sync_jobs')
    .update({
      job_status: result.jobStatus,
      finished_at: new Date().toISOString(),
      cursor: result.cursor,
      records_processed: result.processedMessages,
      error_message:
        result.errors.length > 0 ? result.errors.map((entry) => entry.reason).join(' | ').slice(0, 1000) : null,
      payload: {
        created_messages: result.createdMessages,
        updated_messages: result.updatedMessages,
        created_events: result.createdEvents,
        replies_detected: result.repliesDetected,
        unmatched_messages: result.unmatchedMessages,
        failed_messages: result.failedMessages,
      },
    })
    .eq('id', jobId)

  if (update.error) {
    throw new Error(update.error.message)
  }
}

async function touchConnectionAfterSync(
  supabase: SupabaseClient,
  connectionId: string,
  jobType: EmailSyncJobType,
  result: CrmEmailSyncResult
) {
  const now = new Date().toISOString()

  const update = await supabase
    .from('crm_channel_connections')
    .update({
      last_synced_at: now,
      last_webhook_at: jobType === 'email_webhook' ? now : undefined,
      last_error:
        result.errors.length > 0
          ? result.errors[0]?.reason.slice(0, 1000) ?? null
          : null,
    })
    .eq('id', connectionId)

  if (update.error) {
    throw new Error(update.error.message)
  }
}

async function resolveAccountByEmail(
  supabase: SupabaseClient,
  email: string
) {
  const contact = await supabase
    .from('crm_contacts')
    .select('id, account_id')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()

  if (contact.error) {
    throw new Error(contact.error.message)
  }

  if (contact.data) {
    return {
      accountId: contact.data.account_id as string,
      contactId: contact.data.id as string,
    }
  }

  const account = await supabase
    .from('crm_accounts')
    .select('id')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()

  if (account.error) {
    throw new Error(account.error.message)
  }

  if (account.data) {
    return {
      accountId: account.data.id as string,
      contactId: null,
    }
  }

  return null
}

async function resolveAccountContextForMessage(
  supabase: SupabaseClient,
  message: CrmEmailSyncMessageInput
): Promise<ResolvedEmailContext | null> {
  let accountId = message.accountId
  let contactId = message.contactId
  let dealId = message.dealId
  let outreachEventId = message.outreachEventId
  let repliedToMessageId: string | null = null
  let matchedThread = false

  if (!accountId && message.outreachEventId) {
    const outreachEvent = await supabase
      .from('crm_outreach_events')
      .select('id, account_id, contact_id, deal_id')
      .eq('id', message.outreachEventId)
      .maybeSingle()

    if (outreachEvent.error) {
      throw new Error(outreachEvent.error.message)
    }

    if (outreachEvent.data) {
      accountId = outreachEvent.data.account_id as string
      contactId = (outreachEvent.data.contact_id as string | null) ?? contactId
      dealId = (outreachEvent.data.deal_id as string | null) ?? dealId
      outreachEventId = outreachEvent.data.id as string
    }
  }

  if (!accountId && message.inReplyToProviderMessageId) {
    const repliedMessage = await supabase
      .from('crm_messages')
      .select('id, account_id, contact_id, deal_id, outreach_event_id')
      .eq('provider_message_id', message.inReplyToProviderMessageId)
      .limit(1)
      .maybeSingle()

    if (repliedMessage.error) {
      throw new Error(repliedMessage.error.message)
    }

    if (repliedMessage.data) {
      repliedToMessageId = repliedMessage.data.id as string
      accountId = repliedMessage.data.account_id as string
      contactId = (repliedMessage.data.contact_id as string | null) ?? contactId
      dealId = (repliedMessage.data.deal_id as string | null) ?? dealId
      outreachEventId =
        (repliedMessage.data.outreach_event_id as string | null) ?? outreachEventId
    }
  }

  if (!accountId && message.threadId) {
    // Narrow by counterparty email to prevent cross-account thread collision.
    const counterpartyEmail =
      message.direction === 'inbound'
        ? message.senderIdentifier
        : message.recipientIdentifier

    let threadQuery = supabase
      .from('crm_messages')
      .select('id, account_id, contact_id, deal_id, outreach_event_id')
      .eq('thread_id', message.threadId)
      .eq('channel', 'email')

    if (counterpartyEmail) {
      threadQuery = threadQuery.or(
        `sender_identifier.eq.${counterpartyEmail},recipient_identifier.eq.${counterpartyEmail}`
      )
    }

    const threadedMessage = await threadQuery.limit(1).maybeSingle()

    if (threadedMessage.error) {
      throw new Error(threadedMessage.error.message)
    }

    if (threadedMessage.data) {
      matchedThread = true
      repliedToMessageId = threadedMessage.data.id as string
      accountId = threadedMessage.data.account_id as string
      contactId = (threadedMessage.data.contact_id as string | null) ?? contactId
      dealId = (threadedMessage.data.deal_id as string | null) ?? dealId
      outreachEventId =
        (threadedMessage.data.outreach_event_id as string | null) ?? outreachEventId
    }
  }

  if (!accountId) {
    const emailCandidate =
      message.direction === 'inbound'
        ? message.senderIdentifier
        : message.recipientIdentifier

    if (emailCandidate) {
      const matched = await resolveAccountByEmail(supabase, emailCandidate)

      if (matched) {
        accountId = matched.accountId
        contactId = matched.contactId ?? contactId
      }
    }
  }

  if (!accountId) {
    return null
  }

  const account = await supabase
    .from('crm_accounts')
    .select('*')
    .eq('id', accountId)
    .maybeSingle()

  if (account.error) {
    throw new Error(account.error.message)
  }

  if (!account.data) {
    return null
  }

  return {
    account: account.data as CrmAccount,
    contactId,
    dealId,
    outreachEventId,
    repliedToMessageId,
    matchedThread,
  }
}

async function upsertCrmMessage(
  supabase: SupabaseClient,
  payload: Record<string, unknown> & { provider_message_id: string | null }
): Promise<PersistedEmailMessage> {
  if (payload.provider_message_id) {
    const existingMessage = await supabase
      .from('crm_messages')
      .select('*')
      .eq('provider_message_id', payload.provider_message_id)
      .limit(1)
      .maybeSingle()

    if (existingMessage.error) {
      throw new Error(existingMessage.error.message)
    }

    if (existingMessage.data) {
      const updatedMessage = await supabase
        .from('crm_messages')
        .update(payload)
        .eq('id', existingMessage.data.id)
        .select('*')
        .single()

      if (updatedMessage.error || !updatedMessage.data) {
        throw new Error(
          updatedMessage.error?.message ?? 'Failed to update CRM email message.'
        )
      }

      return {
        message: updatedMessage.data as CrmMessage,
        created: false,
      }
    }
  }

  const insertedMessage = await supabase
    .from('crm_messages')
    .insert(payload)
    .select('*')
    .single()

  if (insertedMessage.error || !insertedMessage.data) {
    throw new Error(
      insertedMessage.error?.message ?? 'Failed to insert CRM email message.'
    )
  }

  return {
    message: insertedMessage.data as CrmMessage,
    created: true,
  }
}

async function upsertCrmOutreachEvent(
  supabase: SupabaseClient,
  payload: Record<string, unknown> & { external_message_id: string | null }
): Promise<PersistedOutreachEvent> {
  if (payload.external_message_id) {
    const existingEvent = await supabase
      .from('crm_outreach_events')
      .select('*')
      .eq('external_message_id', payload.external_message_id)
      .eq('channel', 'email')
      .limit(1)
      .maybeSingle()

    if (existingEvent.error) {
      throw new Error(existingEvent.error.message)
    }

    if (existingEvent.data) {
      const updatedEvent = await supabase
        .from('crm_outreach_events')
        .update(payload)
        .eq('id', existingEvent.data.id)
        .select('*')
        .single()

      if (updatedEvent.error || !updatedEvent.data) {
        throw new Error(
          updatedEvent.error?.message ?? 'Failed to update CRM outreach event.'
        )
      }

      return {
        event: updatedEvent.data as CrmOutreachEvent,
        created: false,
      }
    }
  }

  const insertedEvent = await supabase
    .from('crm_outreach_events')
    .insert(payload)
    .select('*')
    .single()

  if (insertedEvent.error || !insertedEvent.data) {
    throw new Error(
      insertedEvent.error?.message ?? 'Failed to insert CRM outreach event.'
    )
  }

  return {
    event: insertedEvent.data as CrmOutreachEvent,
    created: true,
  }
}

async function updateAccountAfterOutboundEmail(
  supabase: SupabaseClient,
  account: CrmAccount,
  message: CrmEmailSyncMessageInput,
  excerpt: string | null
) {
  const occurredAt = getOccurredAt(message)
  const patch: Record<string, unknown> = {
    contact_started: true,
    last_contact_channel: 'email',
    last_contact_at: occurredAt,
    last_outbound_message_at: occurredAt,
    last_outbound_excerpt: excerpt,
    reply_status: normalizeReplyStatusAfterOutbound(account.reply_status),
  }

  if (shouldPromoteToAwaitingReply(account.stage)) {
    patch.stage = 'awaiting_reply'
  }

  if (['none', 'draft', 'ready'].includes(account.proposal_status)) {
    patch.proposal_status = 'sent'
    patch.proposal_sent_at = account.proposal_sent_at ?? occurredAt
  }

  const update = await supabase
    .from('crm_accounts')
    .update(patch)
    .eq('id', account.id)

  if (update.error) {
    throw new Error(update.error.message)
  }
}

async function updateAccountAfterInboundEmail(
  supabase: SupabaseClient,
  account: CrmAccount,
  message: CrmEmailSyncMessageInput,
  excerpt: string | null,
  isReply: boolean
) {
  const occurredAt = getOccurredAt(message)
  const patch: Record<string, unknown> = {
    last_contact_channel: 'email',
    last_contact_at: occurredAt,
    last_inbound_message_at: occurredAt,
    last_inbound_excerpt: excerpt,
  }

  if (isReply) {
    patch.reply_status = 'replied'
    patch.reply_received_at = occurredAt

    if (shouldPromoteToReplied(account.stage)) {
      patch.stage = 'replied'
    }
  }

  const update = await supabase
    .from('crm_accounts')
    .update(patch)
    .eq('id', account.id)

  if (update.error) {
    throw new Error(update.error.message)
  }
}

async function processEmailSyncMessage(
  supabase: SupabaseClient,
  message: CrmEmailSyncMessageInput
) {
  const context = await resolveAccountContextForMessage(supabase, message)

  if (!context) {
    return {
      matched: false,
      createdMessage: false,
      updatedMessage: false,
      createdEvent: false,
      replyDetected: false,
    }
  }

  const excerpt = buildExcerpt(message)
  const isReply =
    message.direction === 'inbound' &&
    Boolean(
      message.inReplyToProviderMessageId ||
        context.repliedToMessageId ||
        context.outreachEventId ||
        context.matchedThread ||
        context.account.reply_status === 'awaiting_reply'
    )

  const persistedMessage = await upsertCrmMessage(supabase, {
    account_id: context.account.id,
    contact_id: context.contactId,
    deal_id: context.dealId,
    outreach_event_id: context.outreachEventId,
    channel: 'email',
    direction: message.direction,
    message_status:
      message.messageStatus ??
      (message.direction === 'inbound' ? 'received' : 'sent'),
    provider_message_id: message.providerMessageId,
    thread_id: message.threadId,
    subject: message.subject,
    body: message.body,
    excerpt,
    sender_identifier: message.senderIdentifier,
    recipient_identifier: message.recipientIdentifier,
    sent_at: message.sentAt,
    received_at: message.receivedAt,
    replied_to_message_id: context.repliedToMessageId,
    is_reply: isReply,
    metadata: message.metadata,
  })

  let createdEvent = false

  if (message.direction === 'outbound') {
    const persistedEvent = await upsertCrmOutreachEvent(supabase, {
      account_id: context.account.id,
      contact_id: context.contactId,
      deal_id: context.dealId,
      channel: 'email',
      event_type: 'marked_sent',
      subject: message.subject,
      body: message.body,
      confirmed_sent: ['sent', 'delivered', 'read'].includes(
        message.messageStatus ?? 'sent'
      ),
      reply_expected: true,
      external_message_id: message.providerMessageId,
      happened_at: getOccurredAt(message),
      metadata: {
        source: 'email_sync',
        direction: message.direction,
        thread_id: message.threadId,
      },
    })

    createdEvent = persistedEvent.created

    if (persistedMessage.message.outreach_event_id !== persistedEvent.event.id) {
      await supabase
        .from('crm_messages')
        .update({
          outreach_event_id: persistedEvent.event.id,
        })
        .eq('id', persistedMessage.message.id)
    }

    await updateAccountAfterOutboundEmail(
      supabase,
      context.account,
      message,
      excerpt
    )
  }

  if (message.direction === 'inbound') {
    if (isReply) {
      const persistedEvent = await upsertCrmOutreachEvent(supabase, {
        account_id: context.account.id,
        contact_id: context.contactId,
        deal_id: context.dealId,
        channel: 'email',
        event_type: 'reply_detected',
        subject: message.subject,
        body: message.body,
        confirmed_sent: false,
        reply_expected: false,
        external_message_id: message.providerMessageId,
        happened_at: getOccurredAt(message),
        metadata: {
          source: 'email_sync',
          direction: message.direction,
          thread_id: message.threadId,
          in_reply_to_provider_message_id: message.inReplyToProviderMessageId,
        },
      })

      createdEvent = createdEvent || persistedEvent.created

      if (persistedMessage.message.outreach_event_id !== persistedEvent.event.id) {
        await supabase
          .from('crm_messages')
          .update({
            outreach_event_id: persistedEvent.event.id,
          })
          .eq('id', persistedMessage.message.id)
      }
    }

    await updateAccountAfterInboundEmail(
      supabase,
      context.account,
      message,
      excerpt,
      isReply
    )
  }

  return {
    matched: true,
    createdMessage: persistedMessage.created,
    updatedMessage: !persistedMessage.created,
    createdEvent,
    replyDetected: isReply,
  }
}

export async function processCrmEmailSync(
  supabase: SupabaseClient,
  payload: CrmEmailSyncPayload
): Promise<CrmEmailSyncResult> {
  await loadEmailConnection(supabase, payload.connectionId)
  const jobId = await createSyncJob(supabase, payload)

  const result: CrmEmailSyncResult = {
    jobId,
    jobStatus: 'running',
    connectionId: payload.connectionId,
    processedMessages: 0,
    createdMessages: 0,
    updatedMessages: 0,
    createdEvents: 0,
    repliesDetected: 0,
    unmatchedMessages: 0,
    failedMessages: 0,
    cursor: payload.cursor,
    errors: [],
  }

  try {
    for (const message of payload.messages) {
      try {
        const processed = await processEmailSyncMessage(supabase, message)

        if (!processed.matched) {
          result.unmatchedMessages += 1
          result.errors.push({
            providerMessageId: message.providerMessageId,
            reason: 'No CRM account matched the email payload.',
          })
          continue
        }

        result.processedMessages += 1

        if (processed.createdMessage) {
          result.createdMessages += 1
        }

        if (processed.updatedMessage) {
          result.updatedMessages += 1
        }

        if (processed.createdEvent) {
          result.createdEvents += 1
        }

        if (processed.replyDetected) {
          result.repliesDetected += 1
        }
      } catch (error) {
        result.failedMessages += 1
        result.errors.push({
          providerMessageId: message.providerMessageId,
          reason:
            error instanceof Error
              ? error.message
              : 'Unexpected email sync processing error.',
        })
      }
    }

    if (result.errors.length === 0) {
      result.jobStatus = 'succeeded'
    } else if (result.processedMessages > 0) {
      result.jobStatus = 'partial'
    } else {
      result.jobStatus = 'failed'
    }

    await updateSyncJob(supabase, jobId, result)
    await touchConnectionAfterSync(
      supabase,
      payload.connectionId,
      payload.jobType,
      result
    )

    return result
  } catch (error) {
    const failedResult: CrmEmailSyncResult = {
      ...result,
      jobStatus: 'failed',
      failedMessages: payload.messages.length,
      errors: [
        {
          providerMessageId: null,
          reason:
            error instanceof Error
              ? error.message
              : 'Unexpected CRM email sync failure.',
        },
      ],
    }

    await updateSyncJob(supabase, jobId, failedResult)
    await touchConnectionAfterSync(
      supabase,
      payload.connectionId,
      payload.jobType,
      failedResult
    )

    return failedResult
  }
}
