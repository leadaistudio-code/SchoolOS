import { requireContext } from '@/server/context'
import { listActionItems } from '@/server/modules/feedback/service'
import { teacherOptions } from '@/server/modules/people/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { NewActionItemButton } from './controls'
import { ActionItemList } from './action-item-list'

export const metadata = { title: 'Feedback action items' }

const STATUS_TONE: Record<string, BadgeTone> = {
  OPEN: 'warning',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  WAITING: 'neutral',
  RESOLVED: 'success',
  CLOSED: 'neutral',
}

const LIVE = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING']

/**
 * What the school decided to do about the feedback it collected.
 *
 * Feedback that produces no action is a survey, so this list is the point of
 * the module rather than a附 appendix to it. Overdue items are called out
 * because an action item with a date nobody watches is the same as no action
 * item at all.
 */
export default async function FeedbackActionsPage() {
  const ctx = await requireContext('feedback.action_manage')
  const [items, teachers] = await Promise.all([listActionItems(ctx), teacherOptions(ctx)])

  const live = items.filter((i) => LIVE.includes(i.status))
  const done = items.filter((i) => !LIVE.includes(i.status))
  const now = new Date()
  const overdue = live.filter((i) => i.dueAt && i.dueAt < now)

  const staff = teachers.map((t) => ({ id: t.id, label: `${t.firstName} ${t.lastName}` }))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Action items"
        description="What the school decided to do about the feedback it collected."
        breadcrumbs={[{ label: 'Feedback', href: '/feedback' }, { label: 'Action items' }]}
        actions={<NewActionItemButton staff={staff} />}
      />

      <MetricRow columns={3}>
        <Metric
          label="Open"
          value={String(live.length)}
          sub="Still to be done"
          emphasis={live.length > 0 ? 'warning' : undefined}
        />
        <Metric
          label="Overdue"
          value={String(overdue.length)}
          sub="Past their due date"
          emphasis={overdue.length > 0 ? 'danger' : undefined}
        />
        <Metric label="Closed" value={String(done.length)} sub="Resolved or closed" />
      </MetricRow>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Open items</CardTitle>
          <span className="text-xs text-ink-subtle">Most urgent first</span>
        </CardHeader>
        {live.length === 0 ? (
          <EmptyState
            title="Nothing outstanding"
            description="Raise an action item when a piece of feedback needs somebody to do something about it."
            action={<NewActionItemButton staff={staff} label="Raise the first action item" />}
          />
        ) : (
          <ActionItemList
            staff={staff}
            rows={live.map((item) => ({
              id: item.id,
              status: item.status,
              priority: item.priority,
              category: item.category,
              dueAt: item.dueAt?.toISOString() ?? null,
              overdue: !!item.dueAt && item.dueAt < now,
              title: item.title,
              description: item.description,
              assigneeStaffId: item.assigneeStaffId,
              assigneeName: item.assignee
                ? `${item.assignee.firstName} ${item.assignee.lastName}`
                : null,
            }))}
          />
        )}
      </Card>

      {done.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Closed</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-[var(--border)]">
            {done.slice(0, 50).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <Badge tone={STATUS_TONE[item.status] ?? 'neutral'}>
                  {item.status.toLowerCase()}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.title}</span>
                <span className="text-xs text-ink-subtle">
                  {item.assignee
                    ? `${item.assignee.firstName} ${item.assignee.lastName}`
                    : 'Unassigned'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
