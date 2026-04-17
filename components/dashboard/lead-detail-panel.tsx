'use client'

import { startTransition, useEffect, useState } from 'react'

import { getLeadAverageScore } from '@/lib/leads'
import { buildBrowserMutationHeaders } from '@/lib/security-client'
import type { Lead } from '@/types/lead'

import { LeadCrmBox } from './lead-crm-box'
import { LeadPitchBox } from './lead-pitch-box'
import { LeadScoreCard } from './lead-score-card'
import { LeadStatusBadge } from './lead-status-badge'

type LeadDetailPanelProps = {
  lead: Lead | null
  onLeadUpdated: (lead: Lead) => void
}

type LeadPatchResponse =
  | { lead: Lead }
  | { error?: string; details?: string }
  | null

function buildExternalHref(url: string | null) {
  if (!url) {
    return null
  }

  if (/^https?:\/\//i.test(url)) {
    return url
  }

  return `https://${url}`
}

function buildPhoneHref(phone: string | null) {
  if (!phone) {
    return null
  }

  const digits = phone.replace(/\D/g, '')
  return digits ? `tel:${digits}` : null
}

function formatScoreHelper(value: number | null, fallback: string, label: string) {
  if (value === null) {
    return fallback
  }

  if (value < 40) {
    return `${label} crítico`
  }

  if (value < 70) {
    return `${label} mediano`
  }

  return `${label} forte`
}

async function patchLeadStatus(leadId: string) {
  const response = await fetch(`/api/lead/${leadId}`, {
    method: 'PATCH',
    headers: buildBrowserMutationHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ status: 'contacted' }),
  })

  const payload = (await response.json().catch(() => null)) as LeadPatchResponse

  if (!response.ok || !payload || !('lead' in payload)) {
    const message =
      payload && 'lead' in payload === false
        ? payload.details ?? payload.error
        : null

    throw new Error(message ?? 'Nao foi possivel atualizar o lead.')
  }

  return payload.lead
}

export function LeadDetailPanel({
  lead,
  onLeadUpdated,
}: LeadDetailPanelProps) {
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    setIsUpdatingStatus(false)
    setActionMessage(null)
    setActionError(null)
  }, [lead?.id])

  if (!lead) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-[1.5rem] border border-dashed border-border bg-surface-strong px-6 text-center">
        <div className="space-y-3">
          <p className="text-lg font-semibold tracking-[-0.03em]">
            Nenhum lead selecionado
          </p>
          <p className="text-sm leading-6 text-muted">
            Assim que a lista receber resultados, o painel da direita passa a
            mostrar os detalhes completos do lead em destaque.
          </p>
        </div>
      </div>
    )
  }

  const averageScore = getLeadAverageScore(lead)
  const leadId = lead.id
  const siteHref = buildExternalHref(lead.site)
  const phoneHref = buildPhoneHref(lead.phone)
  const topProblems = lead.problems?.slice(0, 5) ?? []
  const canMarkAsContacted = lead.status !== 'contacted'

  async function handleMarkAsContacted() {
    if (!canMarkAsContacted) {
      return
    }

    setIsUpdatingStatus(true)
    setActionError(null)
    setActionMessage(null)

    try {
      const updatedLead = await patchLeadStatus(leadId)

      startTransition(() => {
        onLeadUpdated(updatedLead)
      })

      setActionMessage('Status atualizado para contatado.')
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Falha inesperada ao atualizar o status.'
      )
    } finally {
      setIsUpdatingStatus(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
              Detalhe do lead
            </p>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-[-0.04em]">
                {lead.name}
              </h2>
              <p className="text-sm leading-6 text-muted">
                {(lead.segment || 'segmento não informado') + ' · ' + lead.city}
              </p>
            </div>
          </div>
          <LeadStatusBadge status={lead.status} />
        </div>

        <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
                Presença digital
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {lead.has_site
                  ? 'Lead com site e dados completos para análise.'
                  : 'Lead sem site próprio, forte para oferta de presença digital.'}
              </p>
            </div>
            {siteHref ? (
              <a
                href={siteHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-foreground transition hover:border-accent/45 hover:text-accent"
              >
                Abrir site
              </a>
            ) : (
              <span className="inline-flex items-center rounded-full bg-warning/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-warning">
                Site não informado
              </span>
            )}
          </div>
          {lead.address ? (
            <p className="mt-4 text-sm leading-6 text-muted">{lead.address}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <LeadScoreCard
          label="Mobile"
          value={lead.score_mobile}
          helper={formatScoreHelper(
            lead.score_mobile,
            'Sem leitura mobile disponível',
            'Leitura mobile'
          )}
        />
        <LeadScoreCard
          label="Speed"
          value={lead.score_speed}
          helper={formatScoreHelper(
            lead.score_speed,
            'Sem leitura de velocidade',
            'Velocidade'
          )}
        />
        <LeadScoreCard
          label="SEO"
          value={lead.score_seo}
          helper={formatScoreHelper(
            lead.score_seo,
            'Sem leitura de SEO',
            'SEO'
          )}
        />
        <LeadScoreCard
          label="Design"
          value={lead.score_design}
          helper={formatScoreHelper(
            lead.score_design,
            'Sem leitura visual',
            'Design'
          )}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Score médio
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
            {averageScore ?? '--'}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {averageScore === null
              ? 'Sem média disponível.'
              : averageScore < 40
                ? 'Lead crítico, com urgência clara.'
                : averageScore < 70
                  ? 'Lead com oportunidade moderada.'
                  : 'Lead com presença melhor, mas ainda analisável.'}
          </p>
        </div>

        <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Contato
          </p>
          <div className="mt-4 space-y-3 text-sm leading-6">
            <p>
              <span className="font-semibold">Telefone:</span>{' '}
              {phoneHref ? (
                <a
                  href={phoneHref}
                  className="text-accent underline-offset-4 hover:underline"
                >
                  {lead.phone}
                </a>
              ) : (
                lead.phone ?? 'não informado'
              )}
            </p>
            <p>
              <span className="font-semibold">Email:</span>{' '}
              {lead.email ? (
                <a
                  href={`mailto:${lead.email}`}
                  className="text-accent underline-offset-4 hover:underline"
                >
                  {lead.email}
                </a>
              ) : (
                'não informado'
              )}
            </p>
          </div>
        </div>
      </div>

      <LeadCrmBox lead={lead} />

      <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              Problemas identificados
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Até 5 problemas priorizados pelo scraper para orientar a abordagem.
            </p>
          </div>
          <div className="rounded-full border border-border bg-background px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
            {topProblems.length} item{topProblems.length === 1 ? '' : 's'}
          </div>
        </div>

        {topProblems.length > 0 ? (
          <ul className="mt-4 grid gap-3">
            {topProblems.map((problem, index) => (
              <li
                key={`${lead.id}-problem-${index}`}
                className="rounded-[1.1rem] border border-border bg-background px-4 py-3 text-sm leading-6"
              >
                {problem}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-[1.1rem] border border-dashed border-border bg-background px-4 py-5 text-sm leading-6 text-muted">
            Nenhum problema estruturado foi salvo para este lead.
          </div>
        )}
      </div>

      <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
              Ação rápida
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Atualize o lead sem reload completo usando `PATCH /api/lead/[id]`.
            </p>
          </div>

          <button
            type="button"
            onClick={handleMarkAsContacted}
            disabled={!canMarkAsContacted || isUpdatingStatus}
            className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
              !canMarkAsContacted
                ? 'cursor-not-allowed bg-black/8 text-muted dark:bg-white/10'
                : 'bg-accent text-white shadow-[0_18px_35px_rgba(13,122,95,0.22)] hover:bg-accent-strong disabled:cursor-wait'
            }`}
          >
            {isUpdatingStatus
              ? 'Atualizando status...'
              : canMarkAsContacted
                ? 'Marcar como contatado'
                : 'Lead já contatado'}
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
      </div>

      <LeadPitchBox lead={lead} onLeadUpdated={onLeadUpdated} />
    </div>
  )
}
