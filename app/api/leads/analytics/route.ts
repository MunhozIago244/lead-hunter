import { logger } from '@/lib/logger'

import {
  isUnauthenticatedRouteResult,
  requireAuthenticatedRouteUser,
} from '@/lib/auth'
import { apiError, apiJson } from '@/lib/api/response'
import { LEAD_STATUS_VALUES } from '@/lib/leads'
import type { Lead, LeadStatus } from '@/types/lead'

export const runtime = 'nodejs'

const SELECT_COLUMNS = [
  'id',
  'status',
  'segment',
  'city',
  'has_site',
  'score_mobile',
  'score_speed',
  'score_seo',
  'score_design',
  'created_at',
].join(',')

export type LeadAnalytics = {
  totalLeads: number
  byStatus: Record<LeadStatus, number>
  withSite: number
  withoutSite: number
  averageScore: number | null
  criticalCount: number
  topSegments: Array<{ segment: string; count: number }>
  topCities: Array<{ city: string; count: number }>
  scoreDistribution: {
    excellent: number
    good: number
    fair: number
    critical: number
  }
  recentActivity: Array<{ date: string; count: number }>
}

export async function GET() {
  const authContext = await requireAuthenticatedRouteUser()

  if (isUnauthenticatedRouteResult(authContext)) {
    return apiError(401, authContext.error, authContext.details)
  }

  try {
    const { data, error } = await authContext.supabase
      .from('leads')
      .select(SELECT_COLUMNS)
      .order('created_at', { ascending: false })

    if (error) {
      logger.error({ err: error.message }, '[GET /api/leads/analytics] Supabase error')
      return apiError(500, 'Failed to fetch analytics.')
    }

    const leads = (data ?? []) as unknown as Pick<
      Lead,
      'id' | 'status' | 'segment' | 'city' | 'has_site' | 'score_mobile' | 'score_speed' | 'score_seo' | 'score_design' | 'created_at'
    >[]

    const byStatus = Object.fromEntries(
      LEAD_STATUS_VALUES.map((s) => [s, 0])
    ) as Record<LeadStatus, number>

    for (const lead of leads) {
      byStatus[lead.status]++
    }

    const leadsWithScore = leads.filter(
      (l) => l.score_mobile !== null || l.score_speed !== null || l.score_seo !== null || l.score_design !== null
    )

    const scoreSum = leadsWithScore.reduce((sum, l) => {
      const scores = [l.score_mobile, l.score_speed, l.score_seo, l.score_design].filter(
        (s): s is number => s !== null
      )
      return sum + scores.reduce((a, b) => a + b, 0) / scores.length
    }, 0)

    const averageScore = leadsWithScore.length > 0
      ? Math.round(scoreSum / leadsWithScore.length)
      : null

    const criticalCount = leadsWithScore.filter((l) => {
      const scores = [l.score_mobile, l.score_speed, l.score_seo, l.score_design].filter(
        (s): s is number => s !== null
      )
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      return avg < 40
    }).length

    const scoreDistribution = { excellent: 0, good: 0, fair: 0, critical: 0 }
    for (const lead of leadsWithScore) {
      const scores = [lead.score_mobile, lead.score_speed, lead.score_seo, lead.score_design].filter(
        (s): s is number => s !== null
      )
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      if (avg >= 70) scoreDistribution.excellent++
      else if (avg >= 55) scoreDistribution.good++
      else if (avg >= 40) scoreDistribution.fair++
      else scoreDistribution.critical++
    }

    const segmentMap = new Map<string, number>()
    for (const lead of leads) {
      if (lead.segment) {
        segmentMap.set(lead.segment, (segmentMap.get(lead.segment) ?? 0) + 1)
      }
    }
    const topSegments = [...segmentMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([segment, count]) => ({ segment, count }))

    const cityMap = new Map<string, number>()
    for (const lead of leads) {
      cityMap.set(lead.city, (cityMap.get(lead.city) ?? 0) + 1)
    }
    const topCities = [...cityMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([city, count]) => ({ city, count }))

    const dateMap = new Map<string, number>()
    for (const lead of leads) {
      const date = lead.created_at.slice(0, 10)
      dateMap.set(date, (dateMap.get(date) ?? 0) + 1)
    }
    const recentActivity = [...dateMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([date, count]) => ({ date, count }))

    const analytics: LeadAnalytics = {
      totalLeads: leads.length,
      byStatus,
      withSite: leads.filter((l) => l.has_site).length,
      withoutSite: leads.filter((l) => !l.has_site).length,
      averageScore,
      criticalCount,
      topSegments,
      topCities,
      scoreDistribution,
      recentActivity,
    }

    return apiJson(analytics)
  } catch (error) {
    logger.error({ err: error }, '[GET /api/leads/analytics] Unexpected error')
    return apiError(500, 'Internal server error.')
  }
}
