import { logger } from '@/lib/logger'

import {
  isUnauthenticatedRouteResult,
  requireAuthenticatedRouteUser,
} from '@/lib/auth'
import { apiError, apiJson } from '@/lib/api/response'

export const runtime = 'nodejs'

export async function GET() {
  const authContext = await requireAuthenticatedRouteUser()

  if (isUnauthenticatedRouteResult(authContext)) {
    return apiError(401, authContext.error, authContext.details)
  }

  try {
    const { count, error } = await authContext.supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })

    if (error) {
      logger.error({ err: error.message }, '[GET /api/leads/count] Supabase error')
      return apiError(500, 'Failed to count leads.')
    }

    return apiJson({ total: count ?? 0 })
  } catch (error) {
    logger.error({ err: error }, '[GET /api/leads/count] Unexpected error')
    return apiError(500, 'Internal server error.')
  }
}
