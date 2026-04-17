import type { Lead } from '@/types/lead'

export type PitchProvider = 'anthropic' | 'openai'
export type PitchProviderConfig = PitchProvider | 'none'

export type PitchPrompt = {
  system: string
  user: string
}

export type PitchGenerationResult = {
  pitch: string
  provider: PitchProvider
}

export type PitchProviderAttempt = {
  provider: PitchProvider
  reason: PitchProviderErrorReason
  recoverable: boolean
}

export type PitchProviderGenerator = (
  prompt: PitchPrompt,
  lead: Lead
) => Promise<string>

export type PitchProviderErrorReason =
  | 'missing_api_key'
  | 'timeout'
  | 'rate_limit'
  | 'provider_unavailable'
  | 'empty_response'
  | 'unknown'

type PitchProviderErrorOptions = {
  provider: PitchProvider
  message: string
  reason: PitchProviderErrorReason
  recoverable: boolean
  cause?: unknown
  attempts?: PitchProviderAttempt[]
}

export class PitchProviderError extends Error {
  provider: PitchProvider
  reason: PitchProviderErrorReason
  recoverable: boolean
  cause?: unknown
  attempts?: PitchProviderAttempt[]

  constructor({
    provider,
    message,
    reason,
    recoverable,
    cause,
    attempts,
  }: PitchProviderErrorOptions) {
    super(message)
    this.name = 'PitchProviderError'
    this.provider = provider
    this.reason = reason
    this.recoverable = recoverable
    this.cause = cause
    this.attempts = attempts
  }
}
