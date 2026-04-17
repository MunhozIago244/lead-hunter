import type { Lead, LeadStatus, LeadUpdate } from '@/types/lead'

export const LEAD_STATUS_VALUES = [
  'new',
  'contacted',
  'replied',
  'closed',
  'discarded',
] as const

export const LEAD_FILTER_VALUES = ['critical', 'no-site', 'contacted'] as const
export const LEAD_API_SELECT_COLUMNS = [
  'id',
  'name',
  'segment',
  'city',
  'address',
  'phone',
  'email',
  'site',
  'has_site',
  'score_mobile',
  'score_speed',
  'score_seo',
  'score_design',
  'problems',
  'pitch',
  'status',
  'created_at',
  'updated_at',
].join(',')

type LeadFilter = (typeof LEAD_FILTER_VALUES)[number]
type LeadUpdateField = keyof LeadUpdate

const MUTABLE_LEAD_FIELDS: readonly LeadUpdateField[] = [
  'status',
  'contact_channel',
  'notes',
  'pitch',
]

function sanitizeQueryValue(value: string | null, maxLength: number) {
  if (!value) {
    return null
  }

  const sanitized = value
    .trim()
    .replace(/[\\%_]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)

  return sanitized || null
}

function sanitizeNullableText(value: string | null, maxLength: number) {
  if (value === null) {
    return null
  }

  const normalized = value.replace(/\r\n/g, '\n').trim()

  if (!normalized) {
    return null
  }

  return normalized.slice(0, maxLength)
}

export function isLeadStatus(value: string): value is LeadStatus {
  return LEAD_STATUS_VALUES.includes(value as LeadStatus)
}

export function isLeadFilter(value: string): value is LeadFilter {
  return LEAD_FILTER_VALUES.includes(value as LeadFilter)
}

export function normalizeSearchParam(value: string | null) {
  return sanitizeQueryValue(value, 80)
}

export function normalizeFilterParam(value: string | null) {
  return sanitizeQueryValue(value, 30)
}

export function normalizeSegmentParam(value: string | null) {
  return sanitizeQueryValue(value, 80)
}

export function normalizeCityParam(value: string | null) {
  return sanitizeQueryValue(value, 80)
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

export function getLeadAverageScore(
  lead: Pick<Lead, 'score_mobile' | 'score_speed' | 'score_seo' | 'score_design'>
) {
  const scores = [
    lead.score_mobile,
    lead.score_speed,
    lead.score_seo,
    lead.score_design,
  ].filter((score): score is number => typeof score === 'number')

  if (scores.length === 0) {
    return null
  }

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
}

export function parseLeadUpdatePayload(
  payload: unknown
): { data: LeadUpdate } | { error: string; details?: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      error: 'Invalid JSON payload.',
      details: 'PATCH body must be a JSON object.',
    }
  }

  const input = payload as Record<string, unknown>
  const unknownFields = Object.keys(input).filter(
    (key) => !MUTABLE_LEAD_FIELDS.includes(key as LeadUpdateField)
  )

  if (unknownFields.length > 0) {
    return {
      error: 'Unknown lead fields in payload.',
      details: `Allowed fields: ${MUTABLE_LEAD_FIELDS.join(', ')}.`,
    }
  }

  const data: LeadUpdate = {}

  if ('status' in input) {
    if (typeof input.status !== 'string' || !isLeadStatus(input.status)) {
      return {
        error: 'Invalid status value.',
        details: `Allowed values: ${LEAD_STATUS_VALUES.join(', ')}.`,
      }
    }

    data.status = input.status
  }

  if ('contact_channel' in input) {
    if (
      input.contact_channel !== null &&
      typeof input.contact_channel !== 'string'
    ) {
      return {
        error: 'Invalid contact_channel value.',
        details: 'contact_channel must be a string or null.',
      }
    }

    data.contact_channel = sanitizeNullableText(input.contact_channel ?? null, 120)
  }

  if ('notes' in input) {
    if (input.notes !== null && typeof input.notes !== 'string') {
      return {
        error: 'Invalid notes value.',
        details: 'notes must be a string or null.',
      }
    }

    data.notes = sanitizeNullableText(input.notes ?? null, 5000)
  }

  if ('pitch' in input) {
    if (input.pitch !== null && typeof input.pitch !== 'string') {
      return {
        error: 'Invalid pitch value.',
        details: 'pitch must be a string or null.',
      }
    }

    data.pitch = sanitizeNullableText(input.pitch ?? null, 5000)
  }

  if (Object.keys(data).length === 0) {
    return {
      error: 'No updatable lead fields were provided.',
      details: `Provide at least one of: ${MUTABLE_LEAD_FIELDS.join(', ')}.`,
    }
  }

  return { data }
}
