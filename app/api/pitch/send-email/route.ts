import { logger } from '@/lib/logger'
import { NextRequest } from 'next/server'
import { Resend } from 'resend'

import {
  isUnauthenticatedRouteResult,
  requireAuthenticatedRouteUser,
} from '@/lib/auth'
import { apiError, apiJson } from '@/lib/api/response'
import { isUuid } from '@/lib/leads'
import { buildPitchEmailSubject } from '@/lib/outreach'
import {
  buildRateLimitSubject,
  consumeRateLimit,
  validateCsrfToken,
  validateSameOriginMutation,
} from '@/lib/security'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Lead } from '@/types/lead'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authContext = await requireAuthenticatedRouteUser()
  if (isUnauthenticatedRouteResult(authContext)) return apiError(401, authContext.error, authContext.details)

  const originState = validateSameOriginMutation(request)
  if (!originState.ok) return apiError(403, 'Cross-origin mutation blocked.', originState.details)

  const csrfState = validateCsrfToken(request)
  if (!csrfState.ok) return apiError(403, 'Invalid CSRF token.', csrfState.details)

  const rateLimitState = consumeRateLimit(
    request,
    { key: 'pitch-email', limit: 30, windowMs: 60 * 60 * 1000 },
    buildRateLimitSubject(request, authContext.user.id)
  )
  if (!rateLimitState.ok) return apiError(429, 'Rate limit de email atingido.', `Tente em ${rateLimitState.retryAfterSeconds}s.`)

  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !fromEmail) {
    return apiError(503, 'Email não configurado.', 'Defina RESEND_API_KEY e RESEND_FROM_EMAIL no ambiente.')
  }

  let body: { lead_id?: string }
  try {
    body = (await request.json()) as { lead_id?: string }
  } catch {
    return apiError(400, 'Invalid JSON payload.')
  }

  if (!body.lead_id || !isUuid(body.lead_id)) return apiError(400, 'Invalid lead_id.')

  const supabase = createAdminClient()
  const { data, error } = await supabase.from('leads').select('*').eq('id', body.lead_id).maybeSingle()

  if (error) return apiError(500, 'Failed to load lead.')
  if (!data) return apiError(404, 'Lead not found.')

  const lead = data as Lead

  if (!lead.email) return apiError(400, 'Este lead não tem email cadastrado.')
  if (!lead.pitch?.trim()) return apiError(400, 'Gere o pitch antes de enviar por email.')

  const resend = new Resend(apiKey)
  const subject = buildPitchEmailSubject(lead)

  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: lead.email,
      subject,
      text: lead.pitch.trim(),
    })

    if (result.error) {
      logger.error({ err: result.error }, '[POST /api/pitch/send-email] Resend error')
      return apiError(502, 'Falha ao enviar email.', result.error.message)
    }

    logger.info({ leadId: lead.id, to: lead.email }, '[POST /api/pitch/send-email] Email sent')
    return apiJson({ sent: true, id: result.data?.id })
  } catch (err) {
    logger.error({ err }, '[POST /api/pitch/send-email] Unexpected error')
    return apiError(500, 'Internal server error.')
  }
}
