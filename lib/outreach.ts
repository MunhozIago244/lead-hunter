import type { Lead } from '@/types/lead'

function digitsOnly(value: string | null) {
  return value ? value.replace(/\D/g, '') : ''
}

// All valid Brazilian DDDs as of 2024 (Anatel).
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24,
  27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])

function normalizeNationalBrazilianNumber(value: string) {
  if (value.length !== 10 && value.length !== 11) {
    return null
  }

  const ddd = value.slice(0, 2)
  const subscriber = value.slice(2)
  const dddNumber = Number(ddd)

  if (!VALID_DDDS.has(dddNumber)) {
    return null
  }

  // 8-digit subscriber from a valid DDD needs the leading 9 mobile prefix added.
  if (subscriber.length === 8) {
    return `55${ddd}9${subscriber}`
  }

  return `55${ddd}${subscriber}`
}

export function normalizeBrazilianWhatsAppNumber(phone: string | null) {
  let digits = digitsOnly(phone)

  if (!digits) {
    return null
  }

  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  }

  if (digits.startsWith('55')) {
    const national = digits.slice(2)
    const normalized = normalizeNationalBrazilianNumber(national)
    return normalized ?? (digits.length >= 12 ? digits : null)
  }

  return normalizeNationalBrazilianNumber(digits)
}

export function buildWhatsAppHref(phone: string | null, text: string | null) {
  const normalizedNumber = normalizeBrazilianWhatsAppNumber(phone)
  const normalizedText = text?.trim()

  if (!normalizedNumber || !normalizedText) {
    return null
  }

  return `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(normalizedText)}`
}

export function buildPitchEmailSubject(lead: Pick<Lead, 'name' | 'city'>) {
  return `Ideia rápida para ${lead.name} em ${lead.city}`
}

export function buildMailtoHref(
  email: string | null,
  subject: string,
  body: string | null
) {
  const normalizedEmail = email?.trim()
  const normalizedBody = body?.trim()

  if (!normalizedEmail || !normalizedBody) {
    return null
  }

  return `mailto:${normalizedEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(normalizedBody)}`
}
