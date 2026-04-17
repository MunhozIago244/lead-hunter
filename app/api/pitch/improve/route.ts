import { logger } from '@/lib/logger'
import { NextRequest } from 'next/server'

import {
  isUnauthenticatedRouteResult,
  requireAuthenticatedRouteUser,
} from '@/lib/auth'
import { apiError, apiJson } from '@/lib/api/response'
import { isUuid } from '@/lib/leads'
import { improvePitchForLead } from '@/lib/pitch'
import { PitchProviderError } from '@/lib/pitch-types'
import {
  buildRateLimitSubject,
  consumeRateLimit,
  validateCsrfToken,
  validateSameOriginMutation,
} from '@/lib/security'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Lead } from '@/types/lead'

export const runtime = 'nodejs'

type ImproveRequestBody = {
  lead_id?: string
  instruction?: string
}

export async function POST(request: NextRequest) {
  const authContext = await requireAuthenticatedRouteUser()

  if (isUnauthenticatedRouteResult(authContext)) {
    return apiError(401, authContext.error, authContext.details)
  }

  const originState = validateSameOriginMutation(request)
  if (!originState.ok) return apiError(403, 'Cross-origin mutation blocked.', originState.details)

  const csrfState = validateCsrfToken(request)
  if (!csrfState.ok) return apiError(403, 'Invalid CSRF token.', csrfState.details)

  const rateLimitState = consumeRateLimit(
    request,
    { key: 'pitch-improve', limit: 20, windowMs: 10 * 60 * 1000 },
    buildRateLimitSubject(request, authContext.user.id)
  )
  if (!rateLimitState.ok) {
    return apiError(429, 'Rate limit exceeded.', `Tente novamente em ${rateLimitState.retryAfterSeconds}s.`)
  }

  let payload: ImproveRequestBody
  try {
    payload = (await request.json()) as ImproveRequestBody
  } catch {
    return apiError(400, 'Invalid JSON payload.')
  }

  const leadId = payload.lead_id
  const instruction = payload.instruction?.trim()

  if (!leadId || !isUuid(leadId)) {
    return apiError(400, 'Invalid lead_id.', 'Esperado UUID em lead_id.')
  }
  if (!instruction || instruction.length < 3) {
    return apiError(400, 'Instrução inválida.', 'Forneça uma instrução com pelo menos 3 caracteres.')
  }
  if (instruction.length > 400) {
    return apiError(400, 'Instrução muito longa.', 'Máximo de 400 caracteres.')
  }

  try {
    const supabase = createAdminClient()
    const leadResult = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle()

    if (leadResult.error) return apiError(500, 'Failed to load lead.')
    if (!leadResult.data) return apiError(404, 'Lead not found.')

    const lead = leadResult.data as Lead
    if (!lead.pitch?.trim()) return apiError(400, 'Lead ainda não tem pitch gerado.')

    const result = await improvePitchForLead(lead, instruction)

    const saveResult = await supabase
      .from('leads')
      .update({ pitch: result.pitch })
      .eq('id', leadId)
      .select('pitch')
      .maybeSingle()

    if (saveResult.error) {
      logger.error({ err: saveResult.error.message }, '[POST /api/pitch/improve] Save error')
      return apiError(500, 'Failed to save improved pitch.')
    }

    return apiJson({ pitch: result.pitch, provider: result.provider })
  } catch (error) {
    if (error instanceof PitchProviderError) {
      return apiError(503, 'Pitch improvement temporarily unavailable.', error.message)
    }
    logger.error({ err: error }, '[POST /api/pitch/improve] Unexpected error')
    return apiError(500, 'Internal server error.')
  }
}
