'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import type { LeadAnalytics } from '@/app/api/leads/analytics/route'
import type { LeadStatus } from '@/types/lead'

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Novo',
  contacted: 'Contatado',
  replied: 'Respondeu',
  closed: 'Fechado',
  discarded: 'Descartado',
}

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-accent/15 text-accent',
  contacted: 'bg-[#3b82f6]/12 text-[#3b82f6]',
  replied: 'bg-[#8b5cf6]/12 text-[#8b5cf6]',
  closed: 'bg-accent/25 text-accent',
  discarded: 'bg-warning/12 text-warning',
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  )
}

function BarRow({ label, value, max, colorClass }: { label: string; value: number; max: number; colorClass?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-sm text-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-strong">
        <div
          className={`h-full rounded-full transition-all ${colorClass ?? 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-sm font-semibold">{value}</span>
    </div>
  )
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<LeadAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/leads/analytics', { cache: 'no-store' })
        const json = await res.json()
        if (!cancelled) {
          if (!res.ok) {
            setError(json.error ?? 'Erro ao carregar analytics.')
          } else {
            setData(json as LeadAnalytics)
          }
        }
      } catch {
        if (!cancelled) setError('Falha inesperada ao carregar analytics.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-8 sm:px-10 lg:px-12">
      <section className="rounded-[2rem] border border-border bg-surface p-8 shadow-[0_22px_80px_rgba(17,24,18,0.10)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="inline-flex w-fit items-center rounded-full border border-border bg-surface-strong px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-muted">
                Analytics
              </p>
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-border bg-surface-strong px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted transition hover:border-accent/40 hover:text-foreground"
              >
                ← Leads
              </Link>
            </div>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Visão geral da operação de leads
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted">
              Distribuição por status, cobertura de site, scores de qualidade digital e atividade recente.
            </p>
          </div>
        </div>
      </section>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[1.35rem] border border-border bg-surface-strong" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-[1.35rem] border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-warning">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total de leads" value={data.totalLeads} />
            <StatCard
              label="Score médio"
              value={data.averageScore !== null ? data.averageScore : '--'}
              sub="média das 4 dimensões"
            />
            <StatCard
              label="Críticos"
              value={data.criticalCount}
              sub="score médio < 40"
            />
            <StatCard
              label="Sem site"
              value={data.withoutSite}
              sub={`${data.withSite} com site`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
              <h2 className="text-lg font-semibold tracking-[-0.03em]">Por status</h2>
              <div className="mt-5 flex flex-wrap gap-3">
                {(Object.entries(data.byStatus) as [LeadStatus, number][]).map(([status, count]) => (
                  <div key={status} className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${STATUS_COLORS[status]}`}>
                    <span>{STATUS_LABELS[status]}</span>
                    <span className="text-base font-bold">{count}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-3">
                {(Object.entries(data.byStatus) as [LeadStatus, number][]).map(([status, count]) => (
                  <BarRow
                    key={status}
                    label={STATUS_LABELS[status]}
                    value={count}
                    max={data.totalLeads}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
              <h2 className="text-lg font-semibold tracking-[-0.03em]">Distribuição de score</h2>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[
                  { label: 'Excelente (≥70)', key: 'excellent', color: 'bg-accent/15 text-accent' },
                  { label: 'Bom (55–69)', key: 'good', color: 'bg-[#3b82f6]/12 text-[#3b82f6]' },
                  { label: 'Regular (40–54)', key: 'fair', color: 'bg-[#f59e0b]/12 text-[#f59e0b]' },
                  { label: 'Crítico (<40)', key: 'critical', color: 'bg-warning/12 text-warning' },
                ].map(({ label, key, color }) => (
                  <div key={key} className={`rounded-[1.1rem] px-4 py-3 ${color}`}>
                    <p className="text-xs font-medium">{label}</p>
                    <p className="mt-1 text-2xl font-bold">
                      {data.scoreDistribution[key as keyof typeof data.scoreDistribution]}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <h3 className="mb-3 text-sm font-medium uppercase tracking-[0.14em] text-muted">
                  Cobertura de site
                </h3>
                <div className="flex items-center gap-3">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-strong">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${data.totalLeads > 0 ? Math.round((data.withSite / data.totalLeads) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold">
                    {data.totalLeads > 0 ? Math.round((data.withSite / data.totalLeads) * 100) : 0}% com site
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
              <h2 className="mb-5 text-lg font-semibold tracking-[-0.03em]">Top segmentos</h2>
              {data.topSegments.length === 0 ? (
                <p className="text-sm text-muted">Nenhum segmento registrado.</p>
              ) : (
                <div className="space-y-3">
                  {data.topSegments.map(({ segment, count }) => (
                    <BarRow key={segment} label={segment} value={count} max={data.topSegments[0]?.count ?? 1} />
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
              <h2 className="mb-5 text-lg font-semibold tracking-[-0.03em]">Top cidades</h2>
              {data.topCities.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma cidade registrada.</p>
              ) : (
                <div className="space-y-3">
                  {data.topCities.map(({ city, count }) => (
                    <BarRow key={city} label={city} value={count} max={data.topCities[0]?.count ?? 1} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {data.recentActivity.length > 0 && (
            <div className="rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_16px_40px_rgba(17,24,18,0.08)]">
              <h2 className="mb-5 text-lg font-semibold tracking-[-0.03em]">Atividade recente (últimos 14 dias)</h2>
              <div className="flex items-end gap-2 overflow-x-auto pb-2">
                {data.recentActivity.map(({ date, count }) => {
                  const maxCount = Math.max(...data.recentActivity.map((r) => r.count))
                  const height = maxCount > 0 ? Math.max(8, Math.round((count / maxCount) * 80)) : 8
                  return (
                    <div key={date} className="flex shrink-0 flex-col items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{count}</span>
                      <div
                        className="w-8 rounded-t-lg bg-accent/60 transition-all"
                        style={{ height: `${height}px` }}
                      />
                      <span className="text-[10px] text-muted">{date.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
