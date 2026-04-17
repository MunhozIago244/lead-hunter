import Groq from 'groq-sdk'

import type { Lead } from '@/types/lead'

import { PitchProviderError, type PitchPrompt } from '@/lib/pitch-types'

const GROQ_PROVIDER = 'groq'
const DEFAULT_GROQ_PITCH_MODEL = 'llama-3.1-8b-instant'
const PITCH_MAX_TOKENS = 300
const PITCH_TIMEOUT_MS = 12_000

function normalizeGroqError(error: unknown): PitchProviderError {
  if (error instanceof PitchProviderError) return error

  if (error instanceof Error && error.name === 'AbortError') {
    return new PitchProviderError({
      provider: GROQ_PROVIDER,
      message: 'Groq pitch request timed out.',
      reason: 'timeout',
      recoverable: true,
      cause: error,
    })
  }

  const status =
    typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
      ? error.status
      : null

  const message = error instanceof Error ? error.message : String(error)

  if (status === 429 || message.includes('rate_limit') || message.includes('Rate limit')) {
    return new PitchProviderError({
      provider: GROQ_PROVIDER,
      message: 'Groq rate limit exceeded.',
      reason: 'rate_limit',
      recoverable: true,
      cause: error,
    })
  }

  if (status === 401 || status === 403) {
    return new PitchProviderError({
      provider: GROQ_PROVIDER,
      message: 'Groq API key is invalid or missing.',
      reason: 'missing_api_key',
      recoverable: false,
      cause: error,
    })
  }

  if (status !== null && status >= 500) {
    return new PitchProviderError({
      provider: GROQ_PROVIDER,
      message: 'Groq provider is temporarily unavailable.',
      reason: 'provider_unavailable',
      recoverable: true,
      cause: error,
    })
  }

  return new PitchProviderError({
    provider: GROQ_PROVIDER,
    message: message || 'Groq provider returned an unknown error.',
    reason: 'unknown',
    recoverable: false,
    cause: error,
  })
}

export async function generatePitchWithGroq(prompt: PitchPrompt, lead: Lead) {
  void lead
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey) {
    throw new PitchProviderError({
      provider: GROQ_PROVIDER,
      message: 'Missing GROQ_API_KEY.',
      reason: 'missing_api_key',
      recoverable: false,
    })
  }

  const model = process.env.GROQ_PITCH_MODEL ?? DEFAULT_GROQ_PITCH_MODEL
  const groq = new Groq({ apiKey })
  const abort = new AbortController()
  const timeoutHandle = setTimeout(() => abort.abort(), PITCH_TIMEOUT_MS)

  try {
    const completion = await groq.chat.completions.create(
      {
        model,
        max_tokens: PITCH_MAX_TOKENS,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
      },
      { signal: abort.signal }
    )

    const pitch = completion.choices[0]?.message?.content?.trim() ?? ''

    if (!pitch) {
      throw new PitchProviderError({
        provider: GROQ_PROVIDER,
        message: 'Groq returned an empty pitch.',
        reason: 'empty_response',
        recoverable: true,
      })
    }

    return pitch
  } catch (error) {
    throw normalizeGroqError(error)
  } finally {
    clearTimeout(timeoutHandle)
  }
}
