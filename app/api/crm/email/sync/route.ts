import { logger } from '@/lib/logger'
import { NextRequest } from 'next/server'

import { apiError, apiJson } from '@/lib/api/response'
import { parseCrmEmailSyncPayload, processCrmEmailSync } from '@/lib/crm-email'
import { consumeRateLimit } from '@/lib/security'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

function getIngestionSecretState(request: NextRequest) {
  const configuredSecret = process.env.CRM_INGESTION_SECRET

  if (!configuredSecret) {
    return {
      ok: false as const,
      response: apiError(
        500,
        'Missing CRM ingestion secret.',
        'Set CRM_INGESTION_SECRET before using the CRM email sync route.'
      ),
    }
  }

  const providedSecret = request.headers.get('x-crm-ingestion-secret')

  if (providedSecret !== configuredSecret) {
    return {
      ok: false as const,
      response: apiError(
        401,
        'Invalid CRM ingestion secret.',
        'Provide the x-crm-ingestion-secret header to access the CRM email sync route.'
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
    key: 'crm-email-sync',
    limit: 120,
    windowMs: 10 * 60 * 1000,
  })

  if (!rateLimitState.ok) {
    return apiError(
      429,
      'CRM email sync rate limit exceeded.',
      `Try again in ${rateLimitState.retryAfterSeconds} seconds.`
    )
  }

  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return apiError(400, 'Invalid JSON payload.', 'POST body must be valid JSON.')
  }

  const parsedPayload = parseCrmEmailSyncPayload(payload)

  if ('error' in parsedPayload) {
    return apiError(400, parsedPayload.error, parsedPayload.details)
  }

  try {
    const supabase = createAdminClient()
    const result = await processCrmEmailSync(supabase, parsedPayload.data)

    return apiJson(result, {
      status: result.jobStatus === 'failed' ? 500 : 200,
    })
  } catch (error) {
    logger.error({ err: error }, '[POST /api/crm/email/sync] Unexpected error')
    return apiError(500, 'Failed to process CRM email sync.')
  }
}
