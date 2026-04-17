import type { ReactNode } from 'react'

type LeadScoreCardProps = {
  label: string
  value: number | null
  helper?: ReactNode
}

function buildScoreTone(value: number | null) {
  if (value === null) {
    return {
      card: 'border-border bg-surface-strong',
      value: 'text-muted',
    }
  }

  if (value < 40) {
    return {
      card: 'border-warning/35 bg-warning/10',
      value: 'text-warning',
    }
  }

  if (value < 70) {
    return {
      card: 'border-[#c79b55]/40 bg-[#f6ebd8] dark:border-[#efc16c]/35 dark:bg-[#2b2214]',
      value: 'text-[#84601d] dark:text-[#efc16c]',
    }
  }

  return {
    card: 'border-accent/25 bg-accent/10',
    value: 'text-accent',
  }
}

export function LeadScoreCard({
  label,
  value,
  helper,
}: LeadScoreCardProps) {
  const tone = buildScoreTone(value)

  return (
    <div className={`rounded-[1.35rem] border p-4 ${tone.card}`}>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className={`mt-3 text-3xl font-semibold tracking-[-0.05em] ${tone.value}`}>
        {value === null ? '--' : value}
      </p>
      <div className="mt-2 text-sm leading-6 text-muted">
        {helper ?? 'Sem leitura disponível'}
      </div>
    </div>
  )
}
