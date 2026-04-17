'use client'

import { useEffect, useState } from 'react'

import type { CrmConversionResult } from '@/lib/crm'
import { buildBrowserMutationHeaders } from '@/lib/security-client'
import type { CrmAccount, CrmContact } from '@/types/crm'
import type { Lead } from '@/types/lead'

type LeadCrmBoxProps = {
  lead: Lead
}

type CrmConversionResponse =
  | {
      account: CrmAccount
      primaryContact: CrmContact | null
      conversion: CrmConversionResult
      sourceLeadId: string
    }
  | { error?: string; details?: string }
  | null

const CRM_STAGE_LABELS: Record<string, string> = {
  new: 'Novo',
  researching: 'Pesquisando',
  proposal_ready: 'Proposta pronta',
  contacted: 'Contatado',
  awaiting_reply: 'Aguardando resposta',
  replied: 'Respondeu',
  meeting_scheduled: 'Reunião agendada',
  won: 'Ganho',
  lost: 'Perdido',
}

const CRM_PROPOSAL_LABELS: Record<string, string> = {
  none: 'Sem proposta',
  draft: 'Rascunho',
  ready: 'Pronta',
  sent: 'Enviada',
  accepted: 'Aceita',
  rejected: 'Recusada',
  expired: 'Expirada',
}

const CRM_REPLY_LABELS: Record<string, string> = {
  no_outreach: 'Sem contato',
  awaiting_reply: 'Aguardando',
  replied: 'Respondido',
  bounced: 'Falhou',
  opted_out: 'Opt-out',
}

function formatCrmLabel(value: string | null | undefined, labels: Record<string, string>) {
  if (!value) {
    return '—'
  }

  return labels[value] ?? value
}

function formatPrimaryContact(contact: CrmContact | null) {
  if (!contact) {
    return 'Não criado'
  }

  const channel = contact.email ?? contact.whatsapp ?? contact.phone
  return channel ? `${contact.full_name} · ${channel}` : contact.full_name
}

function getConversionMessage(result: CrmConversionResult) {
  if (result === 'created') {
    return 'Lead convertido em conta CRM com contato principal preenchido.'
  }

  if (result === 'existing_lead') {
    return 'Este lead já estava vinculado a uma conta CRM.'
  }

  return 'A empresa já existia no CRM e o vínculo foi reaproveitado.'
}

async function convertLeadToCrm(leadId: string) {
  const response = await fetch('/api/crm/accounts/from-lead', {
    method: 'POST',
    headers: buildBrowserMutationHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ leadId }),
  })

  const payload = (await response.json().catch(() => null)) as CrmConversionResponse

  if (
    !response.ok ||
    !payload ||
    !('account' in payload) ||
    !('primaryContact' in payload)
  ) {
    const message =
      payload && 'account' in payload === false
        ? payload.details ?? payload.error
        : null

    throw new Error(message ?? 'Não foi possível adicionar o lead ao CRM.')
  }

  return payload
}

export function LeadCrmBox({ lead }: LeadCrmBoxProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [crmAccount, setCrmAccount] = useState<CrmAccount | null>(null)
  const [primaryContact, setPrimaryContact] = useState<CrmContact | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    setIsSubmitting(false)
    setCrmAccount(null)
    setPrimaryContact(null)
    setActionMessage(null)
    setActionError(null)
  }, [lead.id])

  async function handleConvertLead() {
    setIsSubmitting(true)
    setActionError(null)
    setActionMessage(null)

    try {
      const result = await convertLeadToCrm(lead.id)

      setCrmAccount(result.account)
      setPrimaryContact(result.primaryContact)
      setActionMessage(getConversionMessage(result.conversion))
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Falha inesperada ao criar a conta CRM.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Conversão para CRM
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Move este lead qualificado para a camada operacional do CRM, criando
            a conta da empresa e um contato principal padrão sem alterar o fluxo
            bruto de descoberta.
          </p>
        </div>

        <button
          type="button"
          onClick={handleConvertLead}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-92 disabled:cursor-wait disabled:opacity-70"
        >
          {isSubmitting
            ? 'Convertendo...'
            : crmAccount
              ? 'Sincronizar com CRM'
              : 'Adicionar ao CRM'}
        </button>
      </div>

      {actionMessage ? (
        <p className="mt-4 rounded-[1.1rem] border border-accent/25 bg-accent/10 px-4 py-3 text-sm leading-6 text-accent">
          {actionMessage}
        </p>
      ) : null}

      {actionError ? (
        <p className="mt-4 rounded-[1.1rem] border border-warning/35 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
          {actionError}
        </p>
      ) : null}

      {crmAccount ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.1rem] border border-border bg-background px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              Etapa
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {formatCrmLabel(crmAccount.stage, CRM_STAGE_LABELS)}
            </p>
          </div>

          <div className="rounded-[1.1rem] border border-border bg-background px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              Proposta
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {formatCrmLabel(crmAccount.proposal_status, CRM_PROPOSAL_LABELS)}
            </p>
          </div>

          <div className="rounded-[1.1rem] border border-border bg-background px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              Resposta
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {formatCrmLabel(crmAccount.reply_status, CRM_REPLY_LABELS)}
            </p>
          </div>

          <div className="rounded-[1.1rem] border border-border bg-background px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              Contato principal
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {formatPrimaryContact(primaryContact)}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
