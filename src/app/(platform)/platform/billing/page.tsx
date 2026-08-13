import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '@/lib/utils'
import { listInvoices } from '@/server/modules/platform/billing'
import { EmptyState } from '@/components/ui/states'
import {
  generateInvoiceAction,
  payInvoiceAction,
  runOverdueAction,
  voidInvoiceAction,
} from '../actions'

export const metadata = { title: 'Billing · Platform' }

const INV_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PAID: 'success',
  DUE: 'warning',
  VOID: 'neutral',
}

export default async function BillingPage() {
  const ctx = await requirePlatformContext('platform.billing')
  const { rows: invoices } = await listInvoices(ctx, { page: 1, pageSize: 50 })
  const tenants = await ctx.db.tenant.findMany({
    where: { status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Billing"
        description="Manual SaaS invoices — generate, mark paid, scan overdue."
        actions={
          <form action={runOverdueAction}>
            <Button type="submit" variant="secondary" size="sm">
              Run overdue scan
            </Button>
          </form>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Generate invoice</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={generateInvoiceAction} className="flex flex-wrap gap-2 items-end">
            <label className="space-y-1">
              <span className="text-xs text-ink-muted">School</span>
              <select
                name="tenantId"
                required
                className="h-9 min-w-[200px] rounded-[var(--radius-sm)] border border-line px-2 text-sm"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.slug})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-ink-muted">Due in days</span>
              <Input name="dueInDays" type="number" defaultValue={14} className="w-24" />
            </label>
            <Input name="notes" placeholder="Notes" className="flex-1 min-w-[160px]" />
            <Button type="submit">Generate</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {invoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Generate an invoice for a school to start manual SaaS billing."
            />
          ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Number</TH>
                  <TH>School</TH>
                  <TH align="right">Amount</TH>
                  <TH>Due</TH>
                  <TH>Status</TH>
                  <TH align="right">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {invoices.map((inv) => (
                  <TR key={inv.id}>
                    <TD className="text-sm">{inv.number}</TD>
                    <TD className="text-sm text-ink-muted">
                      {inv.subscription.tenant.name}
                    </TD>
                    <TD align="right" className="tnum text-sm">
                      {formatMoney(inv.amountMinor, inv.currency)}
                    </TD>
                    <TD className="text-sm text-ink-muted">{format(inv.dueAt, 'd MMM yyyy')}</TD>
                    <TD>
                      <Badge tone={INV_TONE[inv.status] ?? 'neutral'}>{inv.status}</Badge>
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1">
                        {inv.status === 'DUE' ? (
                          <>
                            <form action={payInvoiceAction.bind(null, inv.id)}>
                              <Button type="submit" size="sm" variant="secondary">
                                Mark paid
                              </Button>
                            </form>
                            <form action={voidInvoiceAction.bind(null, inv.id)}>
                              <Button type="submit" size="sm" variant="secondary">
                                Void
                              </Button>
                            </form>
                          </>
                        ) : null}
                      </div>
                    </TD>
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
