'use client'

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

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
  | { id: string; kind: 'message'; accountId: string; occurredAt: string; title: string; description: string; meta: string }
  | { id: string; kind: 'event'; accountId: string; occurredAt: string; title: string; description: string; meta: string }

type CrmPatchResponse = { account: CrmAccount } | { error?: string; details?: string } | null

type PendingMove = {
  accountId: string
  fromStage: CrmPipelineStage
  toStage: CrmPipelineStage
}

const MAX_TIMELINE_ENTRIES = 14

// Stage color config
const STAGE_BORDER_COLOR: Record<CrmPipelineStage, string> = {
  new: '#94a3b8',
  researching: '#94a3b8',
  proposal_ready: '#f59e0b',
  contacted: '#f59e0b',
  awaiting_reply: 'var(--accent)',
  replied: 'var(--accent)',
  meeting_scheduled: '#8b5cf6',
  won: 'var(--accent)',
  lost: 'var(--warning)',
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function getPrimaryContactMap(contacts: CrmContact[]) {
  return new Map(contacts.map((c) => [c.account_id, c]))
}

function buildTimelineEntries(messages: CrmMessage[], events: CrmOutreachEvent[]): TimelineEntry[] {
  const msg: TimelineEntry[] = messages.map((m) => ({
    id: `message-${m.id}`,
    kind: 'message',
    accountId: m.account_id,
    occurredAt: m.received_at ?? m.sent_at ?? m.updated_at ?? m.created_at,
    title: m.direction === 'inbound' ? 'Mensagem recebida' : 'Mensagem enviada',
    description: m.excerpt ?? m.body?.slice(0, 180) ?? 'Mensagem sem corpo legível.',
    meta: `${m.channel} · ${m.message_status}`,
  }))
  const evt: TimelineEntry[] = events.map((e) => ({
    id: `event-${e.id}`,
    kind: 'event',
    accountId: e.account_id,
    occurredAt: e.happened_at ?? e.updated_at ?? e.created_at,
    title: e.event_type.replace(/_/g, ' '),
    description: e.body?.slice(0, 180) ?? e.subject ?? 'Evento operacional sem resumo adicional.',
    meta: `${e.channel} · ${e.event_type}`,
  }))
  return [...msg, ...evt].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
}

function getLatestSyncJobByConnection(syncJobs: CrmSyncJob[]) {
  const map = new Map<string, CrmSyncJob>()
  for (const job of syncJobs) {
    if (!map.has(job.connection_id)) map.set(job.connection_id, job)
  }
  return map
}

function getHealthyConnections(connections: CrmChannelConnection[]) {
  return connections.filter((c) => c.connection_status === 'connected')
}

function isFollowUpDue(account: CrmAccount) {
  if (!account.next_follow_up_at) return false
  const d = new Date(account.next_follow_up_at)
  return !Number.isNaN(d.getTime()) && d.getTime() <= Date.now()
}

function isFollowUpSoon(account: CrmAccount) {
  if (!account.next_follow_up_at) return false
  const d = new Date(account.next_follow_up_at)
  const now = Date.now()
  return !Number.isNaN(d.getTime()) && d.getTime() > now && d.getTime() <= now + 7 * 24 * 60 * 60 * 1000
}

function buildConnectionTone(connection: CrmChannelConnection) {
  if (connection.connection_status === 'connected') return 'border-accent/25 bg-accent/8'
  if (connection.connection_status === 'error') return 'border-warning/30 bg-warning/8'
  return 'border-border bg-background'
}

function toDatetimeLocalInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function patchCrmAccount(accountId: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/crm/accounts/${accountId}`, {
    method: 'PATCH',
    headers: buildBrowserMutationHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })
  const body = (await response.json().catch(() => null)) as CrmPatchResponse
  if (!response.ok || !body || !('account' in body)) {
    const message = body && 'account' in body === false ? body.details ?? body.error : null
    throw new Error(message ?? 'Não foi possível atualizar a conta CRM.')
  }
  return body.account
}

// ─── Sortable card ────────────────────────────────────────────────────────────

type AccountCardProps = {
  account: CrmAccount
  primaryContact: CrmContact | null
  isSelected: boolean
  isDragging?: boolean
  pendingMove: PendingMove | null
  onSelect: (id: string) => void
  onConfirmMove: () => void
  onCancelMove: () => void
}

function AccountCard({
  account,
  primaryContact,
  isSelected,
  isDragging,
  pendingMove,
  onSelect,
  onConfirmMove,
  onCancelMove,
}: AccountCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: account.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const followUpDue = isFollowUpDue(account)
  const followUpSoon = isFollowUpSoon(account)
  const isPending = pendingMove?.accountId === account.id

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, background: 'var(--card-gradient)' }}
      className={`rounded-[1.15rem] border transition-all duration-200 ${
        isDragging
          ? 'opacity-40 border-dashed border-accent bg-accent/5'
          : isSelected
            ? 'border-accent shadow-[0_0_0_3px_var(--glow-accent)]'
            : 'border-border hover:border-accent/35 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(17,24,18,0.10)]'
      }`}
    >
      <div className="px-4 py-3">
        {/* Grip + name */}
        <div className="flex items-start gap-2">
          <button
            className="mt-0.5 cursor-grab text-muted opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
            {...attributes}
            {...listeners}
            aria-label="Arrastar card"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <circle cx="7" cy="6" r="1.2" /><circle cx="13" cy="6" r="1.2" />
              <circle cx="7" cy="10" r="1.2" /><circle cx="13" cy="10" r="1.2" />
              <circle cx="7" cy="14" r="1.2" /><circle cx="13" cy="14" r="1.2" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => onSelect(account.id)}
            className="flex-1 text-left"
          >
            <p className="text-sm font-semibold tracking-[-0.02em] leading-tight">{account.company_name}</p>
            <p className="mt-0.5 text-xs text-muted leading-5">
              {(primaryContact?.full_name ?? account.segment ?? 'sem contato') + ' · ' + account.city}
            </p>
          </button>
        </div>

        {/* Badges */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <CrmReplyBadge replyStatus={account.reply_status} />
          {followUpDue && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning">
              Follow-up vencido
            </span>
          )}
          {!followUpDue && followUpSoon && (
            <span className="rounded-full bg-[#f59e0b]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#92600a] dark:text-[#efc16c]">
              em {Math.ceil((new Date(account.next_follow_up_at!).getTime() - Date.now()) / 86400000)}d
            </span>
          )}
        </div>

        {/* Inline confirm move */}
        {isPending && pendingMove && (
          <div className="mt-3 rounded-[0.85rem] border border-accent/30 bg-accent/8 px-3 py-2">
            <p className="text-xs font-semibold text-accent">
              Mover para <span className="font-bold">{CRM_PIPELINE_STAGE_LABELS[pendingMove.toStage]}</span>?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onConfirmMove}
                className="rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-accent/90"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={onCancelMove}
                className="rounded-full border border-border px-3 py-1 text-[11px] text-muted transition hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Score bar */}
        {(() => {
          const scores = [account.score_mobile, account.score_speed, account.score_seo, account.score_design].filter((s): s is number => s !== null)
          if (scores.length === 0) return null
          const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          return (
            <div className="mt-2.5 flex items-center gap-2">
              <div className="h-[3px] flex-1 rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${Math.min(avg, 100)}%` }} />
              </div>
              <span className="text-[10px] text-muted">{avg}</span>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ─── Kanban column ────────────────────────────────────────────────────────────

type KanbanColumnProps = {
  stage: CrmPipelineStage
  accounts: CrmAccount[]
  selectedAccountId: string | null
  primaryContactMap: Map<string, CrmContact>
  pendingMove: PendingMove | null
  activeId: string | null
  onSelect: (id: string) => void
  onConfirmMove: () => void
  onCancelMove: () => void
}

function KanbanColumn({
  stage,
  accounts,
  selectedAccountId,
  primaryContactMap,
  pendingMove,
  activeId,
  onSelect,
  onConfirmMove,
  onCancelMove,
}: KanbanColumnProps) {
  const isDropTarget = pendingMove?.toStage === stage
  const borderColor = STAGE_BORDER_COLOR[stage]

  return (
    <div
      className={`flex w-[240px] shrink-0 flex-col rounded-[1.35rem] border transition-all duration-200 ${
        isDropTarget ? 'ring-2 ring-accent bg-accent/5' : 'border-border bg-surface-strong'
      }`}
    >
      {/* Column header */}
      <div
        className="rounded-t-[1.35rem] px-4 pt-4 pb-3"
        style={{ borderTop: `3px solid ${borderColor}` }}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold tracking-[-0.02em] leading-tight">
            {CRM_PIPELINE_STAGE_LABELS[stage]}
          </p>
          <span className="rounded-full bg-border/60 px-2 py-0.5 text-[10px] font-semibold text-muted">
            {accounts.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <SortableContext items={accounts.map((a) => a.id)} strategy={verticalListSortingStrategy}>
        <div className="group flex flex-col gap-2 px-3 pb-4 pt-1">
          {accounts.length > 0 ? (
            accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                primaryContact={primaryContactMap.get(account.id) ?? null}
                isSelected={account.id === selectedAccountId}
                isDragging={account.id === activeId}
                pendingMove={pendingMove}
                onSelect={onSelect}
                onConfirmMove={onConfirmMove}
                onCancelMove={onCancelMove}
              />
            ))
          ) : (
            <div className="rounded-[1.1rem] border border-dashed border-border px-4 py-5 text-xs text-muted text-center">
              Vazio
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// ─── Main workspace ───────────────────────────────────────────────────────────

export function CrmWorkspace({ initialData }: CrmWorkspaceProps) {
  const [accounts, setAccounts] = useState(initialData.accounts)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(initialData.accounts[0]?.id ?? null)
  const [ownerNameInput, setOwnerNameInput] = useState('')
  const [ownerNotesInput, setOwnerNotesInput] = useState('')
  const [stageInput, setStageInput] = useState<CrmPipelineStage>('new')
  const [replyStatusInput, setReplyStatusInput] = useState<CrmReplyStatus>('no_outreach')
  const [followUpInput, setFollowUpInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Drag-and-drop state
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const pendingMoveRef = useRef<PendingMove | null>(null)
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const primaryContactMap = useMemo(() => getPrimaryContactMap(initialData.primaryContacts), [initialData.primaryContacts])
  const latestSyncJobByConnection = useMemo(() => getLatestSyncJobByConnection(initialData.recentSyncJobs), [initialData.recentSyncJobs])
  const timelineEntries = useMemo(() => buildTimelineEntries(initialData.recentMessages, initialData.recentOutreachEvents), [initialData.recentMessages, initialData.recentOutreachEvents])

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0] ?? null

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

  // Auto-cancel pending move after 6s
  useEffect(() => {
    if (pendingMove) {
      revertTimerRef.current = setTimeout(() => {
        cancelPendingMove()
      }, 6000)
    }
    return () => {
      if (revertTimerRef.current) clearTimeout(revertTimerRef.current)
    }
  }, [pendingMove])

  const selectedPrimaryContact = selectedAccount ? primaryContactMap.get(selectedAccount.id) ?? null : null
  const awaitingReplyAccounts = accounts.filter((a) => a.reply_status === 'awaiting_reply' || a.stage === 'awaiting_reply')
  const followUpDueAccounts = accounts.filter(isFollowUpDue)
  const healthyConnections = getHealthyConnections(initialData.connections)
  const selectedTimeline = selectedAccount ? timelineEntries.filter((e) => e.accountId === selectedAccount.id).slice(0, MAX_TIMELINE_ENTRIES) : []

  // Drag handlers
  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedId = String(active.id)
    const overId = String(over.id)

    const draggedAccount = accounts.find((a) => a.id === draggedId)
    if (!draggedAccount) return

    // Find target stage — over.id might be a column stage or an account id
    const targetStage = (CRM_PIPELINE_STAGE_VALUES as readonly string[]).includes(overId)
      ? (overId as CrmPipelineStage)
      : accounts.find((a) => a.id === overId)?.stage

    if (!targetStage || targetStage === draggedAccount.stage) return

    const move: PendingMove = { accountId: draggedId, fromStage: draggedAccount.stage, toStage: targetStage }
    pendingMoveRef.current = move

    // Optimistic: move visually
    setAccounts((prev) => prev.map((a) => a.id === draggedId ? { ...a, stage: targetStage } : a))
    setPendingMove(move)
  }

  async function confirmPendingMove() {
    const move = pendingMoveRef.current
    if (!move) return
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current)
    setPendingMove(null)
    pendingMoveRef.current = null

    try {
      const updated = await patchCrmAccount(move.accountId, { stage: move.toStage })
      setAccounts((prev) => prev.map((a) => a.id === updated.id ? updated : a))
    } catch {
      // Revert on API failure
      setAccounts((prev) => prev.map((a) => a.id === move.accountId ? { ...a, stage: move.fromStage } : a))
      setActionError('Falha ao mover conta. Revertido.')
    }
  }

  function cancelPendingMove() {
    const move = pendingMoveRef.current
    if (!move) return
    if (revertTimerRef.current) clearTimeout(revertTimerRef.current)
    setAccounts((prev) => prev.map((a) => a.id === move.accountId ? { ...a, stage: move.fromStage } : a))
    setPendingMove(null)
    pendingMoveRef.current = null
  }

  async function handleSaveAccount() {
    if (!selectedAccount) return
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
      setAccounts((curr) => curr.map((a) => a.id === updatedAccount.id ? updatedAccount : a))
      setActionMessage('Conta CRM atualizada.')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Falha inesperada ao atualizar a conta CRM.')
    } finally {
      setIsSaving(false)
    }
  }

  const activeAccount = activeId ? accounts.find((a) => a.id === activeId) : null

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-6 py-8 sm:px-10 lg:px-12">
      {/* Header */}
      <section className="rounded-[2rem] border border-border bg-surface p-8 shadow-[0_22px_80px_rgba(17,24,18,0.10)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl space-y-4">
            <p className="inline-flex w-fit items-center rounded-full border border-border bg-surface-strong px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-muted">
              Lead Hunter · CRM Workspace
            </p>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Workspace CRM
              </h1>
              <p className="max-w-3xl text-base leading-7 text-muted sm:text-lg">
                Pipeline, filas de follow-up, timeline e saúde de conexão em uma tela.
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

      {/* Stats */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.35rem] border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Contas CRM</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{accounts.length}</p>
        </div>
        <div className="rounded-[1.35rem] border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Aguardando resposta</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#9b711b] dark:text-[#efc16c]">{awaitingReplyAccounts.length}</p>
        </div>
        <div className="rounded-[1.35rem] border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Follow-up vencido</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-warning">{followUpDueAccounts.length}</p>
        </div>
        <div className="rounded-[1.35rem] border border-border bg-surface p-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Conectores saudáveis</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-accent">{healthyConnections.length}</p>
        </div>
      </section>

      {/* Kanban pipeline */}
      <article className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Pipeline board</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Arraste os cards entre colunas para mudar o estágio. Confirme antes de persistir.
              </p>
            </div>
            <div className="rounded-full border border-border bg-surface-strong px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">
              {accounts.length === 0 ? 'sem contas no CRM' : `${accounts.length} contas carregadas`}
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div
              className="overflow-x-auto pb-3"
              style={{ scrollSnapType: 'x mandatory' }}
            >
              <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
                {CRM_PIPELINE_STAGE_VALUES.map((stage) => {
                  const stageAccounts = accounts.filter((a) => a.stage === stage)
                  return (
                    <div key={stage} style={{ scrollSnapAlign: 'start' }}>
                      <KanbanColumn
                        stage={stage}
                        accounts={stageAccounts}
                        selectedAccountId={selectedAccountId}
                        primaryContactMap={primaryContactMap}
                        pendingMove={pendingMove}
                        activeId={activeId}
                        onSelect={setSelectedAccountId}
                        onConfirmMove={confirmPendingMove}
                        onCancelMove={cancelPendingMove}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            <DragOverlay>
              {activeAccount ? (
                <div className="w-[240px] rounded-[1.15rem] border border-accent shadow-[0_16px_48px_rgba(17,24,18,0.22)] rotate-1 opacity-95" style={{ background: 'var(--card-gradient)' }}>
                  <div className="px-4 py-3">
                    <p className="text-sm font-semibold tracking-[-0.02em]">{activeAccount.company_name}</p>
                    <p className="mt-0.5 text-xs text-muted">{activeAccount.city}</p>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </article>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        {/* Queues */}
        <article className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Filas operacionais</h2>
              <p className="mt-2 text-sm leading-6 text-muted">Empresas que precisam de atenção agora.</p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-[1.35rem] border border-border bg-surface-strong p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold tracking-[-0.02em]">Aguardando resposta</p>
                  <span className="text-xs uppercase tracking-[0.14em] text-muted">{awaitingReplyAccounts.length}</span>
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
                        <p className="text-sm font-semibold tracking-[-0.02em]">{account.company_name}</p>
                        <p className="mt-1 text-sm leading-6 text-muted">Último contato: {formatDateTime(account.last_contact_at)}</p>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[1.1rem] border border-dashed border-border bg-background px-4 py-5 text-sm leading-6 text-muted">
                      Nenhuma conta aguardando resposta agora.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-border bg-surface-strong p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold tracking-[-0.02em]">Follow-up vencido</p>
                  <span className="text-xs uppercase tracking-[0.14em] text-muted">{followUpDueAccounts.length}</span>
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
                        <p className="text-sm font-semibold tracking-[-0.02em]">{account.company_name}</p>
                        <p className="mt-1 text-sm leading-6 text-muted">Follow-up: {formatDateTime(account.next_follow_up_at)}</p>
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

        {/* Account detail + connectors */}
        <div className="flex flex-col gap-6">
          <article className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
            {selectedAccount ? (
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Detalhe da conta</p>
                    <h2 className="text-3xl font-semibold tracking-[-0.04em]">{selectedAccount.company_name}</h2>
                    <p className="text-sm leading-6 text-muted">{(selectedAccount.segment ?? 'segmento não informado') + ' · ' + selectedAccount.city}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CrmStageBadge stage={selectedAccount.stage} />
                    <CrmReplyBadge replyStatus={selectedAccount.reply_status} />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Contato principal</p>
                    <div className="mt-3 space-y-2 text-sm leading-6">
                      <p className="font-semibold">{selectedPrimaryContact?.full_name ?? 'Não definido'}</p>
                      <p className="text-muted">{selectedPrimaryContact?.email ?? selectedPrimaryContact?.whatsapp ?? selectedAccount.email ?? selectedAccount.phone ?? 'Sem canal registrado'}</p>
                    </div>
                  </div>
                  <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Estado comercial</p>
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
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Ajustes rápidos</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-2 rounded-[1.15rem] border border-border bg-background px-4 py-3">
                        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Etapa</span>
                        <select value={stageInput} onChange={(e) => setStageInput(e.target.value as CrmPipelineStage)} className="bg-transparent text-sm outline-none">
                          {CRM_PIPELINE_STAGE_VALUES.map((s) => <option key={s} value={s}>{CRM_PIPELINE_STAGE_LABELS[s]}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-2 rounded-[1.15rem] border border-border bg-background px-4 py-3">
                        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Resposta</span>
                        <select value={replyStatusInput} onChange={(e) => setReplyStatusInput(e.target.value as CrmReplyStatus)} className="bg-transparent text-sm outline-none">
                          {CRM_REPLY_STATUS_VALUES.map((r) => <option key={r} value={r}>{CRM_REPLY_STATUS_LABELS[r]}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-2 rounded-[1.15rem] border border-border bg-background px-4 py-3">
                        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Responsável</span>
                        <input value={ownerNameInput} onChange={(e) => setOwnerNameInput(e.target.value)} placeholder="Nome interno do responsável" className="border-none bg-transparent text-sm outline-none placeholder:text-muted" />
                      </label>
                      <label className="flex flex-col gap-2 rounded-[1.15rem] border border-border bg-background px-4 py-3">
                        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Próximo follow-up</span>
                        <input type="datetime-local" value={followUpInput} onChange={(e) => setFollowUpInput(e.target.value)} className="border-none bg-transparent text-sm outline-none" />
                      </label>
                    </div>
                    <label className="flex flex-col gap-2 rounded-[1.15rem] border border-border bg-background px-4 py-3">
                      <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Notas internas</span>
                      <textarea value={ownerNotesInput} onChange={(e) => setOwnerNotesInput(e.target.value)} placeholder="Resumo comercial, objeções, próximos passos..." rows={4} className="resize-none border-none bg-transparent text-sm outline-none placeholder:text-muted" />
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <button type="button" onClick={handleSaveAccount} disabled={isSaving} className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-wait disabled:opacity-75">
                        {isSaving ? 'Salvando...' : 'Salvar ajustes'}
                      </button>
                      {actionMessage && <p className="rounded-[1.1rem] border border-accent/25 bg-accent/10 px-4 py-3 text-sm leading-6 text-accent">{actionMessage}</p>}
                      {actionError && <p className="rounded-[1.1rem] border border-warning/35 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">{actionError}</p>}
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Timeline</p>
                    <div className="rounded-full border border-border bg-background px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
                      {selectedTimeline.length} registro{selectedTimeline.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  {selectedTimeline.length > 0 ? (
                    <ul className="mt-4 grid gap-3">
                      {selectedTimeline.map((entry) => (
                        <li key={entry.id} className="rounded-[1.1rem] border border-border bg-background px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-semibold tracking-[-0.02em]">{entry.title}</p>
                            <span className="text-xs uppercase tracking-[0.14em] text-muted">{formatDateTime(entry.occurredAt)}</span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted">{entry.description}</p>
                          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{entry.meta}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-4 rounded-[1.1rem] border border-dashed border-border bg-background px-4 py-5 text-sm leading-6 text-muted">
                      Ainda não há mensagens ou eventos para esta conta.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-surface-strong px-6 text-center">
                <div className="space-y-3">
                  <p className="text-lg font-semibold tracking-[-0.03em]">Nenhuma conta CRM disponível</p>
                  <p className="text-sm leading-6 text-muted">Converta um lead para o CRM para começar.</p>
                </div>
              </div>
            )}
          </article>

          {/* Connectors */}
          <article className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em]">Conectores e sync</h2>
                <p className="mt-2 text-sm leading-6 text-muted">Saúde operacional dos canais.</p>
              </div>
              <div className="grid gap-3">
                {initialData.connections.length > 0 ? (
                  initialData.connections.map((connection) => {
                    const latestJob = latestSyncJobByConnection.get(connection.id)
                    return (
                      <div key={connection.id} className={`rounded-[1.35rem] border p-4 ${buildConnectionTone(connection)}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold tracking-[-0.02em]">{connection.display_name ?? CRM_CONNECTION_CHANNEL_LABELS[connection.channel]}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">{CRM_CONNECTION_CHANNEL_LABELS[connection.channel]} · {connection.provider}</p>
                          </div>
                          <span className="inline-flex items-center rounded-full bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
                            {CRM_CONNECTION_STATUS_LABELS[connection.connection_status]}
                          </span>
                        </div>
                        <div className="mt-4 grid gap-2 text-sm leading-6 text-muted">
                          <p>Último sync: {formatDateTime(connection.last_synced_at)}</p>
                          <p>Último webhook: {formatDateTime(connection.last_webhook_at)}</p>
                          <p>Último job: {latestJob ? `${CRM_SYNC_JOB_STATUS_LABELS[latestJob.job_status]} · ${latestJob.records_processed} registros` : 'sem histórico recente'}</p>
                          {connection.last_error && <p className="text-warning">Erro recente: {connection.last_error}</p>}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="rounded-[1.35rem] border border-dashed border-border bg-surface-strong px-5 py-8 text-sm leading-6 text-muted">
                    Nenhum conector CRM registrado ainda.
                  </div>
                )}
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}
