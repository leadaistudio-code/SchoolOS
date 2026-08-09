import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listFeeHeads, listStructures } from '@/server/modules/finance/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney } from '@/lib/utils'

export const metadata = { title: 'Fee structure' }

export default async function StructuresPage() {
  const ctx = await requireContext('fees.view')
  const [structures, heads] = await Promise.all([listStructures(ctx), listFeeHeads(ctx)])
  const currency = ctx.tenant.currency

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fee structure"
        description="What each class is billed, and the heads those amounts are made of."
        actions={
          ctx.can('fees.invoice') ? (
            <Link
              href="/finance/invoices"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Generate invoices
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <div className="space-y-3">
          {structures.length === 0 ? (
            <Card>
              <EmptyState
                title="No fee structures yet"
                description="A structure groups fee heads and their amounts for a class, and is what invoices are generated from."
              />
            </Card>
          ) : (
            structures.map((s) => (
              <Card key={s.id} className="overflow-hidden">
                <CardHeader>
                  <div>
                    <CardTitle>{s.name}</CardTitle>
                    <p className="text-[12.5px] text-ink-muted mt-0.5">
                      {s.className} · {s.invoiceCount} invoices generated
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.isActive ? <Badge tone="success">active</Badge> : <Badge>inactive</Badge>}
                    <span className="text-[15px] font-bold text-ink tnum">
                      {formatMoney(s.totalMinor, currency)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <TableWrap>
                    <Table>
                      <THead>
                        <tr>
                          <TH>Fee head</TH>
                          <TH>Code</TH>
                          <TH align="right">Amount</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {s.items.map((item) => (
                          <TR key={item.id}>
                            <TD className="text-[13px] text-ink">{item.label}</TD>
                            <TD className="text-[12.5px] tnum">{item.code}</TD>
                            <TD align="right" className="text-[13px] font-medium text-ink">
                              {formatMoney(item.amountMinor, currency)}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableWrap>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Fee heads</CardTitle>
              <p className="text-[12.5px] text-ink-muted mt-0.5">
                The building blocks every structure draws on
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {heads.length === 0 ? (
              <EmptyState title="No fee heads" description="Add heads such as Tuition or Transport." />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {heads.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] text-ink truncate">{h.name}</p>
                      <p className="text-[11.5px] text-ink-subtle">
                        {h.code} · {h.frequency.toLowerCase().replace('_', ' ')}
                        {h.isDeposit ? ' · refundable deposit' : ''}
                      </p>
                    </div>
                    <Badge tone={h._count.items > 0 ? 'brand' : 'neutral'}>
                      {h._count.items} in use
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
