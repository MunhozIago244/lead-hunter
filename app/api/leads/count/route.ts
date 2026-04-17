import { logger } from '@/lib/logger'

import {
  isUnauthenticatedRouteResult,
  requireAuthenticatedRouteUser,
} from '@/lib/auth'
import { apiError, apiJson } from '@/lib/api/response'
import { getLeadAverageScore } from '@/lib/leads'

export const runtime = 'nodejs'

export async function GET() {
  const authContext = await requireAuthenticatedRouteUser()

  if (isUnauthenticatedRouteResult(authContext)) {
    return apiError(401, authContext.error, authContext.details)
  }

  try {
    const [countResult, scoresResult] = await Promise.all([
      authContext.supabase
        .from('leads')
        .select('*', { count: 'exact', head: true }),
      authContext.supabase
        .from('leads')
        .select('score_mobile,score_speed,score_seo,score_design'),
    ])

    if (countResult.error) {
      logger.error({ err: countResult.error.message }, '[GET /api/leads/count] Count error')
      return apiError(500, 'Failed to count leads.')
    }

    if (scoresResult.error) {
      logger.error({ err: scoresResult.error.message }, '[GET /api/leads/count] Scores error')
      return apiError(500, 'Failed to fetch scores.')
    }

    const criticalCount = (scoresResult.data ?? []).filter((row) => {
      const avg = getLeadAverageScore(row as Parameters<typeof getLeadAverageScore>[0])
      return avg !== null && avg < 40
    }).length

    return apiJson({ total: countResult.count ?? 0, critical: criticalCount })
  } catch (error) {
    logger.error({ err: error }, '[GET /api/leads/count] Unexpected error')
    return apiError(500, 'Internal server error.')
  }
}
