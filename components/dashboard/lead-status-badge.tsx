import type { LeadStatus } from '@/types/lead'

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'bg-accent text-white',
  contacted: 'bg-warning/15 text-warning',
  replied: 'bg-[#dff2ea] text-[#0a5b47] dark:bg-[#123528] dark:text-[#74d8b4]',
  closed: 'bg-[#dce7ff] text-[#214fbe] dark:bg-[#15284f] dark:text-[#8fb3ff]',
  discarded: 'bg-black/8 text-muted dark:bg-white/10',
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'novo',
  contacted: 'contatado',
  replied: 'respondeu',
  closed: 'fechado',
  discarded: 'descartado',
}

type LeadStatusBadgeProps = {
  status: LeadStatus
}

export function LeadStatusBadge({ status }: LeadStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
