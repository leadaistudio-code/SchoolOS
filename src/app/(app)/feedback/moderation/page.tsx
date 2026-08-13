import { requireContext } from '@/server/context'
import { listModerationQueue, moderationCounts } from '@/server/modules/feedback/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { formatDay } from '@/lib/dates'
import { ModerationDecision } from './decision'

export const metadata = { title: 'Feedback moderation' }

const TONE: Record<string, BadgeTone> = {
  SUBMITTED: 'neutral',
  UNDER_REVIEW: 'info',
  FLAGGED: 'warning',
  ESCALATED: 'danger',
  HIDDEN: 'neutral',
  APPROVED: 'success',
  RESOLVED: 'success',
}

/**
 * The comment queue.
 *
 * Written feedback is read here before it reaches the teacher it is about.
 * The respondent is never shown — a moderator judging words they can attach
 * to a child is no longer moderating anonymous feedback — so the card carries
 * the question, the comment and nothing that identifies who wrote it.
 */
export default async function ModerationPage() {
  const ctx = await requireContext('feedback.moderate')
  const [queue, counts] = await Promise.all([listModerationQueue(ctx), moderationCounts(ctx)])

  const waiting = queue.filter((m) => m.status === 'SUBMITTED' || m.status === 'UNDER_REVIEW')
  const decided = queue.filter((m) => m.status !== 'SUBMITTED' && m.status !== 'UNDER_REVIEW')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Feedback moderation"
        description="Written comments are read here before they reach the person they are about."
        breadcrumbs={[{ label: 'Feedback', href: '/feedback' }, { label: 'Moderation' }]}
      />

      <MetricRow>
        <Metric
          label="Awaiting a decision"
          value={String(waiting.length)}
          sub="Oldest first"
          emphasis={waiting.length > 0 ? 'warning' : undefined}
        />
        <Metric label="Approved" value={String(counts.APPROVED ?? 0)} sub="Visible to the target" />
        <Metric
          label="Hidden"
          value={String(counts.HIDDEN ?? 0)}
          sub="Kept on file, not shown"
        />
        <Metric
          label="Escalated"
          value={String(counts.ESCALATED ?? 0)}
          sub="Sent to safeguarding"
          emphasis={(counts.ESCALATED ?? 0) > 0 ? 'danger' : undefined}
        />
      </MetricRow>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Awaiting a decision</CardTitle>
          <span className="text-xs text-ink-subtle">Anonymous — the writer is never shown</span>
        </CardHeader>

        {waiting.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            description="Written answers appear here as soon as they are submitted. Ratings carry no words, so they are not queued."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {waiting.map((row) => (
              <li key={row.id} className="p-4">
                <Comment row={row} tone={TONE[row.status] ?? 'neutral'} />
                <ModerationDecision answerId={row.answer.id} status={row.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {decided.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Already decided</CardTitle>
            <span className="text-xs text-ink-subtle">A decision can be changed</span>
          </CardHeader>
          <ul className="divide-y divide-[var(--border)]">
            {decided.slice(0, 50).map((row) => (
              <li key={row.id} className="p-4">
                <Comment row={row} tone={TONE[row.status] ?? 'neutral'} />
                <ModerationDecision answerId={row.answer.id} status={row.status} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}

type Row = Awaited<ReturnType<typeof listModerationQueue>>[number]

function Comment({ row, tone }: { row: Row; tone: BadgeTone }) {
  const assignment = row.answer.response.assignment

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{row.status.toLowerCase().replace(/_/g, ' ')}</Badge>
        <span className="text-xs text-ink-subtle">
          {assignment.campaign.name}
          {assignment.subject ? ` · ${assignment.subject.name}` : ''}
          {assignment.targetStaff
            ? ` · about ${assignment.targetStaff.firstName} ${assignment.targetStaff.lastName}`
            : ''}
        </span>
        <span className="ml-auto text-xs tnum text-ink-subtle">
          {formatDay(row.answer.response.submittedAt)}
        </span>
      </div>

      <p className="mt-2 text-xs font-medium text-ink-muted">{row.answer.question.label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{row.answer.value}</p>

      {row.flagReason ? (
        <p className="mt-1.5 text-xs text-warning">Flagged: {row.flagReason}</p>
      ) : null}
      {row.note ? <p className="mt-1 text-xs text-ink-subtle">Note: {row.note}</p> : null}
    </>
  )
}
