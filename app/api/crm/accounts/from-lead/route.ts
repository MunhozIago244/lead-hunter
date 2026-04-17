import { NextRequest } from 'next/server'

import {
  isUnauthenticatedRouteResult,
  requireAuthenticatedRouteUser,
} from '@/lib/auth'
import { apiError, apiJson } from '@/lib/api/response'
import {
  createCrmAccountFromLead,
  parseCreateCrmAccountFromLeadPayload,
} from '@/lib/crm'
import {
  buildRateLimitSubject,
  consumeRateLimit,
  validateCsrfToken,
  validateSameOriginMutation,
} from '@/lib/security'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authContext = await requireAuthenticatedRouteUser()

  if (isUnauthenticatedRouteResult(authContext)) {
    return apiError(401, authContext.error, authContext.details)
  }

  const originState = validateSameOriginMutation(request)

  if (!originState.ok) {
    return apiError(
      403,
      'Cross-origin CRM conversion blocked.',
      originState.details
    )
  }

  const csrfState = validateCsrfToken(request)

  if (!csrfState.ok) {
    return apiError(403, 'Invalid CSRF token.', csrfState.details)
  }

  const rateLimitState = consumeRateLimit(request, {
    key: 'crm-account-conversion',
    limit: 30,
    windowMs: 10 * 60 * 1000,
  }, buildRateLimitSubject(request, authContext.user.id))

  if (!rateLimitState.ok) {
    return apiError(
      429,
      'CRM conversion rate limit exceeded.',
      `Try again in ${rateLimitState.retryAfterSeconds} seconds.`
    )
  }

  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return apiError(400, 'Invalid JSON payload.', 'POST body must be valid JSON.')
  }

  const parsedPayload = parseCreateCrmAccountFromLeadPayload(payload)

  if ('error' in parsedPayload) {
    return apiError(400, parsedPayload.error, parsedPayload.details)
  }

  try {
    const supabase = createAdminClient()
    const result = await createCrmAccountFromLead(
      supabase,
      parsedPayload.data.leadId
    )

    return apiJson(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.'

    if (message === 'Lead not found.') {
      return apiError(404, 'Lead not found.')
    }

    console.error('[POST /api/crm/accounts/from-lead] Unexpected error:', error)
    return apiError(500, 'Failed to convert lead into CRM account.')
  }
}
