import { requireContext } from '@/server/context'
import { listConcerns } from '@/server/modules/feedback/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { formatDay } from '@/lib/dates'
import { ConcernControls } from './controls'

export const metadata = { title: 'Confidential concerns' }

const TONE: Record<string, BadgeTone> = {
  NEW: 'danger',
  UNDER_REVIEW: 'warning',
  FOLLOW_UP_REQUIRED: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
}

const OPEN = ['NEW', 'UNDER_REVIEW', 'FOLLOW_UP_REQUIRED']

/**
 * Confidential concerns raised through feedback.
 *
 * These never appear in campaign analytics and are not visible to the teacher
 * a campaign is about — a child who reports something has to be able to trust
 * that. Only the safeguarding roles hold `feedback.concern_view`, so the list
 * is short, ordered newest first, and says plainly how long each one has been
 * waiting.
 */
export default async function ConcernsPage() {
  const ctx = await requireContext('feedback.concern_view')
  const concerns = await listConcerns(ctx)
  const canManage = ctx.can('feedback.concern_manage')

  const open = concerns.filter((c) => OPEN.includes(c.status))
  const closed = concerns.filter((c) => !OPEN.includes(c.status))
  const untouched = concerns.filter((c) => c.status === 'NEW')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Confidential concerns"
        description="Raised privately through feedback. Never shown to the person a campaign is about."
        breadcrumbs={[{ label: 'Feedback', href: '/feedback' }, { label: 'Concerns' }]}
      />

      <MetricRow columns={3}>
        <Metric
          label="Open"
          value={String(open.length)}
          sub="Needing a decision or follow-up"
          emphasis={open.length > 0 ? 'warning' : undefined}
        />
        <Metric
          label="Never opened"
          value={String(untouched.length)}
          sub="Nobody has looked at these yet"
          emphasis={untouched.length > 0 ? 'danger' : undefined}
        />
        <Metric label="Closed" value={String(closed.length)} sub="Resolved or closed" />
      </MetricRow>

      {untouched.length > 0 ? (
        <Notice tone="danger" title={`${untouched.length} concerns have not been opened`}>
          A concern raised confidentially is a child asking for help. Read each one and set a
          status so the record shows it was seen.
        </Notice>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Open concerns</CardTitle>
          <span className="text-xs text-ink-subtle">Newest first</span>
        </CardHeader>
        {open.length === 0 ? (
          <EmptyState
            title="No open concerns"
            description="Concerns appear here the moment somebody raises one in a feedback form."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {open.map((concern) => (
              <li key={concern.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[concern.status] ?? 'neutral'}>
                    {concern.status.toLowerCase().replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-xs text-ink-subtle">
                    {concern.response.assignment.campaign.name}
                  </span>
                  <span className="ml-auto text-xs tnum text-ink-subtle">
                    Raised {formatDay(concern.createdAt)}
                  </span>
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{concern.detail}</p>

                {canManage ? (
                  <ConcernControls id={concern.id} status={concern.status} />
                ) : (
                  <p className="mt-2 text-xs text-ink-subtle">
                    You can read concerns but not act on them.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {closed.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Closed</CardTitle>
            <span className="text-xs text-ink-subtle">Kept on the record</span>
          </CardHeader>
          <ul className="divide-y divide-[var(--border)]">
            {closed.map((concern) => (
              <li key={concern.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={TONE[concern.status] ?? 'neutral'}>
                    {concern.status.toLowerCase()}
                  </Badge>
                  <span className="text-xs text-ink-subtle">
                    {concern.response.assignment.campaign.name}
                  </span>
                  <span className="ml-auto text-xs tnum text-ink-subtle">
                    {concern.resolvedAt
                      ? `Closed ${formatDay(concern.resolvedAt)}`
                      : formatDay(concern.createdAt)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{concern.detail}</p>
                {canManage ? <ConcernControls id={concern.id} status={concern.status} /> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
