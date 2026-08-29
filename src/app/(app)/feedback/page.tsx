import Link from 'next/link'
import { ClipboardCheck, MessageSquare, ShieldAlert, Target } from 'lucide-react'
import { requireContext } from '@/server/context'
import { pendingForCurrentUser } from '@/server/modules/feedback/service'
import {
  ColorBanner,
  ColorTile,
  colorBannerPrimaryBtn,
} from '@/components/dashboard/color-tiles'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatNumber } from '@/lib/utils'

export const metadata = { title: 'Feedback' }

export default async function FeedbackPage() {
  const ctx = await requireContext('feedback.view')
  if (ctx.can('feedback.analytics_view')) {
    const [campaigns, assignments, responses, concerns, actions] = await Promise.all([
      ctx.db.feedbackCampaign.count({ where: { status: 'ACTIVE' } }),
      ctx.db.feedbackAssignment.count(),
      ctx.db.feedbackResponse.count(),
      ctx.db.feedbackConcern.count({
        where: { status: { in: ['NEW', 'UNDER_REVIEW', 'FOLLOW_UP_REQUIRED'] } },
      }),
      ctx.db.feedbackActionItem.count({
        where: { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING'] } },
      }),
    ])
    const responseRate = assignments
      ? `${Math.round((responses / assignments) * 100)}%`
      : '—'

    return (
      <div className="space-y-4">
        <ColorBanner
          tone="parents"
          eyebrow="Feedback"
          title="Feedback & experience"
          description="Continuous improvement signals across students, parents and staff."
          actions={
            <Link href="/feedback/campaigns" className={colorBannerPrimaryBtn()}>
              Manage campaigns
            </Link>
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ColorTile
            label="Active campaigns"
            value={formatNumber(campaigns)}
            tone="parents"
            href="/feedback/campaigns"
            icon={<MessageSquare className="size-5" aria-hidden />}
            delayMs={40}
          />
          <ColorTile
            label="Response rate"
            value={responseRate}
            sub={`${formatNumber(responses)} of ${formatNumber(assignments)} submitted`}
            tone="attendance"
            icon={<ClipboardCheck className="size-5" aria-hidden />}
            delayMs={80}
          />
          <ColorTile
            label="Awaiting review"
            value={formatNumber(concerns)}
            tone={concerns > 0 ? 'overdue' : 'pending'}
            href="/feedback/concerns"
            icon={<ShieldAlert className="size-5" aria-hidden />}
            delayMs={120}
          />
          <ColorTile
            label="Open action items"
            value={formatNumber(actions)}
            tone={actions > 0 ? 'overdue' : 'pending'}
            href="/feedback/actions"
            icon={<Target className="size-5" aria-hidden />}
            delayMs={160}
          />
        </div>

        <Card variant="elevated">
          <CardContent className="p-5">
            <h2 className="text-base font-semibold text-ink">Start the feedback cycle</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              Create a reusable template, save a campaign, then activate it to safely assign
              feedback only to students taught by each teacher.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                href="/feedback/templates"
              >
                Review templates
              </Link>
              <Link
                className={buttonVariants({ variant: 'primary', size: 'sm' })}
                href="/feedback/campaigns"
              >
                Create campaign
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const pending = await pendingForCurrentUser(ctx)
  return (
    <div className="space-y-4">
      <ColorBanner
        tone="parents"
        eyebrow="Feedback"
        title="Feedback"
        description="Your feedback helps the school improve learning and support."
      />
      {pending.length === 0 ? (
        <Card variant="elevated">
          <EmptyState
            title="You’re all caught up"
            description="There is no feedback pending for you right now."
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pending.map((assignment) => (
            <Link
              key={assignment.id}
              href={`/feedback/respond/${assignment.id}`}
              className="rounded-[var(--radius)] border border-line bg-surface p-4 transition-colors hover:border-brand"
            >
              <p className="text-sm font-medium text-ink">
                {assignment.targetStaff
                  ? `${assignment.targetStaff.firstName} ${assignment.targetStaff.lastName}`
                  : 'Feedback request'}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {assignment.subject?.name ?? assignment.template.name}
              </p>
              <p className="mt-4 text-sm font-medium text-brand">Give feedback →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
