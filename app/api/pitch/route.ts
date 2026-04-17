import { logger } from '@/lib/logger'
import { NextRequest } from 'next/server'

import {
  isUnauthenticatedRouteResult,
  requireAuthenticatedRouteUser,
} from '@/lib/auth'
import { apiError, apiJson } from '@/lib/api/response'
import { isUuid } from '@/lib/leads'
import { generatePitchForLead } from '@/lib/pitch'
import {
  buildRateLimitSubject,
  consumeRateLimit,
  validateCsrfToken,
  validateSameOriginMutation,
} from '@/lib/security'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Lead } from '@/types/lead'

export const runtime = 'nodejs'

type PitchRequestBody = {
  lead_id?: string
  leadId?: string
}

export async function POST(request: NextRequest) {
  const authContext = await requireAuthenticatedRouteUser()

  if (isUnauthenticatedRouteResult(authContext)) {
    return apiError(401, authContext.error, authContext.details)
  }

  const originState = validateSameOriginMutation(request)

  if (!originState.ok) {
    return apiError(
      403,
      'Cross-origin pitch mutation blocked.',
      originState.details
    )
  }

  const csrfState = validateCsrfToken(request)

  if (!csrfState.ok) {
    return apiError(403, 'Invalid CSRF token.', csrfState.details)
  }

  const rateLimitState = consumeRateLimit(request, {
    key: 'pitch',
    limit: 10,
    windowMs: 10 * 60 * 1000,
  }, buildRateLimitSubject(request, authContext.user.id))

  if (!rateLimitState.ok) {
    return apiError(
      429,
      'Pitch generation rate limit exceeded.',
      `Try again in ${rateLimitState.retryAfterSeconds} seconds.`
    )
  }

  let payload: PitchRequestBody

  try {
    payload = (await request.json()) as PitchRequestBody
  } catch {
    return apiError(400, 'Invalid JSON payload.', 'POST body must be valid JSON.')
  }

  const leadId = payload.lead_id ?? payload.leadId

  if (!leadId || !isUuid(leadId)) {
    return apiError(
      400,
      'Invalid lead_id value.',
      'POST /api/pitch expects a UUID in `lead_id`.'
    )
  }

  try {
    const supabase = createAdminClient()
    const leadResult = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle()

    if (leadResult.error) {
      logger.error({ err: leadResult.error.message }, '[POST /api/pitch] Lead load error')
      return apiError(500, 'Failed to load lead.')
    }

    if (!leadResult.data) {
      return apiError(404, 'Lead not found.')
    }

    const pitch = await generatePitchForLead(leadResult.data as Lead)
    const saveResult = await supabase
      .from('leads')
      .update({ pitch })
      .eq('id', leadId)
      .select('pitch')
      .maybeSingle()

    if (saveResult.error) {
      logger.error({ err: saveResult.error.message }, '[POST /api/pitch] Pitch save error')
      return apiError(500, 'Failed to save pitch.')
    }

    return apiJson({ pitch })
  } catch (error) {
    logger.error({ err: error }, '[POST /api/pitch] Unexpected error')
    return apiError(500, 'Internal server error.')
  }
}
