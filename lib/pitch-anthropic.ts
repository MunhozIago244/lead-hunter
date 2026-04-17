import Anthropic from '@anthropic-ai/sdk'

import type { Lead } from '@/types/lead'

import { PitchProviderError, type PitchPrompt } from '@/lib/pitch-types'

const ANTHROPIC_PROVIDER = 'anthropic'
const DEFAULT_ANTHROPIC_PITCH_MODEL = 'claude-sonnet-4-20250514'
const PITCH_MAX_TOKENS = 300
const PITCH_TIMEOUT_MS = 10_000

function normalizeAnthropicError(error: unknown) {
  if (error instanceof PitchProviderError) {
    return error
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return new PitchProviderError({
      provider: ANTHROPIC_PROVIDER,
      message: 'Anthropic pitch request timed out.',
      reason: 'timeout',
      recoverable: true,
      cause: error,
    })
  }

  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
      ? error.status
      : null

  if (status === 429) {
    return new PitchProviderError({
      provider: ANTHROPIC_PROVIDER,
      message: 'Anthropic rate limit exceeded.',
      reason: 'rate_limit',
      recoverable: true,
      cause: error,
    })
  }

  if (status !== null && status >= 500) {
    return new PitchProviderError({
      provider: ANTHROPIC_PROVIDER,
      message: 'Anthropic provider is temporarily unavailable.',
      reason: 'provider_unavailable',
      recoverable: true,
      cause: error,
    })
  }

  if (status === 401 || status === 403) {
    return new PitchProviderError({
      provider: ANTHROPIC_PROVIDER,
      message: 'Anthropic provider rejected the server credentials.',
      reason: 'missing_api_key',
      recoverable: true,
      cause: error,
    })
  }

  if (status === 400) {
    return new PitchProviderError({
      provider: ANTHROPIC_PROVIDER,
      message: 'Anthropic provider rejected the pitch request payload.',
      reason: 'provider_unavailable',
      recoverable: true,
      cause: error,
    })
  }

  return new PitchProviderError({
    provider: ANTHROPIC_PROVIDER,
    message:
      error instanceof Error
        ? error.message
        : 'Anthropic provider returned an unknown error.',
    reason: 'unknown',
    recoverable: false,
    cause: error,
  })
}

export async function generatePitchWithAnthropic(
  prompt: PitchPrompt,
  lead: Lead
) {
  void lead
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw new PitchProviderError({
      provider: ANTHROPIC_PROVIDER,
      message: 'Missing ANTHROPIC_API_KEY.',
      reason: 'missing_api_key',
      recoverable: true,
    })
  }

  const anthropic = new Anthropic({ apiKey })
  const abort = new AbortController()
  const timeoutHandle = setTimeout(() => abort.abort(), PITCH_TIMEOUT_MS)

  try {
    const message = await anthropic.messages.create(
      {
        model:
          process.env.ANTHROPIC_PITCH_MODEL ?? DEFAULT_ANTHROPIC_PITCH_MODEL,
        max_tokens: PITCH_MAX_TOKENS,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      },
      { signal: abort.signal }
    )

    const pitch = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
      .trim()

    if (!pitch) {
      throw new PitchProviderError({
        provider: ANTHROPIC_PROVIDER,
        message: 'Anthropic returned an empty pitch.',
        reason: 'empty_response',
        recoverable: true,
      })
    }

    return pitch
  } catch (error) {
    throw normalizeAnthropicError(error)
  } finally {
    clearTimeout(timeoutHandle)
  }
}
