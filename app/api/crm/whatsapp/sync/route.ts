import { NextRequest } from 'next/server'

import { apiError, apiJson } from '@/lib/api/response'
import {
  parseCrmWhatsAppSyncPayload,
  processCrmWhatsAppSync,
} from '@/lib/crm-whatsapp'
import { consumeRateLimit } from '@/lib/security'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

function getIngestionSecretState(request: NextRequest) {
  const configuredSecret =
    process.env.CRM_WHATSAPP_INGESTION_SECRET ?? process.env.CRM_INGESTION_SECRET

  if (!configuredSecret) {
    return {
      ok: false as const,
      response: apiError(
        500,
        'Missing CRM WhatsApp ingestion secret.',
        'Set CRM_WHATSAPP_INGESTION_SECRET or CRM_INGESTION_SECRET before using the CRM WhatsApp sync route.'
      ),
    }
  }

  const providedSecret = request.headers.get('x-crm-ingestion-secret')

  if (providedSecret !== configuredSecret) {
    return {
      ok: false as const,
      response: apiError(
        401,
        'Invalid CRM WhatsApp ingestion secret.',
        'Provide the x-crm-ingestion-secret header to access the CRM WhatsApp sync route.'
      ),
    }
  }

  return {
    ok: true as const,
  }
}

export async function POST(request: NextRequest) {
  const secretState = getIngestionSecretState(request)

  if (!secretState.ok) {
    return secretState.response
  }

  const rateLimitState = consumeRateLimit(request, {
    key: 'crm-whatsapp-sync',
    limit: 120,
    windowMs: 10 * 60 * 1000,
  })

  if (!rateLimitState.ok) {
    return apiError(
      429,
      'CRM WhatsApp sync rate limit exceeded.',
      `Try again in ${rateLimitState.retryAfterSeconds} seconds.`
    )
  }

  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return apiError(400, 'Invalid JSON payload.', 'POST body must be valid JSON.')
  }

  const parsedPayload = parseCrmWhatsAppSyncPayload(payload)

  if ('error' in parsedPayload) {
    return apiError(400, parsedPayload.error, parsedPayload.details)
  }

  try {
    const supabase = createAdminClient()
    const result = await processCrmWhatsAppSync(supabase, parsedPayload.data)

    return apiJson(result, {
      status: result.jobStatus === 'failed' ? 500 : 200,
    })
  } catch (error) {
    console.error('[POST /api/crm/whatsapp/sync] Unexpected error:', error)
    return apiError(500, 'Failed to process CRM WhatsApp sync.')
  }
}
