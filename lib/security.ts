import { timingSafeEqual } from 'crypto'

import type { NextRequest } from 'next/server'

import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from '@/lib/security-constants'

type RateLimitBucket = {
  count: number
  resetAt: number
}

type RateLimitConfig = {
  key: string
  limit: number
  windowMs: number
}

const globalForRateLimit = globalThis as typeof globalThis & {
  __leadHunterRateLimitStore?: Map<string, RateLimitBucket>
  __leadHunterRateLimitCleanupInterval?: ReturnType<typeof setInterval>
}

const rateLimitStore =
  globalForRateLimit.__leadHunterRateLimitStore ??
  new Map<string, RateLimitBucket>()

if (!globalForRateLimit.__leadHunterRateLimitStore) {
  globalForRateLimit.__leadHunterRateLimitStore = rateLimitStore
}

if (!globalForRateLimit.__leadHunterRateLimitCleanupInterval) {
  const interval = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of rateLimitStore) {
      if (bucket.resetAt <= now) {
        rateLimitStore.delete(key)
      }
    }
  }, 60_000)

  if (interval.unref) interval.unref()

  globalForRateLimit.__leadHunterRateLimitCleanupInterval = interval

  process.on('exit', () => {
    clearInterval(globalForRateLimit.__leadHunterRateLimitCleanupInterval)
  })
}

function getClientIdentifier(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const fallback = request.headers.get('user-agent') ?? 'unknown'

  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? fallback
  }

  return realIp ?? fallback
}

export function consumeRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  subject?: string
) {
  const now = Date.now()
  const clientKey = `${config.key}:${subject ?? getClientIdentifier(request)}`
  const existingBucket = rateLimitStore.get(clientKey)

  if (!existingBucket || existingBucket.resetAt <= now) {
    const nextBucket: RateLimitBucket = {
      count: 1,
      resetAt: now + config.windowMs,
    }

    rateLimitStore.set(clientKey, nextBucket)

    return {
      ok: true as const,
      remaining: config.limit - 1,
    }
  }

  if (existingBucket.count >= config.limit) {
    return {
      ok: false as const,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existingBucket.resetAt - now) / 1000)
      ),
    }
  }

  existingBucket.count += 1
  rateLimitStore.set(clientKey, existingBucket)

  return {
    ok: true as const,
    remaining: config.limit - existingBucket.count,
  }
}

export function buildRateLimitSubject(
  request: NextRequest,
  userId?: string | null
) {
  const clientIdentifier = getClientIdentifier(request)
  return userId
    ? `user:${userId}:client:${clientIdentifier}`
    : `client:${clientIdentifier}`
}

function normalizeOrigin(input: string | null) {
  if (!input) {
    return null
  }

  try {
    return new URL(input).origin
  } catch {
    return null
  }
}

export function validateSameOriginMutation(request: NextRequest) {
  const expectedOrigin = process.env.APP_ORIGIN ?? request.nextUrl.origin
  const origin = normalizeOrigin(request.headers.get('origin'))
  const referer = normalizeOrigin(request.headers.get('referer'))
  const secFetchSite = request.headers.get('sec-fetch-site')

  if (origin && origin !== expectedOrigin) {
    return {
      ok: false as const,
      details: `Expected origin ${expectedOrigin}, received ${origin}.`,
    }
  }

  if (!origin && referer && referer !== expectedOrigin) {
    return {
      ok: false as const,
      details: `Expected referer origin ${expectedOrigin}, received ${referer}.`,
    }
  }

  if (
    !origin &&
    !referer &&
    secFetchSite &&
    !['same-origin', 'same-site', 'none'].includes(secFetchSite)
  ) {
    return {
      ok: false as const,
      details: `Cross-site mutation blocked. Received sec-fetch-site=${secFetchSite}.`,
    }
  }

  return {
    ok: true as const,
  }
}

export function validateCsrfToken(request: NextRequest) {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value?.trim()
  const headerToken = request.headers.get(CSRF_HEADER_NAME)?.trim()

  if (!cookieToken || !headerToken) {
    return {
      ok: false as const,
      details: 'Missing CSRF token cookie or header.',
    }
  }

  const a = Buffer.from(cookieToken)
  const b = Buffer.from(headerToken)
  const tokensMatch = a.length === b.length && timingSafeEqual(a, b)

  if (!tokensMatch) {
    return {
      ok: false as const,
      details: 'CSRF token mismatch.',
    }
  }

  return {
    ok: true as const,
  }
}
