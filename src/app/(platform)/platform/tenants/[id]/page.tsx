import Link from 'next/link'
import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney, formatNumber } from '@/lib/utils'
import { FEATURE } from '@/lib/features'
import { getTenant } from '@/server/modules/platform/tenants'
import {
  archiveTenantAction,
  changeTenantPlanAction,
  impersonateAction,
  reactivateTenantAction,
  setOverrideAction,
  suspendTenantAction,
} from '../../actions'

export const metadata = { title: 'School detail · Platform' }

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requirePlatformContext('platform.tenants')
  const { tenant, usage, users } = await getTenant(ctx, id)
  const plans = await ctx.db.plan.findMany({ orderBy: { sortOrder: 'asc' } })

  const limitKeys = Object.entries(FEATURE).filter(([, v]) => v.startsWith('limit.'))

  return (
    <div className="space-y-4">
      <PageHeader
        title={tenant.school?.name ?? tenant.name}
        description={`${tenant.slug} · ${tenant.status.toLowerCase().replace('_', ' ')}`}
        actions={
          <Link href="/platform/tenants" className="text-sm text-[var(--brand-600)] hover:underline">
            All schools
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {tenant.status !== 'SUSPENDED' ? (
          <form action={suspendTenantAction.bind(null, id)}>
            <Button type="submit" variant="secondary" size="sm">
              Suspend
            </Button>
          </form>
        ) : (
          <form action={reactivateTenantAction.bind(null, id)}>
            <Button type="submit" variant="secondary" size="sm">
              Reactivate
            </Button>
          </form>
        )}
        {tenant.status !== 'ARCHIVED' ? (
          <form action={archiveTenantAction.bind(null, id)}>
            <Button type="submit" variant="secondary" size="sm">
              Archive
            </Button>
          </form>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Plan: <strong>{tenant.subscription?.plan.name ?? 'None'}</strong>
            </p>
            <p className="text-ink-muted">
              Renews {tenant.subscription ? format(tenant.subscription.currentEnd, 'd MMM yyyy') : '—'}
            </p>
            <form action={changeTenantPlanAction.bind(null, id)} className="flex gap-2">
              <select
                name="planId"
                defaultValue={tenant.subscription?.planId}
                className="flex-1 h-9 rounded-[var(--radius-sm)] border border-line bg-surface px-2"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" variant="secondary">
                Change plan
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage vs limits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(usage).map(([key, row]) => (
              <div key={key}>
                <div className="flex justify-between text-sm">
                  <span>{row.label}</span>
                  <span className="tnum text-ink-muted">
                    {formatNumber(row.current)}
                    {row.limit != null ? ` / ${formatNumber(row.limit)}` : ' · unlimited'}
                  </span>
                </div>
                {row.limit != null ? (
                  <div className="h-1.5 mt-1 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full bg-[var(--brand-600)]"
                      style={{ width: `${Math.min(100, (row.current / row.limit) * 100)}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entitlement overrides</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={setOverrideAction.bind(null, id)} className="grid gap-2 sm:grid-cols-4 mb-4">
            <select name="featureKey" className="h-9 rounded-[var(--radius-sm)] border border-line px-2 text-sm">
              {limitKeys.map(([, key]) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
            <Input name="limitValue" type="number" placeholder="Limit" />
            <Input name="note" placeholder="Note" />
            <Button type="submit" size="sm">
              Set override
            </Button>
          </form>
          {tenant.overrides.length === 0 ? (
            <p className="text-sm text-ink-muted">No overrides — plan defaults apply.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {tenant.overrides.map((o) => (
                <li key={o.featureKey} className="py-2 flex justify-between">
                  <span>{o.featureKey}</span>
                  <span className="text-ink-muted">
                    {o.limitValue ?? '—'} {o.note ? `· ${o.note}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Domains</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Host</TH>
                  <TH>Primary</TH>
                  <TH>Verified</TH>
                </tr>
              </THead>
              <TBody>
                {tenant.domains.map((d) => (
                  <TR key={d.id}>
                    <TD>{d.host}</TD>
                    <TD>{d.isPrimary ? 'Yes' : '—'}</TD>
                    <TD>
                      <Badge tone={d.verified ? 'success' : 'warning'}>
                        {d.verified ? 'Verified' : 'Pending'}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Users · impersonate</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Roles</TH>
                  <TH align="right"> </TH>
                </tr>
              </THead>
              <TBody>
                {users.map((u) => (
                  <TR key={u.id}>
                    <TD>
                      {u.firstName} {u.lastName}
                    </TD>
                    <TD className="text-sm text-ink-muted">{u.email}</TD>
                    <TD className="text-xs text-ink-subtle">
                      {u.roles.map((r) => r.name).join(', ')}
                    </TD>
                    <TD align="right">
                      <form action={impersonateAction.bind(null, id, u.id)}>
                        <Button type="submit" size="sm" variant="secondary">
                          Impersonate
                        </Button>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      {tenant.subscription?.invoices.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line text-sm">
              {tenant.subscription.invoices.map((inv) => (
                <li key={inv.id} className="py-2 flex justify-between">
                  <span>{inv.number}</span>
                  <span>
                    {formatMoney(inv.amountMinor, inv.currency)} · {inv.status}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
