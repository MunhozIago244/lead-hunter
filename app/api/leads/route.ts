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

  if (status && !isLeadStatus(status)) {
    return apiError(
      400,
      'Invalid status filter.',
      'Use one of: new, contacted, replied, closed, discarded.'
    )
  }

  if (filter && !isLeadFilter(filter)) {
    return apiError(
      400,
      'Invalid lead filter.',
      'Use one of: critical, no-site, contacted.'
    )
  }

  try {
    let query = authContext.supabase
      .from('leads')
      .select(LEAD_API_SELECT_COLUMNS)
      .order('created_at', {
      ascending: false,
    })

    if (status) {
      query = query.eq('status', status)
    }

    if (segment) {
      query = query.ilike('segment', `%${segment}%`)
    }

    if (city) {
      query = query.ilike('city', `%${city}%`)
    }

    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    if (filter === 'no-site') {
      query = query.eq('has_site', false)
    }

    if (filter === 'contacted' && !status) {
      query = query.eq('status', 'contacted')
    }

    const { data, error } = await query

    if (error) {
      logger.error('[GET /api/leads] Supabase query error:', error.message)
      return apiError(500, 'Failed to fetch leads.')
    }

    let leads = ((data ?? []) as unknown) as Lead[]

    if (filter === 'critical') {
      leads = leads.filter((lead) => {
        const averageScore = getLeadAverageScore(lead)
        return averageScore !== null && averageScore < 40
      })
    }

    return apiJson(leads)
  } catch (error) {
    logger.error('[GET /api/leads] Unexpected error:', error)
    return apiError(500, 'Internal server error.')
  }
}
