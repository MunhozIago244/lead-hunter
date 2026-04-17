'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useDeferredValue } from 'react'

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

type LeadsResponse = {
  leads: Lead[]
  total: number
  limit: number
  offset: number
}

const PAGE_SIZE = 30

const QUICK_FILTERS: Array<{ id: QuickFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'critical', label: 'Críticos' },
  { id: 'no-site', label: 'Sem site' },
  { id: 'contacted', label: 'Contatados' },
]

function buildLeadsUrl(filters: LeadFetchFilters, offset: number) {
  const params = new URLSearchParams()
  if (filters.quickFilter !== 'all') params.set('filter', filters.quickFilter)
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.segment !== 'all') params.set('segment', filters.segment)
  if (filters.city !== 'all') params.set('city', filters.city)
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String(offset))
  return `/api/leads?${params.toString()}`
}

async function requestLeads(
  filters: LeadFetchFilters,
  offset: number,
  signal: AbortSignal
): Promise<LeadsResponse> {
  const response = await fetch(buildLeadsUrl(filters, offset), { method: 'GET', cache: 'no-store', signal })
  const payload = (await response.json().catch(() => null)) as LeadsResponse | { error?: string; details?: string } | null
  if (!response.ok) {
    const message = payload && !('leads' in (payload as object)) ? (payload as { error?: string; details?: string }).details ?? (payload as { error?: string }).error : null
    throw new Error(message ?? 'Nao foi possivel carregar os leads.')
  }
  if (!payload || !('leads' in payload)) throw new Error('Resposta inválida da API.')
  return payload as LeadsResponse
}

async function requestTotalCount(signal: AbortSignal): Promise<number> {
  const response = await fetch('/api/leads/count', { method: 'GET', cache: 'no-store', signal })
  const payload = (await response.json().catch(() => null)) as { total?: number } | null
  return payload?.total ?? 0
}

function getScore(lead: Lead) { return getLeadAverageScore(lead) }

function scoreTone(lead: Lead): string {
  const s = getScore(lead)
  if (s === null) return 'text-muted'
  if (s < 40) return 'text-warning'
  if (s < 70) return 'text-[#84601d] dark:text-[#efc16c]'
  return 'text-accent'
}

function scoreBarColor(lead: Lead): string {
  const s = getScore(lead)
  if (s === null) return 'bg-border'
  if (s < 40) return 'bg-warning'
  if (s < 70) return 'bg-[#f59e0b]'
  return 'bg-accent'
}

function buildLeadMeta(lead: Lead) {
  const parts = [lead.segment || 'segmento não informado', lead.city]
  if (!lead.has_site) parts.push('sem site')
  return parts.join(' · ')
}

function sortUniqueValues(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

function applyLeadUpdate(leads: Lead[], updatedLead: Lead, keepLead: boolean) {
  if (!keepLead) return leads.filter((l) => l.id !== updatedLead.id)
  return leads.map((l) => (l.id === updatedLead.id ? updatedLead : l))
}

function matchesActiveApiFilters(lead: Lead, filters: LeadFetchFilters) {
  if (filters.status !== 'all' && lead.status !== filters.status) return false
  if (filters.segment !== 'all' && !(lead.segment ?? '').toLowerCase().includes(filters.segment.toLowerCase())) return false
  if (filters.city !== 'all' && !lead.city.toLowerCase().includes(filters.city.toLowerCase())) return false
  if (filters.quickFilter === 'no-site' && lead.has_site) return false
  if (filters.quickFilter === 'contacted' && filters.status === 'all' && lead.status !== 'contacted') return false
  if (filters.quickFilter === 'critical') {
    const s = getScore(lead)
    return s !== null && s < 40
  }
  return true
}

export function LeadListDashboard() {
  const hasLoadedInitialResults = useRef(false)
  const [catalogLeads, setCatalogLeads] = useState<Lead[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [totalFiltered, setTotalFiltered] = useState(0)
  const [totalAll, setTotalAll] = useState<number | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [slideOpen, setSlideOpen] = useState(false)
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [segmentFilter, setSegmentFilter] = useState('all')
  const [cityFilter, setCityFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [loadingState, setLoadingState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<LeadStatus>('contacted')
  const [isBulkUpdating, setIsBulkUpdating] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(searchInput)

  // Load total count once on mount
  useEffect(() => {
    const controller = new AbortController()
    requestTotalCount(controller.signal)
      .then((total) => { if (!controller.signal.aborted) setTotalAll(total) })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  // Load leads when filters change — reset to page 0
  useEffect(() => {
    const controller = new AbortController()
    const filters: LeadFetchFilters = { quickFilter, status: statusFilter, segment: segmentFilter, city: cityFilter }
    const isPristine = filters.quickFilter === 'all' && filters.status === 'all' && filters.segment === 'all' && filters.city === 'all'

    async function loadLeads() {
      const isFirstLoad = !hasLoadedInitialResults.current
      setIsRefreshing(!isFirstLoad)
      setErrorMessage(null)
      try {
        const result = await requestLeads(filters, 0, controller.signal)
        if (!controller.signal.aborted) {
          setLeads(result.leads)
          setTotalFiltered(result.total)
          setLoadingState('ready')
          hasLoadedInitialResults.current = true
          if (isPristine) {
            setCatalogLeads((curr) => curr.length === 0 ? result.leads : curr)
            setTotalAll(result.total)
          }
          setSelectedLeadId((curr) =>
            result.leads.some((l) => l.id === curr) ? curr : (result.leads[0]?.id ?? null)
          )
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setErrorMessage(error instanceof Error ? error.message : 'Falha inesperada ao carregar leads.')
          setLoadingState(isFirstLoad ? 'error' : 'ready')
        }
      } finally {
        if (!controller.signal.aborted) setIsRefreshing(false)
      }
    }

    loadLeads()
    return () => controller.abort()
  }, [cityFilter, quickFilter, segmentFilter, statusFilter])

  // Close slide-over on Escape
  useEffect(() => {
    if (!slideOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setSlideOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slideOpen])

  async function handleLoadMore() {
    if (isLoadingMore) return
    setIsLoadingMore(true)
    const filters: LeadFetchFilters = { quickFilter, status: statusFilter, segment: segmentFilter, city: cityFilter }
    try {
      const result = await requestLeads(filters, leads.length, new AbortController().signal)
      setLeads((prev) => {
        const existingIds = new Set(prev.map((l) => l.id))
        const newLeads = result.leads.filter((l) => !existingIds.has(l.id))
        return [...prev, ...newLeads]
      })
      setTotalFiltered(result.total)
    } catch {
      // silently ignore — user can retry
    } finally {
      setIsLoadingMore(false)
    }
  }

  const normalizedSearch = deferredSearch.trim().toLowerCase()
  const visibleLeads = leads.filter((lead) =>
    normalizedSearch ? lead.name.toLowerCase().includes(normalizedSearch) : true
  )
  const selectedLead = visibleLeads.find((l) => l.id === selectedLeadId) ?? visibleLeads[0] ?? null
  const hasMore = leads.length < totalFiltered

  const segmentOptions = sortUniqueValues(
    catalogLeads.map((l) => l.segment).filter((s): s is string => Boolean(s))
  )
  const cityOptions = sortUniqueValues(catalogLeads.map((l) => l.city))

  const criticalCount = visibleLeads.filter((l) => { const s = getScore(l); return s !== null && s < 40 }).length

  function handleExportCsv() {
    if (visibleLeads.length === 0) return
    const headers = ['Nome', 'Status', 'Segmento', 'Cidade', 'Telefone', 'Email', 'Site', 'Score médio', 'Tem site']
    const rows = visibleLeads.map((lead) => {
      const avg = getScore(lead)
      return [lead.name, lead.status, lead.segment ?? '', lead.city, lead.phone ?? '', lead.email ?? '', lead.site ?? '', avg !== null ? String(avg) : '', lead.has_site ? 'sim' : 'não']
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

  function toggleLeadSelection(id: string, event: React.MouseEvent) {
    event.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkUpdate() {
    if (selectedIds.size === 0 || isBulkUpdating) return
    setIsBulkUpdating(true)
    setBulkError(null)
    try {
      const csrfToken = document.cookie.split('; ').find((r) => r.startsWith('lead-hunter-csrf='))?.split('=')[1] ?? ''
      const response = await fetch('/api/leads/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ ids: [...selectedIds], status: bulkStatus }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        setBulkError(data?.error ?? 'Falha ao atualizar leads em lote.')
        return
      }
      setLeads((prev) => prev.map((l) => selectedIds.has(l.id) ? { ...l, status: bulkStatus } : l))
      setSelectedIds(new Set())
    } catch {
      setBulkError('Erro inesperado ao atualizar.')
    } finally {
      setIsBulkUpdating(false)
    }
  }

  function handleLeadUpdated(updatedLead: Lead) {
    const activeFilters: LeadFetchFilters = { quickFilter, status: statusFilter, segment: segmentFilter, city: cityFilter }
    setLeads((curr) => applyLeadUpdate(curr, updatedLead, matchesActiveApiFilters(updatedLead, activeFilters)))
    setCatalogLeads((curr) => applyLeadUpdate(curr, updatedLead, true))
  }

  function openSlideOver(leadId: string) {
    setSelectedLeadId(leadId)
    setSlideOpen(true)
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-8 sm:px-10 lg:px-12">
      {/* Header */}
      <section className="rounded-[2rem] border border-border bg-surface p-8 shadow-[0_22px_80px_rgba(17,24,18,0.10)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="inline-flex w-fit items-center rounded-full border border-border bg-surface-strong px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-muted">
                Lead Hunter · Warm Studio
              </p>
              <Link href="/crm" className="inline-flex items-center rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent transition hover:border-accent/40 hover:bg-accent/14">
                Abrir workspace CRM
              </Link>
              <Link href="/analytics" className="inline-flex items-center rounded-full border border-border bg-surface-strong px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition hover:border-accent/40 hover:text-foreground">
                Analytics
              </Link>
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Painel de leads</h1>
              <p className="max-w-2xl text-base leading-7 text-muted sm:text-lg">
                Descubra, filtre e converta leads com presença digital fraca em clientes reais.
              </p>
            </div>
          </div>

          <div className="grid w-full max-w-xl gap-3 sm:grid-cols-4">
            <div className="sm:col-span-4 flex justify-end">
              <SignOutButton />
            </div>
            {/* Total no banco */}
            <div className="rounded-[1.35rem] border border-accent/20 bg-accent/6 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent/80">Total no banco</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-accent">
                {totalAll === null ? '—' : totalAll.toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-border bg-surface-strong p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Nesta página</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{leads.length}</p>
            </div>
            <div className="rounded-[1.35rem] border border-border bg-surface-strong p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Críticos</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-warning">{criticalCount}</p>
            </div>
            <div className="rounded-[1.35rem] border border-border bg-surface-strong p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Estado</p>
              <p className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-accent">
                {loadingState === 'loading' ? 'carregando' : isRefreshing ? 'atualizando' : 'pronto'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Lead list */}
      <article className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
        <div className="flex flex-col gap-5">
          {/* Panel header */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Painel de leads</h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Exibindo {leads.length} de {totalFiltered.toLocaleString('pt-BR')} resultado{totalFiltered !== 1 ? 's' : ''}.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full border border-border bg-surface-strong px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">
                {isRefreshing ? 'sincronizando' : 'fonte: /api/leads'}
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

          {/* Pill-bar filters */}
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_FILTERS.map((filter) => {
              const isActive = quickFilter === filter.id
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setQuickFilter(filter.id)}
                  className={`h-9 rounded-full border px-4 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                    isActive
                      ? 'border-transparent bg-accent text-white shadow-[0_4px_14px_rgba(10,107,82,0.28)]'
                      : 'border-border bg-surface-strong text-muted hover:border-accent/40 hover:text-foreground'
                  }`}
                >
                  {filter.label}
                </button>
              )
            })}
            <div className="h-5 w-px bg-border" />
            <div className="flex h-9 items-center gap-2 rounded-full border border-border bg-surface-strong px-4">
              <svg className="h-3.5 w-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por nome..."
                className="w-44 border-none bg-transparent text-xs outline-none placeholder:text-muted"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`h-9 rounded-full border px-4 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                showFilters ? 'border-accent/40 bg-accent/8 text-accent' : 'border-border bg-surface-strong text-muted hover:border-accent/40 hover:text-foreground'
              }`}
            >
              Filtros {showFilters ? '▴' : '▾'}
            </button>
          </div>

          {showFilters && (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5 rounded-[1.1rem] border border-border bg-surface-strong px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Status</span>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="bg-transparent text-sm outline-none">
                  <option value="all">Todos</option>
                  {LEAD_STATUS_VALUES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 rounded-[1.1rem] border border-border bg-surface-strong px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Segmento</span>
                <select value={segmentFilter} onChange={(e) => setSegmentFilter(e.target.value)} className="bg-transparent text-sm outline-none">
                  <option value="all">Todos</option>
                  {segmentOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 rounded-[1.1rem] border border-border bg-surface-strong px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Cidade</span>
                <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} className="bg-transparent text-sm outline-none">
                  <option value="all">Todas</option>
                  {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-[1.1rem] border border-warning/35 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">{errorMessage}</div>
          )}

          {/* Lead cards */}
          {loadingState === 'loading' ? (
            <div className="grid gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-[1.35rem] border border-border bg-surface-strong" />
              ))}
            </div>
          ) : visibleLeads.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-border bg-surface-strong px-6 py-12 text-center">
              <p className="text-lg font-semibold tracking-[-0.02em]">Nenhum lead encontrado</p>
              <p className="mt-2 text-sm leading-6 text-muted">Ajuste os filtros ou a busca para encontrar um lead.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {visibleLeads.map((lead) => {
                  const isSelected = lead.id === selectedLeadId && slideOpen
                  const isChecked = selectedIds.has(lead.id)
                  const score = getScore(lead)
                  const scoreStr = score === null ? '--' : `${score}`

                  return (
                    <div
                      key={lead.id}
                      onClick={() => openSlideOver(lead.id)}
                      className={`relative cursor-pointer rounded-[1.35rem] border transition-all duration-200 ${
                        isSelected
                          ? 'border-accent ring-2 ring-accent shadow-[0_0_0_4px_var(--glow-accent),0_8px_24px_rgba(17,24,18,0.10)]'
                          : isChecked
                            ? 'border-accent/50 shadow-[0_2px_8px_rgba(17,24,18,0.06)]'
                            : 'border-border shadow-[0_2px_8px_rgba(17,24,18,0.06)] hover:shadow-[0_8px_24px_rgba(17,24,18,0.10)] hover:-translate-y-0.5'
                      }`}
                      style={{ background: 'var(--card-gradient)' }}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${lead.name}`}
                        checked={isChecked}
                        onChange={() => {}}
                        onClick={(e) => toggleLeadSelection(lead.id, e)}
                        className="absolute left-4 top-4 h-4 w-4 cursor-pointer accent-accent"
                      />
                      <div className="px-5 pt-4 pb-3 pl-10">
                        <div className="flex items-start justify-between gap-3">
                          <LeadStatusBadge status={lead.status} />
                          <div className="text-right shrink-0">
                            <span className={`text-4xl font-bold leading-none tracking-[-0.04em] ${scoreTone(lead)}`}>{scoreStr}</span>
                          </div>
                        </div>
                        <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] leading-tight">{lead.name}</h3>
                        <p className="mt-0.5 text-sm text-muted leading-5">{buildLeadMeta(lead)}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
                          {lead.phone && <span className="flex items-center gap-1"><span>📞</span> {lead.phone}</span>}
                          {lead.site && <span className="flex items-center gap-1 truncate max-w-[160px]"><span>🌐</span> {lead.site.replace(/^https?:\/\//, '')}</span>}
                        </div>
                        <div className="mt-3 h-1 w-full rounded-full bg-border overflow-hidden">
                          <div className={`h-full rounded-full ${scoreBarColor(lead)} transition-all duration-300`} style={{ width: score !== null ? `${score}%` : '0%' }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Mostrar mais */}
              {hasMore && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <p className="text-xs text-muted">
                    Exibindo {leads.length} de {totalFiltered.toLocaleString('pt-BR')}
                  </p>
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="rounded-full border border-border bg-surface-strong px-8 py-3 text-sm font-semibold tracking-[-0.02em] transition hover:border-accent/40 hover:text-accent disabled:opacity-50"
                  >
                    {isLoadingMore ? 'Carregando...' : `Mostrar mais ${Math.min(PAGE_SIZE, totalFiltered - leads.length)} leads`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </article>

      {/* Slide-over */}
      {slideOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm" onClick={() => setSlideOpen(false)} />
          <div
            className="fixed right-0 top-0 z-50 flex h-full w-[480px] max-w-full flex-col bg-[var(--surface-strong)] shadow-[-24px_0_48px_rgba(17,24,18,0.14)]"
            style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16,1,0.3,1) both' }}
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-[-0.03em]">{selectedLead?.name ?? 'Lead'}</h2>
                {selectedLead && <LeadStatusBadge status={selectedLead.status} />}
              </div>
              <button type="button" onClick={() => setSlideOpen(false)} className="ml-4 shrink-0 rounded-full border border-border bg-surface-strong p-2 text-muted transition hover:border-accent/40 hover:text-foreground" aria-label="Fechar painel">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <LeadDetailPanel lead={selectedLead} onLeadUpdated={handleLeadUpdated} />
            </div>
          </div>
        </>
      )}

      {/* Bulk update bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-4 rounded-3xl border border-border bg-surface px-6 py-4 shadow-[0_16px_48px_rgba(17,24,18,0.18)]">
            <span className="text-sm font-semibold tracking-[-0.02em]">
              {selectedIds.size} lead{selectedIds.size !== 1 ? 's' : ''} selecionado{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <div className="h-4 w-px bg-border" />
            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Status</span>
              <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as LeadStatus)} disabled={isBulkUpdating} className="rounded-lg border border-border bg-surface-strong px-2 py-1 text-sm outline-none disabled:opacity-50">
                {LEAD_STATUS_VALUES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            {bulkError && <span className="text-xs text-warning">{bulkError}</span>}
            <button type="button" onClick={handleBulkUpdate} disabled={isBulkUpdating} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50">
              {isBulkUpdating ? 'Atualizando...' : 'Atualizar'}
            </button>
            <button type="button" onClick={() => setSelectedIds(new Set())} disabled={isBulkUpdating} className="text-xs text-muted transition hover:text-foreground disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </main>
  )
}
