import { GoogleGenerativeAI } from '@google/generative-ai'

import type { Lead } from '@/types/lead'

import { PitchProviderError, type PitchPrompt } from '@/lib/pitch-types'

const GEMINI_PROVIDER = 'gemini'
const DEFAULT_GEMINI_PITCH_MODEL = 'gemini-2.5-pro'
const PITCH_MAX_TOKENS = 300
const PITCH_TIMEOUT_MS = 15_000

function normalizeGeminiError(error: unknown): PitchProviderError {
  if (error instanceof PitchProviderError) return error

  if (error instanceof Error && error.name === 'AbortError') {
    return new PitchProviderError({
      provider: GEMINI_PROVIDER,
      message: 'Gemini pitch request timed out.',
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

  if (status === 429 || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
    return new PitchProviderError({
      provider: GEMINI_PROVIDER,
      message: 'Gemini rate limit or quota exceeded.',
      reason: 'rate_limit',
      recoverable: true,
      cause: error,
    })
  }

  if (status === 401 || status === 403 || message.includes('API_KEY_INVALID') || message.includes('API key')) {
    return new PitchProviderError({
      provider: GEMINI_PROVIDER,
      message: 'Gemini API key is invalid or missing.',
      reason: 'missing_api_key',
      recoverable: false,
      cause: error,
    })
  }

  if (status !== null && status >= 500) {
    return new PitchProviderError({
      provider: GEMINI_PROVIDER,
      message: 'Gemini provider is temporarily unavailable.',
      reason: 'provider_unavailable',
      recoverable: true,
      cause: error,
    })
  }

  return new PitchProviderError({
    provider: GEMINI_PROVIDER,
    message: message || 'Gemini provider returned an unknown error.',
    reason: 'unknown',
    recoverable: false,
    cause: error,
  })
}

export async function generatePitchWithGemini(prompt: PitchPrompt, lead: Lead) {
  void lead
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new PitchProviderError({
      provider: GEMINI_PROVIDER,
      message: 'Missing GEMINI_API_KEY.',
      reason: 'missing_api_key',
      recoverable: false,
    })
  }

  const model = process.env.GEMINI_PITCH_MODEL ?? DEFAULT_GEMINI_PITCH_MODEL
  const genAI = new GoogleGenerativeAI(apiKey)
  const geminiModel = genAI.getGenerativeModel({
    model,
    systemInstruction: prompt.system,
    generationConfig: { maxOutputTokens: PITCH_MAX_TOKENS },
  })

  const abort = new AbortController()
  const timeoutHandle = setTimeout(() => abort.abort(), PITCH_TIMEOUT_MS)

  try {
    const result = await Promise.race([
      geminiModel.generateContent(prompt.user),
      new Promise<never>((_, reject) => {
        abort.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
        )
      }),
    ])

    const pitch = result.response.text().trim()

    if (!pitch) {
      throw new PitchProviderError({
        provider: GEMINI_PROVIDER,
        message: 'Gemini returned an empty pitch.',
        reason: 'empty_response',
        recoverable: true,
      })
    }

    return pitch
  } catch (error) {
    throw normalizeGeminiError(error)
  } finally {
    clearTimeout(timeoutHandle)
  }
}
