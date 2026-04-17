import { logger } from '@/lib/logger'
import { NextRequest } from 'next/server'

import {
  isUnauthenticatedRouteResult,
  requireAuthenticatedRouteUser,
} from '@/lib/auth'
import { apiError, apiJson } from '@/lib/api/response'
import { isUuid, parseLeadUpdatePayload } from '@/lib/leads'
import {
  buildRateLimitSubject,
  consumeRateLimit,
  validateCsrfToken,
  validateSameOriginMutation,
} from '@/lib/security'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authContext = await requireAuthenticatedRouteUser()

  if (isUnauthenticatedRouteResult(authContext)) {
    return apiError(401, authContext.error, authContext.details)
  }

  const originState = validateSameOriginMutation(request)

  if (!originState.ok) {
    return apiError(
      403,
      'Cross-origin lead mutation blocked.',
      originState.details
    )
  }

  const csrfState = validateCsrfToken(request)

  if (!csrfState.ok) {
    return apiError(403, 'Invalid CSRF token.', csrfState.details)
  }

  const rateLimitState = consumeRateLimit(request, {
    key: 'lead-patch',
    limit: 60,
    windowMs: 10 * 60 * 1000,
  }, buildRateLimitSubject(request, authContext.user.id))

  if (!rateLimitState.ok) {
    return apiError(
      429,
      'Lead update rate limit exceeded.',
      `Try again in ${rateLimitState.retryAfterSeconds} seconds.`
    )
  }

  const { id } = await context.params

  if (!isUuid(id)) {
    return apiError(400, 'Invalid lead id.', 'Expected a UUID in the route path.')
  }

  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return apiError(400, 'Invalid JSON payload.', 'PATCH body must be valid JSON.')
  }

  const parsedPayload = parseLeadUpdatePayload(payload)
  if ('error' in parsedPayload) {
    return apiError(400, parsedPayload.error, parsedPayload.details)
  }

  try {
    const supabase = createAdminClient()
    const existingLead = await supabase
      .from('leads')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (existingLead.error) {
      logger.error('[PATCH /api/lead/:id] Load error:', existingLead.error.message)
      return apiError(500, 'Failed to load lead.')
    }

    if (!existingLead.data) {
      return apiError(404, 'Lead not found.')
    }

    const updatedLead = await supabase
      .from('leads')
      .update(parsedPayload.data)
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (updatedLead.error) {
      logger.error('[PATCH /api/lead/:id] Update error:', updatedLead.error.message)
      return apiError(500, 'Failed to update lead.')
    }

    if (!updatedLead.data) {
      return apiError(404, 'Lead not found.')
    }

    return apiJson({ lead: updatedLead.data })
  } catch (error) {
    logger.error('[PATCH /api/lead/:id] Unexpected error:', error)
    return apiError(500, 'Internal server error.')
  }
}
