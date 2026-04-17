/**
 * Inline tests for normalizeBrazilianWhatsAppNumber.
 * Run: npx tsx lib/outreach.test.ts
 */
import { normalizeBrazilianWhatsAppNumber, buildWhatsAppHref } from '@/lib/outreach'

const cases: Array<{ input: string | null; expected: string | null; label: string }> = [
  { input: '(11) 9876-5432', expected: '5511998765432', label: 'SP (11) 8-digit adds 9' },
  { input: '(21) 98765-4321', expected: '5521987654321', label: 'RJ (21) 9-digit passes through' },
  { input: '(85) 9876-5432', expected: '5585998765432', label: 'CE (85) previously excluded' },
  { input: '(98) 9876-5432', expected: '5598998765432', label: 'MA (98) previously excluded' },
  { input: '5511987654321', expected: '5511987654321', label: 'already international' },
  { input: '(00) 9876-5432', expected: null, label: 'invalid DDD 00' },
  { input: null, expected: null, label: 'null input' },
  { input: '', expected: null, label: 'empty string' },
]

let passed = 0
let failed = 0

for (const { input, expected, label } of cases) {
  const result = normalizeBrazilianWhatsAppNumber(input)
  if (result === expected) {
    passed++
    console.log(`  PASS: ${label}`)
  } else {
    failed++
    console.error(`  FAIL: ${label} => got ${JSON.stringify(result)}, expected ${JSON.stringify(expected)}`)
  }
}

// WhatsApp href for DDD 85
const href85 = buildWhatsAppHref('(85) 9876-5432', 'Olá')
if (href85?.startsWith('https://wa.me/5585998765432')) {
  passed++
  console.log('  PASS: buildWhatsAppHref DDD 85')
} else {
  failed++
  console.error(`  FAIL: buildWhatsAppHref DDD 85 => ${href85}`)
}

// WhatsApp href for DDD 98
const href98 = buildWhatsAppHref('(98) 9876-5432', 'Olá')
if (href98?.startsWith('https://wa.me/5598998765432')) {
  passed++
  console.log('  PASS: buildWhatsAppHref DDD 98')
} else {
  failed++
  console.error(`  FAIL: buildWhatsAppHref DDD 98 => ${href98}`)
}

console.log(`\noutreach.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
