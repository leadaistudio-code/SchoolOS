import Link from 'next/link'
import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, humanizeStatus } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { formatMoney, formatNumber } from '@/lib/utils'

export const metadata = { title: 'Platform console' }

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  ACTIVE: 'success',
  TRIAL: 'info',
  PAST_DUE: 'warning',
  SUSPENDED: 'danger',
  ARCHIVED: 'neutral',
}

/**
 * SaaS control plane.
 *
 * Runs on the platform context, which uses the unscoped client on purpose:
 * this is the one place that is meant to see across tenants, and it is
 * reachable only by a user with isSuperAdmin.
 */
export default async function PlatformDashboard() {
  const ctx = await requirePlatformContext('platform.tenants')
  const db = ctx.db

  const [tenants, totals, plans, recentTickets] = await Promise.all([
    db.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        school: { select: { name: true, city: true } },
        subscription: { include: { plan: true } },
        _count: { select: { domains: true } },
      },
    }),
    Promise.all([
      db.student.count({ where: { deletedAt: null } }),
      db.user.count({ where: { deletedAt: null } }),
      db.staff.count({ where: { deletedAt: null } }),
      db.feePayment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amountMinor: true } }),
    ]),
    db.plan.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { subscriptions: true } } } }),
    db.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { tenant: { select: { name: true } } },
    }),
  ])

  const [studentTotal, userTotal, staffTotal, processed] = totals

  const studentsByTenant = await db.student.groupBy({
    by: ['tenantId'],
    where: { deletedAt: null },
    _count: { _all: true },
  })
  const studentCountFor = new Map(studentsByTenant.map((r) => [r.tenantId, r._count._all]))

  const activeCount = tenants.filter((t) => t.status === 'ACTIVE').length
  const trialCount = tenants.filter((t) => t.status === 'TRIAL').length

  // Annualised run rate from live subscriptions, normalised to a yearly figure.
  const arrMinor = tenants.reduce((sum, t) => {
    const sub = t.subscription
    if (!sub || (t.status !== 'ACTIVE' && t.status !== 'PAST_DUE')) return sum
    const multiplier = sub.cycle === 'MONTHLY' ? 12 : sub.cycle === 'QUARTERLY' ? 4 : 1
    return sum + sub.plan.priceMinor * multiplier
  }, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Platform console"
        description={`${tenants.length} tenants · ${activeCount} active`}
      />

      <MetricRow>
        <Metric
          label="Schools"
          value={formatNumber(tenants.length)}
          sub={`${activeCount} active · ${trialCount} on trial`}
        />
        <Metric
          label="Students"
          value={formatNumber(studentTotal)}
          sub={`${formatNumber(staffTotal)} staff records`}
        />
        <Metric label="User accounts" value={formatNumber(userTotal)} sub="Across all tenants" />
        <Metric
          label="Annual run rate"
          value={formatMoney(arrMinor)}
          sub={`${formatMoney(processed._sum.amountMinor ?? 0)} fees processed`}
        />
      </MetricRow>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Schools</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {tenants.length === 0 ? (
            <EmptyState title="No schools yet" description="Create the first tenant to get started." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>School</TH>
                    <TH>Plan</TH>
                    <TH align="right">Students</TH>
                    <TH>Renews</TH>
                    <TH>Status</TH>
                    <TH align="right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {tenants.map((t) => (
                    <TR key={t.id}>
                      <TD>
                        <span className="block text-sm text-ink">
                          {t.school?.name ?? t.name}
                        </span>
                        <span className="block text-xs text-ink-subtle">
                          {t.slug}
                          {t.school?.city ? ` · ${t.school.city}` : ''}
                        </span>
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {t.subscription?.plan.name ?? 'No plan'}
                      </TD>
                      <TD align="right" className="text-sm">
                        {formatNumber(studentCountFor.get(t.id) ?? 0)}
                      </TD>
                      <TD className="text-sm text-ink-muted">
                        {t.subscription ? format(t.subscription.currentEnd, 'd MMM yyyy') : '-'}
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>
                          {t.status.toLowerCase().replace('_', ' ')}
                        </Badge>
                      </TD>
                      <TD align="right">
                        <Link
                          href={`/platform/tenants/${t.id}`}
                          className="text-sm text-[var(--brand-600)] hover:underline"
                        >
                          Manage
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plans</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            <ul className="divide-y divide-[var(--border)]">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p className="text-sm text-ink">{p.name}</p>
                    <p className="text-xs text-ink-subtle">
                      {p._count.subscriptions} school{p._count.subscriptions === 1 ? '' : 's'} ·{' '}
                      {p.trialDays}-day trial
                    </p>
                  </div>
                  <span className="text-base font-medium tnum text-ink">
                    {formatMoney(p.priceMinor, p.currency)}
                    <span className="text-xs text-ink-subtle">/{p.cycle.toLowerCase()}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Support tickets</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            {recentTickets.length === 0 ? (
              <EmptyState
                title="No open tickets"
                description="Tickets raised by schools will appear here."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {recentTickets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{t.subject}</p>
                      <p className="text-xs text-ink-subtle">{t.tenant.name}</p>
                    </div>
                    <Badge tone={t.status === 'OPEN' ? 'warning' : 'neutral'}>
                      {humanizeStatus(t.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
