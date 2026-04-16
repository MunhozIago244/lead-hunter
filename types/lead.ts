/**
 * TypeScript types for the leads table.
 * Source of truth: supabase/migrations/20260416000000_create_leads_table.sql
 * Requirements: FOUND-06
 *
 * Column name mapping (SQL -> TypeScript):
 *   UUID            -> string
 *   TEXT NOT NULL   -> string
 *   TEXT (nullable) -> string | null
 *   BOOLEAN         -> boolean
 *   INTEGER         -> number | null  (scores are nullable — site may be unreachable)
 *   JSONB           -> string[] | null  (problems stored as array of strings)
 *   lead_status     -> LeadStatus
 *   TIMESTAMPTZ     -> string  (ISO 8601 string from Supabase JS client)
 */

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'closed'
  | 'discarded'

export interface Lead {
  id: string
  name: string
  segment: string | null
  city: string
  address: string | null
  phone: string | null
  email: string | null
  site: string | null
  has_site: boolean
  score_mobile: number | null
  score_speed: number | null
  score_seo: number | null
  score_design: number | null
  problems: string[] | null
  pitch: string | null
  status: LeadStatus
  contact_channel: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/**
 * Fields that can be updated via PATCH /api/lead/[id].
 * All fields optional — partial updates only.
 * Omits id, created_at, updated_at (server-managed).
 * Omits scraper-written fields (name, segment, city, address, phone, email, site, has_site, scores, problems).
 */
export type LeadUpdate = {
  status?: LeadStatus
  contact_channel?: string | null
  notes?: string | null
  pitch?: string | null
}
