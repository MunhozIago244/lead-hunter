'use client'

import { startTransition, useEffect, useState } from 'react'

import {
  buildMailtoHref,
  buildPitchEmailSubject,
  buildWhatsAppHref,
} from '@/lib/outreach'
import { buildBrowserMutationHeaders } from '@/lib/security-client'
import type { Lead } from '@/types/lead'

type LeadPitchBoxProps = {
  lead: Lead
  onLeadUpdated: (lead: Lead) => void
}

type PitchResponse =
  | { pitch: string; provider?: 'anthropic' | 'openai' }
  | { error?: string; details?: string }
  | null

async function requestGeneratedPitch(leadId: string) {
  const response = await fetch('/api/pitch', {
    method: 'POST',
    headers: buildBrowserMutationHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ lead_id: leadId }),
  })

  const payload = (await response.json().catch(() => null)) as PitchResponse

  if (!response.ok || !payload || !('pitch' in payload)) {
    const message =
      payload && 'pitch' in payload === false
        ? payload.details ?? payload.error
        : null

    throw new Error(message ?? 'Nao foi possivel gerar o pitch.')
  }

  return {
    pitch: payload.pitch,
    provider: payload.provider ?? null,
  }
}

function formatProviderLabel(provider: 'anthropic' | 'openai' | null) {
  if (provider === 'anthropic') {
    return 'Anthropic'
  }

  if (provider === 'openai') {
    return 'OpenAI'
  }

  return null
}

function ActionLink({
  href,
  label,
  variant = 'secondary',
  newTab = false,
}: {
  href: string | null
  label: string
  variant?: 'primary' | 'secondary'
  newTab?: boolean
}) {
  const className =
    variant === 'primary'
      ? 'inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong'
      : 'inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent/45 hover:text-accent'

  if (!href) {
    return (
      <span className="inline-flex cursor-not-allowed items-center justify-center rounded-full bg-black/8 px-4 py-2 text-sm font-semibold text-muted dark:bg-white/10">
        {label}
      </span>
    )
  }

  return (
    <a
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noreferrer' : undefined}
      className={className}
    >
      {label}
    </a>
  )
}

export function LeadPitchBox({
  lead,
  onLeadUpdated,
}: LeadPitchBoxProps) {
  const [isGeneratingPitch, setIsGeneratingPitch] = useState(false)
  const [isCopyingPitch, setIsCopyingPitch] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setIsGeneratingPitch(false)
    setIsCopyingPitch(false)
    setFeedbackMessage(null)
    setErrorMessage(null)
  }, [lead.id])

  const pitchText = lead.pitch?.trim() ?? ''
  const hasPitch = pitchText.length > 0
  const whatsAppHref = buildWhatsAppHref(lead.phone, pitchText)
  const emailHref = buildMailtoHref(
    lead.email,
    buildPitchEmailSubject(lead),
    pitchText
  )

  async function handleGeneratePitch() {
    setIsGeneratingPitch(true)
    setFeedbackMessage(null)
    setErrorMessage(null)

    try {
      const result = await requestGeneratedPitch(lead.id)

      startTransition(() => {
        onLeadUpdated({
          ...lead,
          pitch: result.pitch,
        })
      })

      const providerLabel = formatProviderLabel(result.provider)
      setFeedbackMessage(
        hasPitch
          ? providerLabel
            ? `Pitch regerado com sucesso via ${providerLabel}.`
            : 'Pitch regerado com sucesso.'
          : providerLabel
            ? `Pitch gerado com sucesso via ${providerLabel}.`
            : 'Pitch gerado com sucesso.'
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Falha inesperada ao gerar o pitch.'
      )
    } finally {
      setIsGeneratingPitch(false)
    }
  }

  async function handleCopyPitch() {
    if (!hasPitch) {
      return
    }

    if (!navigator.clipboard?.writeText) {
      setErrorMessage('A API de clipboard não está disponível neste navegador.')
      return
    }

    setIsCopyingPitch(true)
    setFeedbackMessage(null)
    setErrorMessage(null)

    try {
      await navigator.clipboard.writeText(pitchText)
      setFeedbackMessage('Pitch copiado para a área de transferência.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Falha inesperada ao copiar o pitch.'
      )
    } finally {
      setIsCopyingPitch(false)
    }
  }

  return (
    <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
            Pitch
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Gere uma abordagem personalizada e envie pelo canal que fizer mais sentido.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGeneratePitch}
          disabled={isGeneratingPitch}
          className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(13,122,95,0.22)] transition hover:bg-accent-strong disabled:cursor-wait disabled:bg-accent/70"
        >
          {isGeneratingPitch
            ? hasPitch
              ? 'Regerando pitch...'
              : 'Gerando pitch...'
            : hasPitch
              ? 'Regerar pitch'
              : 'Gerar pitch'}
        </button>
      </div>

      <div className="mt-4 rounded-[1.2rem] border border-border bg-background px-4 py-4 text-sm leading-7">
        {hasPitch ? (
          <p className="whitespace-pre-wrap">{pitchText}</p>
        ) : (
          <p className="text-muted">
            Nenhum pitch foi gerado ainda. Use o botão acima para criar uma primeira mensagem personalizada.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleCopyPitch}
          disabled={!hasPitch || isCopyingPitch}
          className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
            !hasPitch
              ? 'cursor-not-allowed bg-black/8 text-muted dark:bg-white/10'
              : 'border border-border bg-background text-foreground hover:border-accent/45 hover:text-accent disabled:cursor-wait'
          }`}
        >
          {isCopyingPitch ? 'Copiando...' : 'Copiar'}
        </button>

        <ActionLink
          href={whatsAppHref}
          label="WhatsApp"
          variant="secondary"
          newTab
        />

        <ActionLink href={emailHref} label="Email" variant="secondary" />
      </div>

      {feedbackMessage ? (
        <p className="mt-4 rounded-[1.1rem] border border-accent/25 bg-accent/10 px-4 py-3 text-sm leading-6 text-accent">
          {feedbackMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 rounded-[1.1rem] border border-warning/35 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
