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
import { getEntitlements } from '@/server/entitlements'
import { getTenant } from '@/server/modules/platform/tenants'
import {
  archiveTenantAction,
  changeTenantPlanAction,
  enterAsSupportAction,
  impersonateAction,
  reactivateTenantAction,
  setModuleAction,
  setOverrideAction,
  suspendTenantAction,
} from '../../actions'

export const metadata = { title: 'School detail · Platform' }

const MODULE_LABELS: Record<string, string> = {
  [FEATURE.MODULE_TRANSPORT]: 'Transport',
  [FEATURE.MODULE_LIBRARY]: 'Library',
  [FEATURE.MODULE_INVENTORY]: 'Inventory & store',
  [FEATURE.MODULE_SPORTS]: 'Sports',
  [FEATURE.MODULE_EVENTS]: 'Events',
  [FEATURE.MODULE_WEBSITE]: 'School website',
  [FEATURE.MODULE_ADMISSIONS_CRM]: 'Admissions CRM',
  [FEATURE.MODULE_CERTIFICATES]: 'Certificates',
  [FEATURE.MODULE_FRONT_OFFICE]: 'Front office',
  [FEATURE.MODULE_ONLINE_PAYMENTS]: 'Online payments',
  [FEATURE.MODULE_CUSTOM_DOMAIN]: 'Custom domain',
  [FEATURE.MODULE_WHITE_LABEL_APP]: 'White-label app',
  [FEATURE.MODULE_AI_ASSIST]: 'AI assist',
  [FEATURE.MODULE_FEEDBACK]: 'Feedback',
  [FEATURE.MODULE_SCIENCE_LAB]: 'Labs (Science, Robotics & AI)',
}

const ADD_ON_MODULES = new Set<string>([FEATURE.MODULE_SCIENCE_LAB])

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requirePlatformContext('platform.tenants')
  const { tenant, usage, users } = await getTenant(ctx, id)
  const plans = await ctx.db.plan.findMany({ orderBy: { sortOrder: 'asc' } })

  const limitKeys = Object.entries(FEATURE).filter(([, v]) => v.startsWith('limit.'))
  const moduleKeys = Object.values(FEATURE).filter((v) => v.startsWith('module.'))
  const entitlements = await getEntitlements(id)

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
        {ctx.user.permissions.has('platform.impersonate') ? (
          <form action={enterAsSupportAction.bind(null, id)}>
            <Button type="submit" size="sm">
              Enter as Support
            </Button>
          </form>
        ) : null}
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
          <CardTitle>Modules &amp; add-ons</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-line text-sm">
            {moduleKeys.map((key) => {
              const enabled = entitlements[key]?.enabled ?? false
              const override = tenant.overrides.find((o) => o.featureKey === key && o.enabled !== null)
              return (
                <li key={key} className="py-2 flex flex-wrap items-center gap-2">
                  <span className="flex-1 min-w-0">
                    {MODULE_LABELS[key] ?? key}
                    {ADD_ON_MODULES.has(key) ? (
                      <Badge tone="info" className="ml-2">Add-on</Badge>
                    ) : null}
                  </span>
                  <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'On' : 'Off'}</Badge>
                  <span className="text-xs text-ink-muted w-24">{override ? 'Set for this school' : 'From plan'}</span>
                  <form action={setModuleAction.bind(null, id, key, enabled ? 'off' : 'on')}>
                    <Button type="submit" size="sm" variant={enabled ? 'secondary' : 'primary'}>
                      {enabled ? 'Switch off' : 'Switch on'}
                    </Button>
                  </form>
                  {override ? (
                    <form action={setModuleAction.bind(null, id, key, 'plan')}>
                      <Button type="submit" size="sm" variant="ghost">
                        Use plan
                      </Button>
                    </form>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

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
