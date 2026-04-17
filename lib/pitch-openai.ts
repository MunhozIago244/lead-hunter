import OpenAI from 'openai'

import type { Lead } from '@/types/lead'

import { PitchProviderError, type PitchPrompt } from '@/lib/pitch-types'

const OPENAI_PROVIDER = 'openai'
const DEFAULT_OPENAI_PITCH_MODEL = 'gpt-5-mini'
const PITCH_TIMEOUT_MS = 10_000

function normalizeOpenAIError(error: unknown) {
  if (error instanceof PitchProviderError) {
    return error
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return new PitchProviderError({
      provider: OPENAI_PROVIDER,
      message: 'OpenAI pitch request timed out.',
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
      provider: OPENAI_PROVIDER,
      message: 'OpenAI rate limit exceeded.',
      reason: 'rate_limit',
      recoverable: true,
      cause: error,
    })
  }

  if (status !== null && status >= 500) {
    return new PitchProviderError({
      provider: OPENAI_PROVIDER,
      message: 'OpenAI provider is temporarily unavailable.',
      reason: 'provider_unavailable',
      recoverable: true,
      cause: error,
    })
  }

  return new PitchProviderError({
    provider: OPENAI_PROVIDER,
    message:
      error instanceof Error
        ? error.message
        : 'OpenAI provider returned an unknown error.',
    reason: 'unknown',
    recoverable: false,
    cause: error,
  })
}

export async function generatePitchWithOpenAI(
  prompt: PitchPrompt,
  lead: Lead
) {
  void lead
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new PitchProviderError({
      provider: OPENAI_PROVIDER,
      message: 'Missing OPENAI_API_KEY.',
      reason: 'missing_api_key',
      recoverable: true,
    })
  }

  const client = new OpenAI({ apiKey })
  const abort = new AbortController()
  const timeoutHandle = setTimeout(() => abort.abort(), PITCH_TIMEOUT_MS)

  try {
    const response = await client.responses.create(
      {
        model: process.env.OPENAI_PITCH_MODEL ?? DEFAULT_OPENAI_PITCH_MODEL,
        instructions: prompt.system,
        input: prompt.user,
        max_output_tokens: 300,
      },
      { signal: abort.signal }
    )

    const pitch = response.output_text?.trim()

    if (!pitch) {
      throw new PitchProviderError({
        provider: OPENAI_PROVIDER,
        message: 'OpenAI returned an empty pitch.',
        reason: 'empty_response',
        recoverable: true,
      })
    }

    return pitch
  } catch (error) {
    throw normalizeOpenAIError(error)
  } finally {
    clearTimeout(timeoutHandle)
  }
}
