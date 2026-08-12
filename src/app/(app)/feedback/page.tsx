import Link from 'next/link'
import { requireContext } from '@/server/context'
import { pendingForCurrentUser } from '@/server/modules/feedback/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { buttonVariants } from '@/components/ui/button-variants'

export const metadata = { title: 'Feedback' }
export default async function FeedbackPage() {
  const ctx = await requireContext('feedback.view')
  if (ctx.can('feedback.analytics_view')) {
    const [campaigns, assignments, responses, concerns, actions] = await Promise.all([ctx.db.feedbackCampaign.count({ where: { status: 'ACTIVE' } }), ctx.db.feedbackAssignment.count(), ctx.db.feedbackResponse.count(), ctx.db.feedbackConcern.count({ where: { status: { in: ['NEW', 'UNDER_REVIEW', 'FOLLOW_UP_REQUIRED'] } } }), ctx.db.feedbackActionItem.count({ where: { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'] } } })])
    return <div className="space-y-4"><PageHeader title="Feedback & experience" description="Continuous improvement signals across students, parents and staff." actions={<Link href="/feedback/campaigns" className={buttonVariants({ variant: 'primary', size: 'sm' })}>Manage campaigns</Link>} /><MetricRow><Metric label="Active campaigns" value={String(campaigns)} href="/feedback/campaigns" /><Metric label="Response rate" value={assignments ? `${Math.round((responses / assignments) * 100)}%` : '—'} sub={`${responses} of ${assignments} submitted`} /><Metric label="Awaiting review" value={String(concerns)} emphasis={concerns ? 'warning' : undefined} href="/feedback/concerns" /><Metric label="Open action items" value={String(actions)} emphasis={actions ? 'warning' : undefined} href="/feedback/actions" /></MetricRow><Card><CardContent className="p-5"><h2 className="text-base font-semibold text-ink">Start the feedback cycle</h2><p className="mt-1 max-w-2xl text-sm text-ink-muted">Create a reusable template, save a campaign, then activate it to safely assign feedback only to students taught by each teacher.</p><div className="mt-4 flex flex-wrap gap-2"><Link className={buttonVariants({ variant: 'secondary', size: 'sm' })} href="/feedback/templates">Review templates</Link><Link className={buttonVariants({ variant: 'primary', size: 'sm' })} href="/feedback/campaigns">Create campaign</Link></div></CardContent></Card></div>
  }
  const pending = await pendingForCurrentUser(ctx)
  return <div className="space-y-4"><PageHeader title="Feedback" description="Your feedback helps the school improve learning and support." />{pending.length === 0 ? <Card><EmptyState title="You’re all caught up" description="There is no feedback pending for you right now." /></Card> : <div className="grid gap-3 sm:grid-cols-2">{pending.map((assignment) => <Link key={assignment.id} href={`/feedback/respond/${assignment.id}`} className="rounded-[var(--radius)] border border-line bg-surface p-4 transition-colors hover:border-brand"><p className="text-sm font-medium text-ink">{assignment.targetStaff ? `${assignment.targetStaff.firstName} ${assignment.targetStaff.lastName}` : 'Feedback request'}</p><p className="mt-1 text-xs text-ink-muted">{assignment.subject?.name ?? assignment.template.name}</p><p className="mt-4 text-sm font-medium text-brand">Give feedback →</p></Link>)}</div>}</div>
}
