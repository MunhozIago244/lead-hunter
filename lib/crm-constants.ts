import type {
  CrmConnectionChannel,
  CrmConnectionStatus,
  CrmPipelineStage,
  CrmProposalStatus,
  CrmReplyStatus,
  CrmSyncJobStatus,
} from '@/types/crm'

export const CRM_PIPELINE_STAGE_VALUES = [
  'new',
  'researching',
  'proposal_ready',
  'contacted',
  'awaiting_reply',
  'replied',
  'meeting_scheduled',
  'won',
  'lost',
] as const satisfies readonly CrmPipelineStage[]

export const CRM_REPLY_STATUS_VALUES = [
  'no_outreach',
  'awaiting_reply',
  'replied',
  'bounced',
  'opted_out',
] as const satisfies readonly CrmReplyStatus[]

export const CRM_PROPOSAL_STATUS_VALUES = [
  'none',
  'draft',
  'ready',
  'sent',
  'accepted',
  'rejected',
  'expired',
] as const satisfies readonly CrmProposalStatus[]

export const CRM_CONNECTION_CHANNEL_VALUES = [
  'email',
  'whatsapp',
] as const satisfies readonly CrmConnectionChannel[]

export const CRM_CONNECTION_STATUS_VALUES = [
  'disconnected',
  'connected',
  'paused',
  'error',
] as const satisfies readonly CrmConnectionStatus[]

export const CRM_SYNC_JOB_STATUS_VALUES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'partial',
] as const satisfies readonly CrmSyncJobStatus[]

export const CRM_PIPELINE_STAGE_LABELS: Record<CrmPipelineStage, string> = {
  new: 'Novo',
  researching: 'Pesquisa',
  proposal_ready: 'Proposta pronta',
  contacted: 'Contatado',
  awaiting_reply: 'Aguardando resposta',
  replied: 'Respondeu',
  meeting_scheduled: 'Reunião marcada',
  won: 'Ganho',
  lost: 'Perdido',
}

export const CRM_REPLY_STATUS_LABELS: Record<CrmReplyStatus, string> = {
  no_outreach: 'Sem contato',
  awaiting_reply: 'Aguardando',
  replied: 'Respondido',
  bounced: 'Falhou',
  opted_out: 'Opt-out',
}

export const CRM_PROPOSAL_STATUS_LABELS: Record<CrmProposalStatus, string> = {
  none: 'Sem proposta',
  draft: 'Rascunho',
  ready: 'Pronta',
  sent: 'Enviada',
  accepted: 'Aceita',
  rejected: 'Recusada',
  expired: 'Expirada',
}

export const CRM_CONNECTION_CHANNEL_LABELS: Record<CrmConnectionChannel, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
}

export const CRM_CONNECTION_STATUS_LABELS: Record<CrmConnectionStatus, string> = {
  disconnected: 'Desconectado',
  connected: 'Conectado',
  paused: 'Pausado',
  error: 'Erro',
}

export const CRM_SYNC_JOB_STATUS_LABELS: Record<CrmSyncJobStatus, string> = {
  queued: 'Na fila',
  running: 'Executando',
  succeeded: 'Concluído',
  failed: 'Falhou',
  partial: 'Parcial',
}

export function isCrmPipelineStage(value: string): value is CrmPipelineStage {
  return CRM_PIPELINE_STAGE_VALUES.includes(value as CrmPipelineStage)
}

export function isCrmReplyStatus(value: string): value is CrmReplyStatus {
  return CRM_REPLY_STATUS_VALUES.includes(value as CrmReplyStatus)
}
