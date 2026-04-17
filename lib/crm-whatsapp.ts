// Re-exports — public API of the crm-whatsapp module.
// Internal implementation is split across:
//   lib/crm-whatsapp/types.ts    — shared exported types
//   lib/crm-whatsapp/internal.ts — parsing, validation, and sync engine

export type {
  CrmWhatsAppSyncMessageInput,
  CrmWhatsAppSyncPayload,
  CrmWhatsAppSyncResult,
  WhatsAppSyncJobType,
} from './crm-whatsapp/types'

export { parseCrmWhatsAppSyncPayload, processCrmWhatsAppSync } from './crm-whatsapp/internal'
