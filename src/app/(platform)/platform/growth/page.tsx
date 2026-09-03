import Link from 'next/link'
import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { parseListQuery } from '@/lib/query'
import { dashboard, listFollowUps, listSchools } from '@/server/modules/platform/growth/service'
import { schoolListFilterSchema } from '@/server/modules/platform/growth/schema'
import { PageHeader } from '@/components/page-header'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney, formatNumber } from '@/lib/utils'
import { STAGE_LABELS, STALE_DAYS, type CrmStage } from '@/lib/growth-crm'
import { completeFollowUpAction } from './actions'
import { GrowthQuickAdd } from './quick-add'

export const metadata = { title: 'Growth CRM' }

export default async function GrowthDashboardPage() {
  const ctx = await requirePlatformContext('platform.crm')
  const query = parseListQuery({})
  const [stats, today, overdue, recent] = await Promise.all([
    dashboard(ctx),
    listFollowUps(ctx, 'today'),
    listFollowUps(ctx, 'overdue'),
    listSchools(ctx, { ...query, pageSize: 8, sort: 'updatedAt', dir: 'desc' }, schoolListFilterSchema.parse({})),
  ])
  const k = stats.kpis
  const canEdit = ctx.user.permissions.has('platform.crm_edit')
  const canCreate = ctx.user.permissions.has('platform.crm_create')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Growth CRM"
        description={`${formatNumber(k.total)} prospects · ${formatNumber(k.followUpsOverdue)} overdue`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/platform/growth/today" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Today
            </Link>
            <Link href="/platform/growth/pipeline" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Pipeline
            </Link>
            <Link href="/platform/growth/schools" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              All schools
            </Link>
            <Link href="/platform/growth/templates" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Templates
            </Link>
            {canEdit ? <GrowthQuickAdd /> : null}
          </div>
        }
      />

      <MetricRow>
        <Metric
          label="Prospects"
          value={formatNumber(k.total)}
          sub={`${formatNumber(k.newThisMonth)} new this month`}
          href="/platform/growth/schools"
          trend={
            k.newPrevMonth > 0
              ? {
                  value: Math.round(((k.newThisMonth - k.newPrevMonth) / k.newPrevMonth) * 100),
                  label: 'new vs last month',
                }
              : undefined
          }
        />
        <Metric
          label="Follow-ups today"
          value={formatNumber(k.followUpsToday)}
          sub={`${formatNumber(k.followUpsOverdue)} overdue`}
          emphasis={k.followUpsOverdue > 0 ? 'danger' : undefined}
        />
        <Metric
          label="Pipeline"
          value={formatMoney(k.pipelineValue)}
          sub={`${formatMoney(k.weighted)} weighted`}
          href="/platform/growth/pipeline"
        />
        <Metric
          label="Won"
          value={formatNumber(k.won)}
          sub={k.conversion !== null ? `${k.conversion}% of decided` : `${formatNumber(k.lost)} lost`}
          emphasis={k.won > 0 ? 'success' : undefined}
        />
      </MetricRow>

      <MetricRow>
        <Metric label="Contacted" value={formatNumber(k.contacted)} href="/platform/growth/schools?stage=CONTACTED" />
        <Metric label="Visits logged" value={formatNumber(k.visits)} />
        <Metric
          label="Meetings scheduled"
          value={formatNumber(k.meetings)}
          href="/platform/growth/schools?stage=MEETING_SCHEDULED"
        />
        <Metric
          label="Expected ARR"
          value={formatMoney(k.expectedArr)}
          sub={`${formatMoney(k.wonArr)} won ARR`}
        />
      </MetricRow>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi href="/platform/growth/today" label="Meetings today" value={k.meetingsToday} />
        <Kpi href="/platform/growth/today" label="Open tasks" value={k.tasksOpen} warn={k.tasksOpen > 0} />
        <Kpi href="/platform/growth/templates" label="Messages sent" value={k.messagesSent} />
        <Kpi href="/platform/growth/schools?noNextAction=on" label="No next action" value={k.noNext} warn={k.noNext > 0} />
        <Kpi href={`/platform/growth/schools?stale=on`} label={`${STALE_DAYS}+ days silent`} value={k.stale} warn={k.stale > 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Needs attention today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 py-3">
            <AttentionLine count={k.followUpsOverdue} label="follow-ups overdue" href="/platform/growth?focus=overdue" tone="danger" />
            <AttentionLine count={k.followUpsToday} label="follow-ups due today" href="/platform/growth?focus=today" />
            <AttentionLine count={k.noNext} label="live opportunities with no next action" href="/platform/growth/schools?noNextAction=on" tone="warning" />
            <AttentionLine count={k.stale} label={`prospects quiet for ${STALE_DAYS}+ days`} href="/platform/growth/schools?stale=on" tone="warning" />
            <AttentionLine count={k.meetingsToday} label="meetings remaining today" href="/platform/growth/today" />
            <AttentionLine count={k.proposalSent} label="proposals waiting" href="/platform/growth/schools?stage=PROPOSAL_SENT" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <ul className="divide-y divide-[var(--border)]">
              {stats.funnel.map((row) => (
                <li key={row.stage} className="flex items-center justify-between py-2">
                  <Link href={`/platform/growth/schools?stage=${row.stage}`} className="text-sm text-ink hover:underline">
                    {row.label}
                  </Link>
                  <span className="text-sm tnum text-ink-muted">{formatNumber(row.count)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FollowUpCard title="Overdue" rows={overdue} canEdit={canEdit} empty="Nothing overdue." />
        <FollowUpCard title="Due today" rows={today} canEdit={canEdit} empty="No follow-ups due today." />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Recently updated</CardTitle>
          <Link href="/platform/growth/schools" className="text-sm text-[var(--brand-600)] hover:underline">
            All schools
          </Link>
        </CardHeader>
        {recent.rows.length === 0 ? (
          <EmptyState
            title="No prospects yet"
            description="Add the first school the team is talking to."
            action={
              canCreate ? (
                <Link href="/platform/growth/schools/new" className={buttonVariants({ size: 'sm' })}>
                  Add school
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {recent.rows.map((school) => (
              <li key={school.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <Link href={`/platform/growth/schools/${school.id}`} className="text-sm font-medium text-ink hover:underline">
                    {school.name}
                  </Link>
                  <p className="text-xs text-ink-subtle">
                    {[school.city, school.owner ? `${school.owner.firstName} ${school.owner.lastName}` : 'Unassigned']
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Badge tone={school.stage === 'WON' ? 'success' : school.stage === 'LOST' ? 'danger' : 'neutral'}>
                  {STAGE_LABELS[school.stage as CrmStage]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Kpi({ href, label, value, warn }: { href: string; label: string; value: number; warn?: boolean }) {
  return (
    <Link
      href={href}
      className="rounded-[var(--radius)] border border-line bg-surface px-4 py-3 hover:border-[var(--brand-500)]"
    >
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tnum ${warn ? 'text-[var(--danger)]' : 'text-ink'}`}>
        {formatNumber(value)}
      </p>
    </Link>
  )
}

function AttentionLine({
  count,
  label,
  href,
  tone,
}: {
  count: number
  label: string
  href: string
  tone?: 'danger' | 'warning'
}) {
  return (
    <Link href={href} className="flex items-baseline justify-between gap-3 text-sm hover:underline">
      <span className={tone === 'danger' ? 'text-[var(--danger)]' : tone === 'warning' ? 'text-warning' : 'text-ink'}>
        <span className="tnum font-medium">{formatNumber(count)}</span> {label}
      </span>
    </Link>
  )
}

function FollowUpCard({
  title,
  rows,
  canEdit,
  empty,
}: {
  title: string
  rows: Awaited<ReturnType<typeof listFollowUps>>
  canEdit: boolean
  empty: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="py-1">
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-ink-muted">{empty}</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {rows.slice(0, 8).map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link
                    href={`/platform/growth/schools/${row.school.id}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {row.school.name}
                  </Link>
                  <p className="text-xs text-ink-subtle">
                    {format(row.dueAt, 'd MMM, HH:mm')} · {row.type.replaceAll('_', ' ').toLowerCase()}
                    {row.note ? ` · ${row.note}` : ''}
                  </p>
                  {row.contact?.mobile ? (
                    <div className="mt-1 flex gap-3 text-xs">
                      <a href={`tel:${row.contact.mobile}`} className="text-[var(--brand-600)]">
                        Call
                      </a>
                      <a
                        href={`https://wa.me/${row.contact.mobile.replace(/[^\d]/g, '')}`}
                        className="text-[var(--brand-600)]"
                      >
                        WhatsApp
                      </a>
                    </div>
                  ) : null}
                </div>
                {canEdit ? (
                  <form action={completeFollowUpAction.bind(null, row.id, row.school.id)}>
                    <button type="submit" className="min-h-9 text-xs font-medium text-[var(--brand-600)] hover:underline">
                      Done
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
