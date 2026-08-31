import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getClassTree } from '@/server/modules/academics/service'
import { listFeeHeads, listStructures } from '@/server/modules/finance/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney } from '@/lib/utils'
import { EditFeeHeadButton, EditStructureButton, NewFeeHeadButton, NewStructureButton } from './structure-forms'

export const metadata = { title: 'Fee structure' }

export default async function StructuresPage() {
  const ctx = await requireContext('fees.view')
  const canStructure = ctx.can('fees.structure')

  const [structures, heads, classes] = await Promise.all([
    listStructures(ctx),
    listFeeHeads(ctx),
    canStructure ? getClassTree(ctx) : Promise.resolve([]),
  ])

  const currency = ctx.tenant.currency
  const classOptions = classes.map((c) => ({ id: c.id, label: c.name }))
  const feeHeadOptions = heads.map((h) => ({
    id: h.id,
    code: h.code,
    name: h.name,
    frequency: h.frequency,
  }))
  const feeHeadDrafts = heads.map((h) => ({
    id: h.id,
    code: h.code,
    name: h.name,
    frequency: h.frequency,
    isRefundable: h.isRefundable,
    isDeposit: h.isDeposit,
    inUseCount: h._count.items,
  }))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fee structure"
        description={`${structures.length} structures · ${heads.length} fee heads`}
        actions={
          <>
            {canStructure ? (
              <>
                <NewFeeHeadButton />
                <NewStructureButton feeHeads={feeHeadOptions} classes={classOptions} />
              </>
            ) : null}
            {ctx.can('fees.invoice') ? (
              <Link
                href="/finance/invoices"
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Generate invoices
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        <div className="space-y-3">
          {structures.length === 0 ? (
            <Card>
              <EmptyState
                title="No fee structures yet"
                description="Create fee heads first, then build a structure with amounts for each class. Invoices are generated from structures."
                action={
                  canStructure ? (
                    <div className="flex flex-wrap justify-center gap-2">
                      <NewFeeHeadButton label="Add fee head" />
                      <NewStructureButton
                        feeHeads={feeHeadOptions}
                        classes={classOptions}
                        label="Add structure"
                      />
                    </div>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            structures.map((s) => (
              <Card key={s.id} className="overflow-hidden">
                <CardHeader>
                  <div>
                    <CardTitle>{s.name}</CardTitle>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {s.className} · {s.invoiceCount} invoices generated
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canStructure ? (
                      <EditStructureButton
                        structure={{
                          id: s.id,
                          name: s.name,
                          classLevelId: s.classLevelId,
                          description: s.description,
                          invoiceCount: s.invoiceCount,
                          items: s.items.map((item) => ({
                            feeHeadId: item.feeHeadId,
                            amountMinor: item.amountMinor,
                            dueOn: item.dueOn,
                          })),
                        }}
                        feeHeads={feeHeadOptions}
                        classes={classOptions}
                      />
                    ) : null}
                    {s.isActive ? <Badge tone="success">active</Badge> : <Badge>inactive</Badge>}
                    <span className="text-lg font-semibold text-ink tnum">
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
                            <TD className="text-sm text-ink">{item.label}</TD>
                            <TD className="text-xs tnum">{item.code}</TD>
                            <TD align="right" className="text-sm font-medium text-ink">
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
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>Fee heads</CardTitle>
                <p className="text-xs text-ink-muted mt-0.5">
                  The building blocks every structure draws on
                </p>
              </div>
              {canStructure ? <NewFeeHeadButton label="Add" /> : null}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {heads.length === 0 ? (
              <EmptyState
                title="No fee heads"
                description="Add heads such as Tuition, Transport or Exam fee."
                action={canStructure ? <NewFeeHeadButton label="Add the first fee head" /> : undefined}
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {heads.map((h) => {
                  const draft = feeHeadDrafts.find((d) => d.id === h.id)!
                  return (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{h.name}</p>
                      <p className="text-xs text-ink-subtle">
                        {h.code} · {h.frequency.toLowerCase().replace('_', ' ')}
                        {h.isDeposit ? ' · deposit' : ''}
                        {h.isRefundable ? ' · refundable' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone={h._count.items > 0 ? 'brand' : 'neutral'}>
                        {h._count.items} in use
                      </Badge>
                      {canStructure ? <EditFeeHeadButton head={draft} /> : null}
                    </div>
                  </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
