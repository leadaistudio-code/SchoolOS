import Link from 'next/link'
import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { formatMoney } from '@/lib/utils'
import { listCommercialInvoices } from '@/server/modules/platform/commercial-invoices'

export const metadata = { title: 'Invoices · Platform' }

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PAID: 'success',
  DUE: 'warning',
  DRAFT: 'neutral',
  VOID: 'neutral',
}

export default async function CommercialInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tenantId?: string; month?: string; error?: string }>
}) {
  const ctx = await requirePlatformContext('platform.billing')
  const sp = await searchParams
  const [{ rows }, tenants] = await Promise.all([
    listCommercialInvoices(ctx, {
      page: 1,
      pageSize: 50,
      status: sp.status,
      tenantId: sp.tenantId,
      month: sp.month,
    }),
    ctx.db.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoice generator"
        description="Custom commercial invoices tagged to schools. Monthly auto-issue runs only for MONTHLY subscriptions."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/platform/invoices/templates" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Templates
            </Link>
            <Link href="/platform/invoices/new" className={buttonVariants({ size: 'sm' })}>
              New invoice
            </Link>
          </div>
        }
      />

      {sp.error ? (
        <p className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {sp.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap gap-2 items-end" method="get">
            <label className="space-y-1">
              <span className="text-xs text-ink-muted">School</span>
              <select
                name="tenantId"
                defaultValue={sp.tenantId ?? ''}
                className="h-9 min-w-[200px] rounded-[var(--radius-sm)] border border-line px-2 text-sm"
              >
                <option value="">All schools</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.slug})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-ink-muted">Status</span>
              <select
                name="status"
                defaultValue={sp.status ?? ''}
                className="h-9 rounded-[var(--radius-sm)] border border-line px-2 text-sm"
              >
                <option value="">All</option>
                <option value="DUE">Due</option>
                <option value="PAID">Paid</option>
                <option value="DRAFT">Draft</option>
                <option value="VOID">Void</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-ink-muted">Month</span>
              <input
                type="month"
                name="month"
                defaultValue={sp.month ?? ''}
                className="h-9 rounded-[var(--radius-sm)] border border-line px-2 text-sm"
              />
            </label>
            <Button type="submit" variant="secondary" size="sm">
              Apply
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {rows.length === 0 ? (
            <EmptyState
              title="No commercial invoices yet"
              description="Create an invoice and optionally enable monthly auto for MONTHLY schools."
              action={
                <Link href="/platform/invoices/new" className={buttonVariants({ size: 'sm' })}>
                  New invoice
                </Link>
              }
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Number</TH>
                    <TH>School</TH>
                    <TH>Template</TH>
                    <TH align="right">Balance</TH>
                    <TH>Issued</TH>
                    <TH>Status</TH>
                    <TH>Auto</TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((inv) => (
                    <TR key={inv.id}>
                      <TD>
                        <Link href={`/platform/invoices/${inv.id}`} className="font-medium text-brand hover:underline">
                          {inv.number}
                        </Link>
                      </TD>
                      <TD>
                        <div className="font-medium">{inv.tenant.school?.name ?? inv.tenant.name}</div>
                        <div className="text-xs text-ink-muted">{inv.tenant.slug}</div>
                      </TD>
                      <TD>{inv.template.name}</TD>
                      <TD align="right">{formatMoney(inv.balanceMinor, inv.currency)}</TD>
                      <TD>{format(inv.issueDate, 'd MMM yyyy')}</TD>
                      <TD>
                        <Badge tone={TONE[inv.status] ?? 'neutral'}>{inv.status}</Badge>
                      </TD>
                      <TD>{inv.autoMonthly ? 'Monthly' : '—'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
