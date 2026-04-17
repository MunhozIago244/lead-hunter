'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useRef, useState } from 'react'

import { SignOutButton } from '@/components/auth/sign-out-button'
import { getLeadAverageScore, LEAD_STATUS_VALUES } from '@/lib/leads'
import type { Lead, LeadStatus } from '@/types/lead'

import { LeadDetailPanel } from './lead-detail-panel'
import { LeadStatusBadge } from './lead-status-badge'

type QuickFilter = 'all' | 'critical' | 'no-site' | 'contacted'
type StatusFilter = 'all' | LeadStatus

type LeadFetchFilters = {
  quickFilter: QuickFilter
  status: StatusFilter
  segment: string
  city: string
}

const QUICK_FILTERS: Array<{
  id: QuickFilter
  label: string
  description: string
}> = [
  {
    id: 'all',
    label: 'Todos',
    description: 'Base completa retornada pela API',
  },
  {
    id: 'critical',
    label: 'Críticos',
    description: 'Média abaixo de 40',
  },
  {
    id: 'no-site',
    label: 'Sem site',
    description: 'Empresas sem site próprio',
  },
  {
    id: 'contacted',
    label: 'Contatados',
    description: 'Leads já abordados',
  },
]

function buildLeadsUrl(filters: LeadFetchFilters) {
  const params = new URLSearchParams()

  if (filters.quickFilter !== 'all') {
    params.set('filter', filters.quickFilter)
  }

  if (filters.status !== 'all') {
    params.set('status', filters.status)
  }

  if (filters.segment !== 'all') {
    params.set('segment', filters.segment)
  }

  if (filters.city !== 'all') {
    params.set('city', filters.city)
  }

  const query = params.toString()
  return query ? `/api/leads?${query}` : '/api/leads'
}

async function requestLeads(
  filters: LeadFetchFilters,
  signal: AbortSignal
): Promise<Lead[]> {
  const response = await fetch(buildLeadsUrl(filters), {
    method: 'GET',
    cache: 'no-store',
    signal,
  })

  const payload = (await response.json().catch(() => null)) as
    | Lead[]
    | { error?: string; details?: string }
    | null

  if (!response.ok) {
    const message =
      payload && !Array.isArray(payload)
        ? payload.details ?? payload.error
        : null

    throw new Error(message ?? 'Nao foi possivel carregar os leads.')
  }

  return Array.isArray(payload) ? payload : []
}

function formatAverageScore(lead: Lead) {
  const averageScore = getLeadAverageScore(lead)
  return averageScore === null ? '--' : `${averageScore}`
}

function scoreTone(lead: Lead) {
  const averageScore = getLeadAverageScore(lead)

  if (averageScore === null) {
    return 'text-muted'
  }

  if (averageScore < 40) {
    return 'text-warning'
  }

  if (averageScore < 70) {
    return 'text-[#84601d] dark:text-[#efc16c]'
  }

  return 'text-accent'
}

function buildLeadMeta(lead: Lead) {
  const parts = [lead.segment || 'segmento não informado', lead.city]

  if (!lead.has_site) {
    parts.push('sem site')
  }

  return parts.join(' · ')
}

function sortUniqueValues(values: string[]) {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, 'pt-BR')
  )
}

function applyLeadUpdate(leads: Lead[], updatedLead: Lead, keepLead: boolean) {
  if (!keepLead) {
    return leads.filter((lead) => lead.id !== updatedLead.id)
  }

  return leads.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead))
}

function matchesActiveApiFilters(lead: Lead, filters: LeadFetchFilters) {
  if (filters.status !== 'all' && lead.status !== filters.status) {
    return false
  }

  if (
    filters.segment !== 'all' &&
    !(lead.segment ?? '').toLowerCase().includes(filters.segment.toLowerCase())
  ) {
    return false
  }

  if (
    filters.city !== 'all' &&
    !lead.city.toLowerCase().includes(filters.city.toLowerCase())
  ) {
    return false
  }

  if (filters.quickFilter === 'no-site' && lead.has_site) {
    return false
  }

  if (
    filters.quickFilter === 'contacted' &&
    filters.status === 'all' &&
    lead.status !== 'contacted'
  ) {
    return false
  }

  if (filters.quickFilter === 'critical') {
    const averageScore = getLeadAverageScore(lead)
    return averageScore !== null && averageScore < 40
  }

  return true
}

export function LeadListDashboard() {
  const hasLoadedInitialResults = useRef(false)
  const [catalogLeads, setCatalogLeads] = useState<Lead[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [segmentFilter, setSegmentFilter] = useState('all')
  const [cityFilter, setCityFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [loadingState, setLoadingState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>('contacted')
  const [isBulkUpdating, setIsBulkUpdating] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(searchInput)

  useEffect(() => {
    const controller = new AbortController()
    const filters: LeadFetchFilters = {
      quickFilter,
      status: statusFilter,
      segment: segmentFilter,
      city: cityFilter,
    }
    const isPristine =
      filters.quickFilter === 'all' &&
      filters.status === 'all' &&
      filters.segment === 'all' &&
      filters.city === 'all'

    async function loadLeads() {
      const isFirstLoad = !hasLoadedInitialResults.current

      setIsRefreshing(!isFirstLoad)

      setErrorMessage(null)

      try {
        const nextLeads = await requestLeads(filters, controller.signal)

        if (!controller.signal.aborted) {
          setLeads(nextLeads)
          setLoadingState('ready')
          hasLoadedInitialResults.current = true

          if (isPristine) {
            setCatalogLeads((currentLeads) =>
              currentLeads.length === 0 ? nextLeads : currentLeads
            )
          }

          setSelectedLeadId((currentSelectedId) =>
            nextLeads.some((lead) => lead.id === currentSelectedId)
              ? currentSelectedId
              : (nextLeads[0]?.id ?? null)
          )
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Falha inesperada ao carregar leads.'
          )
          setLoadingState(isFirstLoad ? 'error' : 'ready')
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsRefreshing(false)
        }
      }
    }

    loadLeads()

    return () => controller.abort()
  }, [cityFilter, quickFilter, segmentFilter, statusFilter])

  const normalizedSearch = deferredSearch.trim().toLowerCase()
  const visibleLeads = leads.filter((lead) =>
    normalizedSearch
      ? lead.name.toLowerCase().includes(normalizedSearch)
      : true
  )
  const selectedLead =
    visibleLeads.find((lead) => lead.id === selectedLeadId) ??
    visibleLeads[0] ??
    null

  const segmentOptions = sortUniqueValues(
    catalogLeads
      .map((lead) => lead.segment)
      .filter((segment): segment is string => Boolean(segment))
  )
  const cityOptions = sortUniqueValues(catalogLeads.map((lead) => lead.city))

  function handleExportCsv() {
    if (visibleLeads.length === 0) return

    const headers = ['Nome', 'Status', 'Segmento', 'Cidade', 'Telefone', 'Email', 'Site', 'Score médio', 'Tem site']
    const rows = visibleLeads.map((lead) => {
      const avg = getLeadAverageScore(lead)
      return [
        lead.name,
        lead.status,
        lead.segment ?? '',
        lead.city,
        lead.phone ?? '',
        lead.email ?? '',
        lead.site ?? '',
        avg !== null ? String(avg) : '',
        lead.has_site ? 'sim' : 'não',
      ]
    })

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const visibleCount = visibleLeads.length
  const criticalCount = visibleLeads.filter((lead) => {
    const averageScore = getLeadAverageScore(lead)
    return averageScore !== null && averageScore < 40
  }).length

  function toggleLeadSelection(id: string, event: React.MouseEvent) {
    event.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function handleBulkUpdate() {
    if (selectedIds.size === 0 || isBulkUpdating) return
    setIsBulkUpdating(true)
    setBulkError(null)

    try {
      const csrfToken = document.cookie
        .split('; ')
        .find((row) => row.startsWith('lead-hunter-csrf='))
        ?.split('=')[1] ?? ''

      const response = await fetch('/api/leads/bulk', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ ids: [...selectedIds], status: bulkStatus }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        setBulkError(data?.error ?? 'Falha ao atualizar leads em lote.')
        return
      }

      setLeads((prev) =>
        prev.map((lead) =>
          selectedIds.has(lead.id) ? { ...lead, status: bulkStatus } : lead
        )
      )
      setSelectedIds(new Set())
    } catch {
      setBulkError('Erro inesperado ao atualizar.')
    } finally {
      setIsBulkUpdating(false)
    }
  }

  function handleLeadUpdated(updatedLead: Lead) {
    const activeFilters: LeadFetchFilters = {
      quickFilter,
      status: statusFilter,
      segment: segmentFilter,
      city: cityFilter,
    }
    const keepLead = matchesActiveApiFilters(updatedLead, activeFilters)

    setLeads((currentLeads) => applyLeadUpdate(currentLeads, updatedLead, keepLead))
    setCatalogLeads((currentLeads) =>
      applyLeadUpdate(currentLeads, updatedLead, true)
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-8 sm:px-10 lg:px-12">
      <section className="rounded-[2rem] border border-border bg-surface p-8 shadow-[0_22px_80px_rgba(17,24,18,0.10)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="inline-flex w-fit items-center rounded-full border border-border bg-surface-strong px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-muted">
                CRM Phase 06 · Workspace and Safety
              </p>
              <Link
                href="/crm"
                className="inline-flex items-center rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent transition hover:border-accent/40 hover:bg-accent/14"
              >
                Abrir workspace CRM
              </Link>
              <Link
                href="/analytics"
                className="inline-flex items-center rounded-full border border-border bg-surface-strong px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition hover:border-accent/40 hover:text-foreground"
              >
                Analytics
              </Link>
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Operação de leads na entrada e workspace CRM para acompanhamento.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted sm:text-lg">
                A entrada continua focada em descoberta, filtro, pitch e conversão.
                A nova área <code className="rounded bg-black/6 px-1.5 py-0.5 text-[0.95em] dark:bg-white/10">/crm</code> centraliza pipeline,
                fila de follow-up, timeline e saúde das conexões para operar as empresas já promovidas.
              </p>
            </div>
          </div>

          <div className="grid w-full max-w-xl gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3 flex justify-end">
              <SignOutButton />
            </div>
            <div className="rounded-[1.35rem] border border-border bg-surface-strong p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                Leads visíveis
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
                {visibleCount}
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-border bg-surface-strong p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                Críticos
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-warning">
                {criticalCount}
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-border bg-surface-strong p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                Estado da lista
              </p>
              <p className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-accent">
                {loadingState === 'loading'
                  ? 'carregando'
                  : isRefreshing
                    ? 'atualizando'
                    : 'pronto'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <article className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                  Painel de leads
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Filtros rápidos chamam a API. A busca por nome acontece no cliente.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full border border-border bg-surface-strong px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">
                  {isRefreshing ? 'sincronizando lista' : 'fonte: /api/leads'}
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={visibleLeads.length === 0}
                  className="rounded-full border border-border bg-surface-strong px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition hover:border-accent/40 hover:text-foreground disabled:opacity-40"
                >
                  Exportar CSV
                </button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-4">
              {QUICK_FILTERS.map((filter) => {
                const isActive = quickFilter === filter.id

                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setQuickFilter(filter.id)}
                    className={`rounded-[1.35rem] border px-4 py-4 text-left transition ${
                      isActive
                        ? 'border-transparent bg-accent text-white shadow-[0_18px_35px_rgba(13,122,95,0.22)]'
                        : 'border-border bg-surface-strong text-foreground hover:border-accent/40'
                    }`}
                  >
                    <p className="text-sm font-semibold uppercase tracking-[0.16em]">
                      {filter.label}
                    </p>
                    <p
                      className={`mt-2 text-sm leading-6 ${
                        isActive ? 'text-white/80' : 'text-muted'
                      }`}
                    >
                      {filter.description}
                    </p>
                  </button>
                )
              })}
            </div>

            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
              <label className="flex flex-col gap-2 rounded-[1.35rem] border border-border bg-surface-strong px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                  Buscar por nome
                </span>
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Dentista, clínica, restaurante..."
                  className="border-none bg-transparent text-sm outline-none placeholder:text-muted"
                />
              </label>

              <label className="flex flex-col gap-2 rounded-[1.35rem] border border-border bg-surface-strong px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                  Status
                </span>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                  className="bg-transparent text-sm outline-none"
                >
                  <option value="all">Todos</option>
                  {LEAD_STATUS_VALUES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 rounded-[1.35rem] border border-border bg-surface-strong px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                  Segmento
                </span>
                <select
                  value={segmentFilter}
                  onChange={(event) => setSegmentFilter(event.target.value)}
                  className="bg-transparent text-sm outline-none"
                >
                  <option value="all">Todos</option>
                  {segmentOptions.map((segment) => (
                    <option key={segment} value={segment}>
                      {segment}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 rounded-[1.35rem] border border-border bg-surface-strong px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                  Cidade
                </span>
                <select
                  value={cityFilter}
                  onChange={(event) => setCityFilter(event.target.value)}
                  className="bg-transparent text-sm outline-none"
                >
                  <option value="all">Todas</option>
                  {cityOptions.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {errorMessage ? (
              <div className="rounded-[1.35rem] border border-warning/35 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
                {errorMessage}
              </div>
            ) : null}

            {loadingState === 'loading' ? (
              <div className="grid gap-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-[1.35rem] border border-border bg-surface-strong"
                  />
                ))}
              </div>
            ) : visibleLeads.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-surface-strong px-6 py-12 text-center">
                <p className="text-lg font-semibold tracking-[-0.02em]">
                  Nenhum lead encontrado
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Ajuste os filtros da API ou a busca local para encontrar um lead.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {visibleLeads.map((lead) => {
                  const isSelected = lead.id === selectedLead?.id

                  return (
                    <div
                      key={lead.id}
                      className={`group relative rounded-[1.45rem] border px-5 py-4 text-left transition ${
                        isSelected
                          ? 'border-transparent bg-foreground text-background shadow-[0_22px_40px_rgba(17,24,18,0.18)]'
                          : selectedIds.has(lead.id)
                            ? 'border-accent/50 bg-accent/5'
                            : 'border-border bg-surface-strong hover:border-accent/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${lead.name}`}
                        checked={selectedIds.has(lead.id)}
                        onChange={() => {}}
                        onClick={(e) => toggleLeadSelection(lead.id, e)}
                        className="absolute left-4 top-4 h-4 w-4 cursor-pointer accent-accent"
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedLeadId(lead.id)}
                        className="block w-full pl-7 text-left"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="text-lg font-semibold tracking-[-0.03em]">
                                {lead.name}
                              </h3>
                              <LeadStatusBadge status={lead.status} />
                            </div>
                            <p
                              className={`text-sm leading-6 ${
                                isSelected ? 'text-background/72' : 'text-muted'
                              }`}
                            >
                              {buildLeadMeta(lead)}
                            </p>
                          </div>

                          <div className="flex items-center gap-5">
                            <div>
                              <p
                                className={`text-[11px] font-medium uppercase tracking-[0.14em] ${
                                  isSelected ? 'text-background/65' : 'text-muted'
                                }`}
                              >
                                Média
                              </p>
                              <p
                                className={`mt-1 text-2xl font-semibold tracking-[-0.04em] ${
                                  isSelected ? 'text-background' : scoreTone(lead)
                                }`}
                              >
                                {formatAverageScore(lead)}
                              </p>
                            </div>
                            <div
                              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                                isSelected
                                  ? 'bg-white/14 text-background'
                                  : lead.has_site
                                    ? 'bg-accent/10 text-accent'
                                    : 'bg-warning/15 text-warning'
                              }`}
                            >
                              {lead.has_site ? 'com site' : 'sem site'}
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </article>

        <aside className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
          <LeadDetailPanel
            lead={selectedLead}
            onLeadUpdated={handleLeadUpdated}
          />
        </aside>
      </section>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-4 rounded-3xl border border-border bg-surface px-6 py-4 shadow-[0_16px_48px_rgba(17,24,18,0.18)]">
            <span className="text-sm font-semibold tracking-[-0.02em]">
              {selectedIds.size} lead{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
            </span>

            <div className="h-4 w-px bg-border" />

            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Status</span>
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as LeadStatus)}
                disabled={isBulkUpdating}
                className="rounded-lg border border-border bg-surface-strong px-2 py-1 text-sm outline-none disabled:opacity-50"
              >
                {LEAD_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>

            {bulkError && (
              <span className="text-xs text-warning">{bulkError}</span>
            )}

            <button
              type="button"
              onClick={handleBulkUpdate}
              disabled={isBulkUpdating}
              className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
            >
              {isBulkUpdating ? 'Atualizando...' : 'Atualizar'}
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={isBulkUpdating}
              className="text-xs text-muted transition hover:text-foreground disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
