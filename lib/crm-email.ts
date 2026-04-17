// Re-exports — public API of the crm-email module.
// Internal implementation is split across:
//   lib/crm-email/types.ts    — shared exported types
//   lib/crm-email/internal.ts — parsing, validation, and sync engine

export type {
  CrmEmailSyncMessageInput,
  CrmEmailSyncPayload,
  CrmEmailSyncResult,
  EmailSyncJobType,
} from './crm-email/types'

export { parseCrmEmailSyncPayload, processCrmEmailSync } from './crm-email/internal'
