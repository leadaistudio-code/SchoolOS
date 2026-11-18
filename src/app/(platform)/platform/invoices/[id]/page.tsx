import Link from 'next/link'
import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { getCommercialInvoice } from '@/server/modules/platform/commercial-invoices'
import { payCommercialInvoiceAction, voidCommercialInvoiceAction } from '../actions'

export const metadata = { title: 'Invoice · Platform' }

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PAID: 'success',
  DUE: 'warning',
  DRAFT: 'neutral',
  VOID: 'neutral',
}

export default async function CommercialInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requirePlatformContext('platform.billing')
  const { id } = await params
  const inv = await getCommercialInvoice(ctx, id)
  const schoolName = inv.tenant.school?.name ?? inv.tenant.name

  return (
    <div className="space-y-4">
      <PageHeader
        title={inv.number}
        description={`${schoolName} · ${inv.template.name}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/v1/platform/commercial-invoices/${inv.id}/print`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Download / print
            </a>
            <Link href="/platform/invoices" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              All invoices
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TONE[inv.status] ?? 'neutral'}>{inv.status}</Badge>
        {inv.autoMonthly ? <Badge tone="neutral">Monthly auto</Badge> : null}
        <span className="text-sm text-ink-muted">
          Issued {format(inv.issueDate, 'd MMM yyyy')} · Due {format(inv.dueAt, 'd MMM yyyy')}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>#</TH>
                    <TH>Description</TH>
                    <TH align="right">Qty</TH>
                    <TH align="right">Amount</TH>
                  </tr>
                </THead>
                <TBody>
                  {inv.lines.map((l, i) => (
                    <TR key={l.id}>
                      <TD>{i + 1}</TD>
                      <TD>
                        <div className="font-medium">{l.title}</div>
                        {l.description ? <div className="text-xs text-ink-muted">{l.description}</div> : null}
                      </TD>
                      <TD align="right">{l.qty}</TD>
                      <TD align="right">{formatMoney(l.amountMinor * l.qty, inv.currency)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Totals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">Subtotal</span>
                <span className="font-medium">{formatMoney(inv.subtotalMinor, inv.currency)}</span>
              </div>
              {inv.advanceMinor > 0 ? (
                <div className="flex justify-between text-ink-muted">
                  <span>Advance</span>
                  <span>− {formatMoney(inv.advanceMinor, inv.currency)}</span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <span>Balance</span>
                <span>{formatMoney(inv.balanceMinor, inv.currency)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bill to</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{inv.billToName}</p>
              {inv.billToAttn ? <p className="text-ink-muted">Attn: {inv.billToAttn}</p> : null}
              {inv.billToAddress ? (
                <p className="whitespace-pre-line text-ink-muted">{inv.billToAddress}</p>
              ) : null}
              {inv.billToEmail ? <p className="text-ink-muted">{inv.billToEmail}</p> : null}
              {inv.notes ? (
                <p className="mt-3 whitespace-pre-line border-t border-line pt-3 text-ink-muted">{inv.notes}</p>
              ) : null}
            </CardContent>
          </Card>

          {inv.status === 'DUE' || inv.status === 'DRAFT' ? (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <form action={payCommercialInvoiceAction.bind(null, inv.id)} className="space-y-2">
                  <Input name="paymentRef" placeholder="Payment ref (optional)" defaultValue={inv.paymentRef ?? ''} />
                  <Button type="submit" className="w-full">
                    Mark paid
                  </Button>
                </form>
                <form action={voidCommercialInvoiceAction.bind(null, inv.id)}>
                  <Button type="submit" variant="secondary" className="w-full">
                    Void invoice
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}
