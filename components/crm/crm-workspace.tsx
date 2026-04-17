'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { SignOutButton } from '@/components/auth/sign-out-button'
import {
  CRM_CONNECTION_CHANNEL_LABELS,
  CRM_CONNECTION_STATUS_LABELS,
  CRM_PIPELINE_STAGE_LABELS,
  CRM_PIPELINE_STAGE_VALUES,
  CRM_PROPOSAL_STATUS_LABELS,
  CRM_REPLY_STATUS_LABELS,
  CRM_REPLY_STATUS_VALUES,
  CRM_SYNC_JOB_STATUS_LABELS,
} from '@/lib/crm-constants'
import type { CrmWorkspaceData } from '@/lib/crm-workspace'
import { buildBrowserMutationHeaders } from '@/lib/security-client'
import type {
  CrmAccount,
  CrmChannelConnection,
  CrmContact,
  CrmMessage,
  CrmOutreachEvent,
  CrmPipelineStage,
  CrmReplyStatus,
  CrmSyncJob,
} from '@/types/crm'

import { CrmReplyBadge, CrmStageBadge } from './crm-stage-badge'

type CrmWorkspaceProps = {
  initialData: CrmWorkspaceData
}

type TimelineEntry =
  | {
      id: string
      kind: 'message'
      accountId: string
      occurredAt: string
      title: string
      description: string
      meta: string
    }
  | {
      id: string
      kind: 'event'
      accountId: string
      occurredAt: string
      title: string
      description: string
      meta: string
    }

type CrmPatchResponse =
  | { account: CrmAccount }
  | { error?: string; details?: string }
  | null

const MAX_TIMELINE_ENTRIES = 14

function formatDateTime(value: string | null) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function getPrimaryContactMap(contacts: CrmContact[]) {
  return new Map(contacts.map((contact) => [contact.account_id, contact]))
}

function buildTimelineEntries(
  messages: CrmMessage[],
  events: CrmOutreachEvent[]
): TimelineEntry[] {
  const messageEntries: TimelineEntry[] = messages.map((message) => ({
    id: `message-${message.id}`,
    kind: 'message',
    accountId: message.account_id,
    occurredAt:
      message.received_at ??
      message.sent_at ??
      message.updated_at ??
      message.created_at,
    title:
      message.direction === 'inbound'
        ? 'Mensagem recebida'
        : 'Mensagem enviada',
    description:
      message.excerpt ??
      message.body?.slice(0, 180) ??
      'Mensagem sem corpo legível.',
    meta: `${message.channel} · ${message.message_status}`,
  }))

  const eventEntries: TimelineEntry[] = events.map((event) => ({
    id: `event-${event.id}`,
    kind: 'event',
    accountId: event.account_id,
    occurredAt: event.happened_at ?? event.updated_at ?? event.created_at,
    title: event.event_type.replace(/_/g, ' '),
    description:
      event.body?.slice(0, 180) ??
      event.subject ??
      'Evento operacional sem resumo adicional.',
    meta: `${event.channel} · ${event.event_type}`,
  }))

  return [...messageEntries, ...eventEntries].sort(
    (left, right) =>
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
  )
}

function getLatestSyncJobByConnection(syncJobs: CrmSyncJob[]) {
  const map = new Map<string, CrmSyncJob>()

  for (const job of syncJobs) {
    if (!map.has(job.connection_id)) {
      map.set(job.connection_id, job)
    }
  }

  return map
}

function getHealthyConnections(connections: CrmChannelConnection[]) {
  return connections.filter((connection) => connection.connection_status === 'connected')
}

function isFollowUpDue(account: CrmAccount) {
  if (!account.next_follow_up_at) {
    return false
  }

  const followUp = new Date(account.next_follow_up_at)

  return !Number.isNaN(followUp.getTime()) && followUp.getTime() <= Date.now()
}

function isFollowUpSoon(account: CrmAccount) {
  if (!account.next_follow_up_at) {
    return false
  }

  const followUp = new Date(account.next_follow_up_at)
  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000

  return !Number.isNaN(followUp.getTime()) && followUp.getTime() > now && followUp.getTime() <= now + sevenDays
}

function buildConnectionTone(connection: CrmChannelConnection) {
  if (connection.connection_status === 'connected') {
    return 'border-accent/25 bg-accent/8'
  }

  if (connection.connection_status === 'error') {
    return 'border-warning/30 bg-warning/8'
  }

  return 'border-border bg-background'
}

function toDatetimeLocalInput(value: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (input: number) => String(input).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function patchCrmAccount(accountId: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/crm/accounts/${accountId}`, {
    method: 'PATCH',
    headers: buildBrowserMutationHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  })

  const body = (await response.json().catch(() => null)) as CrmPatchResponse

  if (!response.ok || !body || !('account' in body)) {
    const message =
      body && 'account' in body === false ? body.details ?? body.error : null

    throw new Error(message ?? 'Não foi possível atualizar a conta CRM.')
  }

  return body.account
}

export function CrmWorkspace({ initialData }: CrmWorkspaceProps) {
  const [accounts, setAccounts] = useState(initialData.accounts)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialData.accounts[0]?.id ?? null
  )
  const [ownerNameInput, setOwnerNameInput] = useState('')
  const [ownerNotesInput, setOwnerNotesInput] = useState('')
  const [stageInput, setStageInput] = useState<CrmPipelineStage>('new')
  const [replyStatusInput, setReplyStatusInput] =
    useState<CrmReplyStatus>('no_outreach')
  const [followUpInput, setFollowUpInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const primaryContactMap = useMemo(
    () => getPrimaryContactMap(initialData.primaryContacts),
    [initialData.primaryContacts]
  )
  const latestSyncJobByConnection = useMemo(
    () => getLatestSyncJobByConnection(initialData.recentSyncJobs),
    [initialData.recentSyncJobs]
  )
  const timelineEntries = useMemo(
    () => buildTimelineEntries(initialData.recentMessages, initialData.recentOutreachEvents),
    [initialData.recentMessages, initialData.recentOutreachEvents]
  )

  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null

  useEffect(() => {
    if (!selectedAccount) {
      setOwnerNameInput('')
      setOwnerNotesInput('')
      setStageInput('new')
      setReplyStatusInput('no_outreach')
      setFollowUpInput('')
      return
    }

    setOwnerNameInput(selectedAccount.owner_name ?? '')
    setOwnerNotesInput(selectedAccount.owner_notes ?? '')
    setStageInput(selectedAccount.stage)
    setReplyStatusInput(selectedAccount.reply_status)
    setFollowUpInput(toDatetimeLocalInput(selectedAccount.next_follow_up_at))
    setActionMessage(null)
    setActionError(null)
  }, [selectedAccount])

  const selectedPrimaryContact = selectedAccount
    ? primaryContactMap.get(selectedAccount.id) ?? null
    : null

  const awaitingReplyAccounts = accounts.filter(
    (account) =>
      account.reply_status === 'awaiting_reply' || account.stage === 'awaiting_reply'
  )
  const followUpDueAccounts = accounts.filter(isFollowUpDue)
  const healthyConnections = getHealthyConnections(initialData.connections)
  const selectedTimeline = selectedAccount
    ? timelineEntries
        .filter((entry) => entry.accountId === selectedAccount.id)
        .slice(0, MAX_TIMELINE_ENTRIES)
    : []

  async function handleSaveAccount() {
    if (!selectedAccount) {
      return
    }

    setIsSaving(true)
    setActionError(null)
    setActionMessage(null)

    try {
      const updatedAccount = await patchCrmAccount(selectedAccount.id, {
        stage: stageInput,
        reply_status: replyStatusInput,
        owner_name: ownerNameInput || null,
        owner_notes: ownerNotesInput || null,
        next_follow_up_at: followUpInput || null,
      })

      setAccounts((currentAccounts) =>
        currentAccounts.map((account) =>
          account.id === updatedAccount.id ? updatedAccount : account
        )
      )
      setActionMessage('Conta CRM atualizada.')
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Falha inesperada ao atualizar a conta CRM.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-6 py-8 sm:px-10 lg:px-12">
      <section className="rounded-[2rem] border border-border bg-surface p-8 shadow-[0_22px_80px_rgba(17,24,18,0.10)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl space-y-4">
            <p className="inline-flex w-fit items-center rounded-full border border-border bg-surface-strong px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-muted">
              CRM Phase 06 · Workspace & Safety
            </p>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Workspace CRM com pipeline, filas e saúde de conexão.
              </h1>
              <p className="max-w-3xl text-base leading-7 text-muted sm:text-lg">
                Esta visão centraliza contas convertidas, histórico recente,
                filas de follow-up, conectores de email e WhatsApp, além do
                detalhe operacional de cada empresa em uma tela dedicada.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <SignOutButton />
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-border bg-surface-strong px-5 py-3 text-sm font-semibold transition hover:border-accent/40 hover:text-accent"
            >
              Voltar ao radar de leads
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.35rem] border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Contas CRM
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
            {accounts.length}
          </p>
        </div>
        <div className="rounded-[1.35rem] border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Aguardando resposta
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#9b711b] dark:text-[#efc16c]">
            {awaitingReplyAccounts.length}
          </p>
        </div>
        <div className="rounded-[1.35rem] border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Follow-up vencido
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-warning">
            {followUpDueAccounts.length}
          </p>
        </div>
        <div className="rounded-[1.35rem] border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Conectores saudáveis
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-accent">
            {healthyConnections.length}
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                  Pipeline board
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Contas agrupadas por etapa para priorizar avanço comercial e
                  espera por resposta.
                </p>
              </div>
              <div className="rounded-full border border-border bg-surface-strong px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">
                {accounts.length === 0 ? 'sem contas no CRM' : `${accounts.length} contas carregadas`}
              </div>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max gap-3">
                {CRM_PIPELINE_STAGE_VALUES.map((stage) => {
                  const stageAccounts = accounts.filter((account) => account.stage === stage)

                  return (
                    <div
                      key={stage}
                      className="w-[250px] rounded-[1.35rem] border border-border bg-surface-strong p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold tracking-[-0.02em]">
                            {CRM_PIPELINE_STAGE_LABELS[stage]}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">
                            {stageAccounts.length} conta{stageAccounts.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <CrmStageBadge stage={stage} />
                      </div>

                      <div className="mt-4 grid gap-3">
                        {stageAccounts.length > 0 ? (
                          stageAccounts.map((account) => {
                            const isSelected = account.id === selectedAccount?.id
                            const primaryContact = primaryContactMap.get(account.id) ?? null
                            const followUpSoon = isFollowUpSoon(account)
                            const followUpDue = isFollowUpDue(account)

                            return (
                              <button
                                key={account.id}
                                type="button"
                                onClick={() => setSelectedAccountId(account.id)}
                                className={`rounded-[1.15rem] border px-4 py-3 text-left transition ${
                                  isSelected
                                    ? 'border-transparent bg-foreground text-background shadow-[0_18px_30px_rgba(17,24,18,0.18)]'
                                    : 'border-border bg-background hover:border-accent/35'
                                }`}
                              >
                                <div className="space-y-2">
                                  <p className="text-sm font-semibold tracking-[-0.02em]">
                                    {account.company_name}
                                  </p>
                                  <p className={`text-sm leading-6 ${isSelected ? 'text-background/75' : 'text-muted'}`}>
                                    {(primaryContact?.full_name ?? account.segment ?? 'sem contato') + ' · ' + account.city}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <CrmReplyBadge replyStatus={account.reply_status} />
                                    {followUpDue && (
                                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">
                                        Follow-up vencido
                                      </span>
                                    )}
                                    {!followUpDue && followUpSoon && (
                                      <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                                        Follow-up em breve
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            )
                          })
                        ) : (
                          <div className="rounded-[1.1rem] border border-dashed border-border bg-background px-4 py-5 text-sm leading-6 text-muted">
                            Nenhuma conta nesta etapa.
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                Conectores e sync
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Saúde operacional dos canais que alimentam a detecção automática
                de resposta.
              </p>
            </div>

            <div className="grid gap-3">
              {initialData.connections.length > 0 ? (
                initialData.connections.map((connection) => {
                  const latestJob = latestSyncJobByConnection.get(connection.id)

                  return (
                    <div
                      key={connection.id}
                      className={`rounded-[1.35rem] border p-4 ${buildConnectionTone(connection)}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold tracking-[-0.02em]">
                            {connection.display_name ??
                              CRM_CONNECTION_CHANNEL_LABELS[connection.channel]}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">
                            {CRM_CONNECTION_CHANNEL_LABELS[connection.channel]} · {connection.provider}
                          </p>
                        </div>
                        <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
                          {CRM_CONNECTION_STATUS_LABELS[connection.connection_status]}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-2 text-sm leading-6 text-muted">
                        <p>Último sync: {formatDateTime(connection.last_synced_at)}</p>
                        <p>Último webhook: {formatDateTime(connection.last_webhook_at)}</p>
                        <p>
                          Último job:{' '}
                          {latestJob
                            ? `${CRM_SYNC_JOB_STATUS_LABELS[latestJob.job_status]} · ${latestJob.records_processed} registros`
                            : 'sem histórico recente'}
                        </p>
                        {connection.last_error ? (
                          <p className="text-warning">Erro recente: {connection.last_error}</p>
                        ) : null}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="rounded-[1.35rem] border border-dashed border-border bg-surface-strong px-5 py-8 text-sm leading-6 text-muted">
                  Nenhum conector CRM registrado ainda. Assim que email ou WhatsApp
                  forem conectados manualmente, o workspace passa a mostrar saúde,
                  último sync e falhas recentes.
                </div>
              )}
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                Filas operacionais
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                Atalhos para as empresas que mais precisam de atenção agora.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-[1.35rem] border border-border bg-surface-strong p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold tracking-[-0.02em]">
                    Aguardando resposta
                  </p>
                  <span className="text-xs uppercase tracking-[0.14em] text-muted">
                    {awaitingReplyAccounts.length}
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  {awaitingReplyAccounts.length > 0 ? (
                    awaitingReplyAccounts.slice(0, 6).map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => setSelectedAccountId(account.id)}
                        className="rounded-[1.1rem] border border-border bg-background px-4 py-3 text-left transition hover:border-accent/35"
                      >
                        <p className="text-sm font-semibold tracking-[-0.02em]">
                          {account.company_name}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted">
                          Último contato: {formatDateTime(account.last_contact_at)}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[1.1rem] border border-dashed border-border bg-background px-4 py-5 text-sm leading-6 text-muted">
                      Nenhuma conta está aguardando resposta agora.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-border bg-surface-strong p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold tracking-[-0.02em]">
                    Follow-up vencido
                  </p>
                  <span className="text-xs uppercase tracking-[0.14em] text-muted">
                    {followUpDueAccounts.length}
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  {followUpDueAccounts.length > 0 ? (
                    followUpDueAccounts.slice(0, 6).map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => setSelectedAccountId(account.id)}
                        className="rounded-[1.1rem] border border-border bg-background px-4 py-3 text-left transition hover:border-accent/35"
                      >
                        <p className="text-sm font-semibold tracking-[-0.02em]">
                          {account.company_name}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted">
                          Follow-up: {formatDateTime(account.next_follow_up_at)}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[1.1rem] border border-dashed border-border bg-background px-4 py-5 text-sm leading-6 text-muted">
                      Nenhum follow-up vencido no momento.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
          {selectedAccount ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                    Detalhe da conta
                  </p>
                  <div className="space-y-2">
                    <h2 className="text-3xl font-semibold tracking-[-0.04em]">
                      {selectedAccount.company_name}
                    </h2>
                    <p className="text-sm leading-6 text-muted">
                      {(selectedAccount.segment ?? 'segmento não informado') + ' · ' + selectedAccount.city}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <CrmStageBadge stage={selectedAccount.stage} />
                  <CrmReplyBadge replyStatus={selectedAccount.reply_status} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                    Contato principal
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-6">
                    <p className="font-semibold">
                      {selectedPrimaryContact?.full_name ?? 'Não definido'}
                    </p>
                    <p className="text-muted">
                      {selectedPrimaryContact?.email ??
                        selectedPrimaryContact?.whatsapp ??
                        selectedAccount.email ??
                        selectedAccount.phone ??
                        'Sem canal registrado'}
                    </p>
                  </div>
                </div>

                <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                    Estado comercial
                  </p>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-muted">
                    <p>Proposta: {CRM_PROPOSAL_STATUS_LABELS[selectedAccount.proposal_status]}</p>
                    <p>Último contato: {formatDateTime(selectedAccount.last_contact_at)}</p>
                    <p>Última resposta: {formatDateTime(selectedAccount.reply_received_at)}</p>
                    <p>Follow-up: {formatDateTime(selectedAccount.next_follow_up_at)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                      Ajustes rápidos
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Atualize etapa, resposta, follow-up e notas sem sair do workspace.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-2 rounded-[1.15rem] border border-border bg-background px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                        Etapa
                      </span>
                      <select
                        value={stageInput}
                        onChange={(event) =>
                          setStageInput(event.target.value as CrmPipelineStage)
                        }
                        className="bg-transparent text-sm outline-none"
                      >
                        {CRM_PIPELINE_STAGE_VALUES.map((stage) => (
                          <option key={stage} value={stage}>
                            {CRM_PIPELINE_STAGE_LABELS[stage]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-2 rounded-[1.15rem] border border-border bg-background px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                        Resposta
                      </span>
                      <select
                        value={replyStatusInput}
                        onChange={(event) =>
                          setReplyStatusInput(event.target.value as CrmReplyStatus)
                        }
                        className="bg-transparent text-sm outline-none"
                      >
                        {CRM_REPLY_STATUS_VALUES.map((replyStatus) => (
                          <option key={replyStatus} value={replyStatus}>
                            {CRM_REPLY_STATUS_LABELS[replyStatus]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-2 rounded-[1.15rem] border border-border bg-background px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                        Responsável
                      </span>
                      <input
                        value={ownerNameInput}
                        onChange={(event) => setOwnerNameInput(event.target.value)}
                        placeholder="Nome interno do responsável"
                        className="border-none bg-transparent text-sm outline-none placeholder:text-muted"
                      />
                    </label>

                    <label className="flex flex-col gap-2 rounded-[1.15rem] border border-border bg-background px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                        Próximo follow-up
                      </span>
                      <input
                        type="datetime-local"
                        value={followUpInput}
                        onChange={(event) => setFollowUpInput(event.target.value)}
                        className="border-none bg-transparent text-sm outline-none"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-2 rounded-[1.15rem] border border-border bg-background px-4 py-3">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
                      Notas internas
                    </span>
                    <textarea
                      value={ownerNotesInput}
                      onChange={(event) => setOwnerNotesInput(event.target.value)}
                      placeholder="Resumo comercial, objeções, próximos passos..."
                      rows={4}
                      className="resize-none border-none bg-transparent text-sm outline-none placeholder:text-muted"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSaveAccount}
                      disabled={isSaving}
                      className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-wait disabled:opacity-75"
                    >
                      {isSaving ? 'Salvando...' : 'Salvar ajustes'}
                    </button>

                    {actionMessage ? (
                      <p className="rounded-[1.1rem] border border-accent/25 bg-accent/10 px-4 py-3 text-sm leading-6 text-accent">
                        {actionMessage}
                      </p>
                    ) : null}

                    {actionError ? (
                      <p className="rounded-[1.1rem] border border-warning/35 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
                        {actionError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                      Timeline e auditoria
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Histórico combinado de mensagens e eventos operacionais da conta selecionada.
                    </p>
                  </div>
                  <div className="rounded-full border border-border bg-background px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
                    {selectedTimeline.length} registro{selectedTimeline.length === 1 ? '' : 's'}
                  </div>
                </div>

                {selectedTimeline.length > 0 ? (
                  <ul className="mt-4 grid gap-3">
                    {selectedTimeline.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-[1.1rem] border border-border bg-background px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-semibold tracking-[-0.02em]">
                            {entry.title}
                          </p>
                          <span className="text-xs uppercase tracking-[0.14em] text-muted">
                            {formatDateTime(entry.occurredAt)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted">
                          {entry.description}
                        </p>
                        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                          {entry.meta}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-4 rounded-[1.1rem] border border-dashed border-border bg-background px-4 py-5 text-sm leading-6 text-muted">
                    Ainda não há mensagens ou eventos suficientes para montar a timeline desta conta.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[420px] items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-surface-strong px-6 text-center">
              <div className="space-y-3">
                <p className="text-lg font-semibold tracking-[-0.03em]">
                  Nenhuma conta CRM disponível
                </p>
                <p className="text-sm leading-6 text-muted">
                  Converta um lead para o CRM e esta tela passa a mostrar pipeline,
                  filas, timeline e conectores em um só lugar.
                </p>
              </div>
            </div>
          )}
        </article>
      </section>
    </main>
  )
}
