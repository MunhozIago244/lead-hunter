'use client'

import { startTransition, useEffect, useRef, useState } from 'react'

import {
  buildWhatsAppHref,
} from '@/lib/outreach'
import { buildBrowserMutationHeaders } from '@/lib/security-client'
import type { Lead } from '@/types/lead'

type LeadPitchBoxProps = {
  lead: Lead
  onLeadUpdated: (lead: Lead) => void
}

type PitchResponse =
  | { pitch: string; provider?: string }
  | { error?: string; details?: string }
  | null

const TONE_PRESETS = [
  { label: 'Mais formal', instruction: 'Reescreva de forma mais formal e profissional.' },
  { label: 'Mais curto', instruction: 'Reduza para no máximo 2 frases, mantendo o essencial.' },
  { label: 'Mais direto', instruction: 'Seja mais direto e objetivo, sem rodeios.' },
  { label: 'Mais empático', instruction: 'Use um tom mais empático e humanizado, mostrando que entende a realidade do negócio.' },
  { label: 'Mais urgente', instruction: 'Adicione senso de urgência leve sem ser agressivo.' },
]

async function requestPitch(leadId: string): Promise<{ pitch: string; provider: string | null }> {
  const response = await fetch('/api/pitch', {
    method: 'POST',
    headers: buildBrowserMutationHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ lead_id: leadId }),
  })
  const payload = (await response.json().catch(() => null)) as PitchResponse
  if (!response.ok || !payload || !('pitch' in payload)) {
    const message = payload && !('pitch' in payload) ? (payload as { details?: string; error?: string }).details ?? (payload as { error?: string }).error : null
    throw new Error(message ?? 'Nao foi possivel gerar o pitch.')
  }
  return { pitch: payload.pitch, provider: payload.provider ?? null }
}

async function requestImprovedPitch(leadId: string, instruction: string): Promise<{ pitch: string; provider: string | null }> {
  const response = await fetch('/api/pitch/improve', {
    method: 'POST',
    headers: buildBrowserMutationHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ lead_id: leadId, instruction }),
  })
  const payload = (await response.json().catch(() => null)) as PitchResponse
  if (!response.ok || !payload || !('pitch' in payload)) {
    const message = payload && !('pitch' in payload) ? (payload as { details?: string; error?: string }).details ?? (payload as { error?: string }).error : null
    throw new Error(message ?? 'Nao foi possivel melhorar o pitch.')
  }
  return { pitch: payload.pitch, provider: payload.provider ?? null }
}

async function requestSendEmail(leadId: string): Promise<void> {
  const response = await fetch('/api/pitch/send-email', {
    method: 'POST',
    headers: buildBrowserMutationHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ lead_id: leadId }),
  })
  const payload = (await response.json().catch(() => null)) as { error?: string; details?: string } | null
  if (!response.ok) {
    const message = payload?.details ?? payload?.error ?? 'Falha ao enviar email.'
    throw new Error(message)
  }
}

function openWhatsApp(phone: string | null, pitch: string) {
  const href = buildWhatsAppHref(phone, pitch)
  if (!href) return
  // Use anchor trick to avoid popup blocker on async context
  const a = document.createElement('a')
  a.href = href
  a.target = '_blank'
  a.rel = 'noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export function LeadPitchBox({ lead, onLeadUpdated }: LeadPitchBoxProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isImproving, setIsImproving] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [isCopying, setIsCopying] = useState(false)
  const [showImprove, setShowImprove] = useState(false)
  const [customInstruction, setCustomInstruction] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const improveRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setIsGenerating(false)
    setIsImproving(false)
    setIsSendingEmail(false)
    setIsCopying(false)
    setShowImprove(false)
    setCustomInstruction('')
    setFeedback(null)
    setError(null)
  }, [lead.id])

  useEffect(() => {
    if (showImprove) improveRef.current?.focus()
  }, [showImprove])

  const pitchText = lead.pitch?.trim() ?? ''
  const hasPitch = pitchText.length > 0
  const hasPhone = Boolean(lead.phone)
  const hasEmail = Boolean(lead.email)

  function applyUpdate(pitch: string, provider: string | null) {
    startTransition(() => { onLeadUpdated({ ...lead, pitch }) })
    setFeedback(provider ? `Pitch via ${provider}.` : 'Pitch atualizado.')
    setShowImprove(false)
    setCustomInstruction('')
  }

  async function handleGenerate() {
    setIsGenerating(true)
    setFeedback(null)
    setError(null)
    try {
      const result = await requestPitch(lead.id)
      applyUpdate(result.pitch, result.provider)
      // Auto-open WhatsApp after generation if phone exists
      if (hasPhone) openWhatsApp(lead.phone, result.pitch)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar pitch.')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleImprove(instruction: string) {
    if (!instruction.trim() || isImproving) return
    setIsImproving(true)
    setFeedback(null)
    setError(null)
    try {
      const result = await requestImprovedPitch(lead.id, instruction)
      applyUpdate(result.pitch, result.provider)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao melhorar pitch.')
    } finally {
      setIsImproving(false)
    }
  }

  async function handleSendEmail() {
    setIsSendingEmail(true)
    setFeedback(null)
    setError(null)
    try {
      await requestSendEmail(lead.id)
      setFeedback('Email enviado com sucesso!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar email.')
    } finally {
      setIsSendingEmail(false)
    }
  }

  async function handleCopy() {
    if (!hasPitch || !navigator.clipboard?.writeText) return
    setIsCopying(true)
    try {
      await navigator.clipboard.writeText(pitchText)
      setFeedback('Copiado!')
    } catch {
      setError('Falha ao copiar.')
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <div className="rounded-[1.35rem] border border-border bg-surface-strong p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Pitch</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Gere uma abordagem personalizada e envie pelo canal disponível.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(13,122,95,0.22)] transition hover:bg-accent-strong disabled:cursor-wait disabled:bg-accent/70"
        >
          {isGenerating ? (hasPitch ? 'Regerando...' : 'Gerando...') : hasPitch ? 'Regerar pitch' : 'Gerar pitch'}
        </button>
      </div>

      {/* Pitch text */}
      <div className="mt-4 rounded-[1.2rem] border border-border bg-background px-4 py-4 text-sm leading-7">
        {hasPitch ? (
          <p className="whitespace-pre-wrap">{pitchText}</p>
        ) : (
          <p className="text-muted">Nenhum pitch gerado ainda. Clique em "Gerar pitch" para criar uma mensagem personalizada.</p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopy}
          disabled={!hasPitch || isCopying}
          className="inline-flex items-center rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold transition hover:border-accent/45 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isCopying ? 'Copiando...' : 'Copiar'}
        </button>

        {/* WhatsApp — only shown if has phone */}
        {hasPhone ? (
          <button
            type="button"
            onClick={() => openWhatsApp(lead.phone, pitchText)}
            disabled={!hasPitch}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#25d366]/40 bg-[#25d366]/10 px-4 py-2 text-sm font-semibold text-[#128c3e] transition hover:bg-[#25d366]/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#25d366]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.113 1.522 5.847L.057 23.457a.5.5 0 0 0 .604.635l5.82-1.527A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.857a9.844 9.844 0 0 1-5.031-1.378l-.36-.214-3.733.979.998-3.64-.235-.374A9.847 9.847 0 0 1 2.143 12c0-5.44 4.417-9.857 9.857-9.857 5.44 0 9.857 4.417 9.857 9.857 0 5.44-4.417 9.857-9.857 9.857z" />
            </svg>
            WhatsApp
          </button>
        ) : null}

        {/* Email — only shown if has email */}
        {hasEmail ? (
          <button
            type="button"
            onClick={handleSendEmail}
            disabled={!hasPitch || isSendingEmail}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold transition hover:border-accent/45 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSendingEmail ? 'Enviando...' : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
                Enviar email
              </>
            )}
          </button>
        ) : null}

        {/* Melhorar pitch — só aparece se já tem pitch */}
        {hasPitch && (
          <button
            type="button"
            onClick={() => setShowImprove((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              showImprove
                ? 'border-accent/40 bg-accent/8 text-accent'
                : 'border-border bg-background text-muted hover:border-accent/45 hover:text-foreground'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            Melhorar
          </button>
        )}
      </div>

      {/* Improve panel */}
      {showImprove && hasPitch && (
        <div className="mt-4 rounded-[1.2rem] border border-accent/25 bg-accent/4 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent mb-3">Melhorar pitch</p>

          {/* Tone presets */}
          <div className="flex flex-wrap gap-2 mb-3">
            {TONE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleImprove(preset.instruction)}
                disabled={isImproving}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold transition hover:border-accent/40 hover:text-accent disabled:opacity-50"
              >
                {isImproving ? '...' : preset.label}
              </button>
            ))}
          </div>

          {/* Custom instruction */}
          <div className="flex gap-2">
            <textarea
              ref={improveRef}
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleImprove(customInstruction)
              }}
              placeholder="Ou escreva sua instrução... (ex: mencione que somos especializados em negócios locais)"
              rows={2}
              maxLength={400}
              className="flex-1 resize-none rounded-[0.9rem] border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent/40"
            />
            <button
              type="button"
              onClick={() => handleImprove(customInstruction)}
              disabled={!customInstruction.trim() || isImproving}
              className="self-end rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
            >
              {isImproving ? '...' : 'Aplicar'}
            </button>
          </div>
          <p className="mt-1.5 text-right text-[10px] text-muted">{customInstruction.length}/400 · Enter+Cmd/Ctrl para enviar</p>
        </div>
      )}

      {/* Feedback / error */}
      {feedback && (
        <p className="mt-4 rounded-[1.1rem] border border-accent/25 bg-accent/10 px-4 py-3 text-sm leading-6 text-accent">{feedback}</p>
      )}
      {error && (
        <p className="mt-4 rounded-[1.1rem] border border-warning/35 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">{error}</p>
      )}
    </div>
  )
}
