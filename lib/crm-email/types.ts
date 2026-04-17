import type { CrmMessageDirection, CrmMessageStatus, CrmSyncJobStatus, JsonValue } from '@/types/crm'

export type EmailSyncJobType = 'email_poll' | 'email_webhook'

export type CrmEmailSyncMessageInput = {
  providerMessageId: string | null
  threadId: string | null
  direction: CrmMessageDirection
  messageStatus: CrmMessageStatus | null
  subject: string | null
  body: string | null
  excerpt: string | null
  senderIdentifier: string | null
  recipientIdentifier: string | null
  sentAt: string | null
  receivedAt: string | null
  inReplyToProviderMessageId: string | null
  accountId: string | null
  contactId: string | null
  dealId: string | null
  outreachEventId: string | null
  metadata: JsonValue | null
}

export type CrmEmailSyncPayload = {
  connectionId: string
  jobType: EmailSyncJobType
  cursor: string | null
  messages: CrmEmailSyncMessageInput[]
}

export type CrmEmailSyncResult = {
  jobId: string
  jobStatus: CrmSyncJobStatus
  connectionId: string
  processedMessages: number
  createdMessages: number
  updatedMessages: number
  createdEvents: number
  repliesDetected: number
  unmatchedMessages: number
  failedMessages: number
  cursor: string | null
  errors: Array<{
    providerMessageId: string | null
    reason: string
  }>
}
