import {
  CRM_PIPELINE_STAGE_LABELS,
  CRM_REPLY_STATUS_LABELS,
} from '@/lib/crm-constants'
import type { CrmPipelineStage, CrmReplyStatus } from '@/types/crm'

type CrmStageBadgeProps = {
  stage: CrmPipelineStage
}

type CrmReplyBadgeProps = {
  replyStatus: CrmReplyStatus
}

function getStageTone(stage: CrmPipelineStage) {
  if (stage === 'won') {
    return 'bg-accent/14 text-accent'
  }

  if (stage === 'lost') {
    return 'bg-warning/14 text-warning'
  }

  if (stage === 'replied' || stage === 'meeting_scheduled') {
    return 'bg-foreground/10 text-foreground'
  }

  if (stage === 'awaiting_reply' || stage === 'proposal_ready') {
    return 'bg-[#9b711b]/12 text-[#9b711b] dark:bg-[#efc16c]/14 dark:text-[#efc16c]'
  }

  return 'bg-border text-foreground'
}

function getReplyTone(replyStatus: CrmReplyStatus) {
  if (replyStatus === 'replied') {
    return 'bg-accent/14 text-accent'
  }

  if (replyStatus === 'bounced' || replyStatus === 'opted_out') {
    return 'bg-warning/14 text-warning'
  }

  if (replyStatus === 'awaiting_reply') {
    return 'bg-[#9b711b]/12 text-[#9b711b] dark:bg-[#efc16c]/14 dark:text-[#efc16c]'
  }

  return 'bg-border text-foreground'
}

export function CrmStageBadge({ stage }: CrmStageBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getStageTone(stage)}`}
    >
      {CRM_PIPELINE_STAGE_LABELS[stage]}
    </span>
  )
}

export function CrmReplyBadge({ replyStatus }: CrmReplyBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getReplyTone(replyStatus)}`}
    >
      {CRM_REPLY_STATUS_LABELS[replyStatus]}
    </span>
  )
}
