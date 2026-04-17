import { logger } from '@/lib/logger'
import { NextRequest } from 'next/server'

import {
  isUnauthenticatedRouteResult,
  requireAuthenticatedRouteUser,
} from '@/lib/auth'
import { apiError, apiJson } from '@/lib/api/response'
import { parseCrmAccountUpdatePayload } from '@/lib/crm-workspace'
import { isUuid } from '@/lib/leads'
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
    return apiError(403, 'Cross-origin CRM mutation blocked.', originState.details)
  }

  const csrfState = validateCsrfToken(request)

  if (!csrfState.ok) {
    return apiError(403, 'Invalid CSRF token.', csrfState.details)
  }

  const rateLimit = consumeRateLimit(request, {
    key: 'crm-account-patch',
    limit: 60,
    windowMs: 10 * 60 * 1000,
  }, buildRateLimitSubject(request, authContext.user.id))

  if (!rateLimit.ok) {
    return apiError(
      429,
      'CRM account rate limit exceeded.',
      `Try again in ${rateLimit.retryAfterSeconds} seconds.`
    )
  }

  const { id } = await context.params

  if (!isUuid(id)) {
    return apiError(400, 'Invalid CRM account id.', 'Expected a UUID in the route path.')
  }

  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return apiError(400, 'Invalid JSON payload.', 'PATCH body must be valid JSON.')
  }

  const parsedPayload = parseCrmAccountUpdatePayload(payload)

  if ('error' in parsedPayload) {
    return apiError(400, parsedPayload.error, parsedPayload.details)
  }

  try {
    const supabase = createAdminClient()
    const existingAccount = await supabase
      .from('crm_accounts')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (existingAccount.error) {
      logger.error({ err: existingAccount.error.message }, '[PATCH /api/crm/accounts/:id] Load error')
      return apiError(500, 'Failed to load CRM account.')
    }

    if (!existingAccount.data) {
      return apiError(404, 'CRM account not found.')
    }

    const updatedAccount = await supabase
      .from('crm_accounts')
      .update(parsedPayload.data)
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (updatedAccount.error) {
      logger.error({ err: updatedAccount.error.message }, '[PATCH /api/crm/accounts/:id] Update error')
      return apiError(500, 'Failed to update CRM account.')
    }

    if (!updatedAccount.data) {
      return apiError(404, 'CRM account not found.')
    }

    return apiJson({ account: updatedAccount.data })
  } catch (error) {
    logger.error({ err: error }, '[PATCH /api/crm/accounts/:id] Unexpected error')
    return apiError(500, 'Internal server error.')
  }
}
