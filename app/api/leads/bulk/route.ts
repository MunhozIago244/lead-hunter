import { logger } from '@/lib/logger'
import { NextRequest } from 'next/server'

import {
  isUnauthenticatedRouteResult,
  requireAuthenticatedRouteUser,
} from '@/lib/auth'
import { apiError, apiJson } from '@/lib/api/response'
import { isLeadStatus, isUuid } from '@/lib/leads'
import {
  buildRateLimitSubject,
  consumeRateLimit,
  validateCsrfToken,
  validateSameOriginMutation,
} from '@/lib/security'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function PATCH(request: NextRequest) {
  const authContext = await requireAuthenticatedRouteUser()

  if (isUnauthenticatedRouteResult(authContext)) {
    return apiError(401, authContext.error, authContext.details)
  }

  const originState = validateSameOriginMutation(request)
  if (!originState.ok) {
    return apiError(403, 'Cross-origin bulk mutation blocked.', originState.details)
  }

  const csrfState = validateCsrfToken(request)
  if (!csrfState.ok) {
    return apiError(403, 'Invalid CSRF token.', csrfState.details)
  }

  const rateLimitState = consumeRateLimit(
    request,
    { key: 'leads-bulk-patch', limit: 20, windowMs: 10 * 60 * 1000 },
    buildRateLimitSubject(request, authContext.user.id)
  )
  if (!rateLimitState.ok) {
    return apiError(429, 'Bulk update rate limit exceeded.', `Try again in ${rateLimitState.retryAfterSeconds} seconds.`)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError(400, 'Invalid JSON payload.')
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return apiError(400, 'Invalid payload.', 'Expected a JSON object with ids and status.')
  }

  const { ids, status } = body as Record<string, unknown>

  if (!Array.isArray(ids) || ids.length === 0) {
    return apiError(400, 'Invalid ids.', 'ids must be a non-empty array of UUIDs.')
  }

  if (ids.length > 100) {
    return apiError(400, 'Too many ids.', 'Maximum 100 IDs per bulk update.')
  }

  if (!ids.every((id) => typeof id === 'string' && isUuid(id))) {
    return apiError(400, 'Invalid ids.', 'All ids must be valid UUIDs.')
  }

  if (typeof status !== 'string' || !isLeadStatus(status)) {
    return apiError(400, 'Invalid status.', 'Use one of: new, contacted, replied, closed, discarded.')
  }

  try {
    const supabase = createAdminClient()
    const result = await supabase
      .from('leads')
      .update({ status })
      .in('id', ids as string[])
      .select('id')

    if (result.error) {
      logger.error({ err: result.error.message }, 'PATCH /api/leads/bulk update error')
      return apiError(500, 'Failed to update leads.')
    }

    return apiJson({ updated: result.data?.length ?? 0 })
  } catch (error) {
    logger.error({ err: error }, 'PATCH /api/leads/bulk unexpected error')
    return apiError(500, 'Internal server error.')
  }
}
