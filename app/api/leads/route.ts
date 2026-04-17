import { logger } from '@/lib/logger'
import { NextRequest } from 'next/server'

import {
  isUnauthenticatedRouteResult,
  requireAuthenticatedRouteUser,
} from '@/lib/auth'
import { apiError, apiJson } from '@/lib/api/response'
import {
  getLeadAverageScore,
  isLeadFilter,
  LEAD_API_SELECT_COLUMNS,
  isLeadStatus,
  normalizeCityParam,
  normalizeFilterParam,
  normalizeSearchParam,
  normalizeSegmentParam,
} from '@/lib/leads'
import type { Lead } from '@/types/lead'

export const runtime = 'nodejs'

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100

export async function GET(request: NextRequest) {
  const authContext = await requireAuthenticatedRouteUser()

  if (isUnauthenticatedRouteResult(authContext)) {
    return apiError(401, authContext.error, authContext.details)
  }

  const searchParams = request.nextUrl.searchParams
  const status = normalizeFilterParam(searchParams.get('status'))
  const segment = normalizeSegmentParam(searchParams.get('segment'))
  const city = normalizeCityParam(searchParams.get('city'))
  const search = normalizeSearchParam(searchParams.get('search'))
  const filter = normalizeFilterParam(searchParams.get('filter'))

  const limitParam = parseInt(searchParams.get('limit') ?? '', 10)
  const offsetParam = parseInt(searchParams.get('offset') ?? '', 10)
  const limit = !isNaN(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT
  const offset = !isNaN(offsetParam) && offsetParam > 0 ? offsetParam : 0

  if (status && !isLeadStatus(status)) {
    return apiError(400, 'Invalid status filter.', 'Use one of: new, contacted, replied, closed, discarded.')
  }

  if (filter && !isLeadFilter(filter)) {
    return apiError(400, 'Invalid lead filter.', 'Use one of: critical, no-site, contacted.')
  }

  try {
    // critical filter requires post-filtering — fetch without range first
    const isCritical = filter === 'critical'

    let query = authContext.supabase
      .from('leads')
      .select(LEAD_API_SELECT_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (segment) query = query.ilike('segment', `%${segment}%`)
    if (city) query = query.ilike('city', `%${city}%`)
    if (search) query = query.ilike('name', `%${search}%`)
    if (filter === 'no-site') query = query.eq('has_site', false)
    if (filter === 'contacted' && !status) query = query.eq('status', 'contacted')

    // For non-critical filters, apply pagination at DB level
    if (!isCritical) {
      query = query.range(offset, offset + limit - 1)
    }

    const { data, error, count } = await query

    if (error) {
      logger.error({ err: error.message }, '[GET /api/leads] Supabase query error')
      return apiError(500, 'Failed to fetch leads.')
    }

    let leads = ((data ?? []) as unknown) as Lead[]

    if (isCritical) {
      const allCritical = leads.filter((lead) => {
        const avg = getLeadAverageScore(lead)
        return avg !== null && avg < 40
      })
      const totalCritical = allCritical.length
      leads = allCritical.slice(offset, offset + limit)
      return apiJson({ leads, total: totalCritical, limit, offset })
    }

    return apiJson({ leads, total: count ?? leads.length, limit, offset })
  } catch (error) {
    logger.error({ err: error }, '[GET /api/leads] Unexpected error')
    return apiError(500, 'Internal server error.')
  }
}
