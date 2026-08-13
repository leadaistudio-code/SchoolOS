import Link from 'next/link'
import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { listTenants } from '@/server/modules/platform/tenants'
import { provisionSchoolAction } from '../actions'

export const metadata = { title: 'Schools · Platform' }

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  ACTIVE: 'success',
  TRIAL: 'info',
  PAST_DUE: 'warning',
  SUSPENDED: 'danger',
  ARCHIVED: 'neutral',
}

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; error?: string }>
}) {
  const ctx = await requirePlatformContext('platform.tenants')
  const sp = await searchParams
  const { rows: tenants } = await listTenants(ctx, {
    q: sp.q,
    status: sp.status,
    page: 1,
    pageSize: 100,
  })

  const plans = await ctx.db.plan.findMany({ orderBy: { sortOrder: 'asc' } })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Schools"
        description="Provision, suspend and manage tenant schools."
        actions={
          <Link href="/platform" className="text-sm text-[var(--brand-600)] hover:underline">
            Back to overview
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row flex-wrap items-end gap-3 justify-between">
            <CardTitle>All schools</CardTitle>
            <form className="flex flex-wrap gap-2" method="get">
              <Input name="q" placeholder="Search…" defaultValue={sp.q ?? ''} className="w-40" />
              <select
                name="status"
                defaultValue={sp.status ?? ''}
                className="h-9 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm"
              >
                <option value="">All statuses</option>
                {['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'ARCHIVED'].map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary" size="sm">
                Filter
              </Button>
            </form>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {tenants.length === 0 ? (
              <EmptyState title="No schools match" description="Try a different filter or provision one." />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>School</TH>
                      <TH>Plan</TH>
                      <TH>Status</TH>
                      <TH>Created</TH>
                      <TH align="right"> </TH>
                    </tr>
                  </THead>
                  <TBody>
                    {tenants.map((t) => (
                      <TR key={t.id}>
                        <TD>
                          <span className="block text-sm text-ink">{t.school?.name ?? t.name}</span>
                          <span className="text-xs text-ink-subtle">{t.slug}</span>
                        </TD>
                        <TD className="text-sm text-ink-muted">
                          {t.subscription?.plan.name ?? '—'}
                        </TD>
                        <TD>
                          <Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>
                            {t.status.toLowerCase().replace('_', ' ')}
                          </Badge>
                        </TD>
                        <TD className="text-sm text-ink-muted">
                          {format(t.createdAt, 'd MMM yyyy')}
                        </TD>
                        <TD align="right">
                          <Link
                            href={`/platform/tenants/${t.id}`}
                            className="text-sm text-[var(--brand-600)] hover:underline"
                          >
                            Open
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

        <Card>
          <CardHeader>
            <CardTitle>Provision school</CardTitle>
          </CardHeader>
          <CardContent>
            {sp.error ? (
              <p className="mb-3 rounded-[var(--radius-sm)] border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
                {sp.error}
              </p>
            ) : null}
            <form action={provisionSchoolAction} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-ink-muted">Slug (subdomain)</span>
                <Input name="slug" required placeholder="st-johns or St John's" />
                <span className="text-xs text-ink-subtle">
                  Spaces and capitals are converted automatically (e.g. &quot;St Johns&quot; → st-johns).
                </span>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-ink-muted">School name</span>
                <Input name="schoolName" required />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-ink-muted">Admin email</span>
                <Input name="adminEmail" type="email" required />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-ink-muted">Admin password</span>
                <Input name="adminPassword" type="password" required minLength={10} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-ink-muted">Plan</span>
                <select
                  name="planId"
                  required
                  className="w-full h-9 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="trial" defaultChecked />
                Start on trial
              </label>
              <Button type="submit" className="w-full">
                Create school
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
