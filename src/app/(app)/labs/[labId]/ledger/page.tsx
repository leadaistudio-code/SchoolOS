import Link from 'next/link'
import type { LabMovementType } from '@prisma/client'
import { requireLabs } from '@/server/modules/labs/access'
import { getLab } from '@/server/modules/labs/service'
import { listMovements, studentNames } from '@/server/modules/labs/stock'
import { labelOf, MOVEMENT_TYPES } from '@/lib/labs/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Table, TableToolbar, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { formatMoney } from '@/lib/utils'

export const metadata = { title: 'Lab stock ledger' }

export default async function LabLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ labId: string }>
  searchParams: Promise<{ type?: string }>
}) {
  const { labId } = await params
  const { type: rawType } = await searchParams
  const type = MOVEMENT_TYPES.find((t) => t.value === rawType)?.value as LabMovementType | undefined
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const movements = await listMovements(ctx, labId, { type })
  const names = await studentNames(ctx, movements.map((m) => m.studentId ?? ''))

  return (
    <Card variant="elevated" className="overflow-hidden">
      <CardHeader>
        <CardTitle>Stock ledger · latest {movements.length}</CardTitle>
      </CardHeader>
      <TableToolbar>
        <Link href={`/labs/${lab.id}/ledger`} className={buttonVariants({ variant: type ? 'ghost' : 'subtle', size: 'sm' })}>
          All
        </Link>
        {MOVEMENT_TYPES.map((t) => (
          <Link
            key={t.value}
            href={`/labs/${lab.id}/ledger?type=${t.value}`}
            className={buttonVariants({ variant: type === t.value ? 'subtle' : 'ghost', size: 'sm' })}
          >
            {t.label}
          </Link>
        ))}
        <Link href={`/labs/${lab.id}/print/breakage`} className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} ml-auto`}>
          Print breakage register
        </Link>
      </TableToolbar>
      {movements.length === 0 ? (
        <CardContent className="pt-4">
          <EmptyState title="No entries" />
        </CardContent>
      ) : (
        <TableWrap sticky>
          <Table>
            <THead sticky>
              <tr>
                <TH>Date</TH>
                <TH>Item</TH>
                <TH>Entry</TH>
                <TH align="right">Change</TH>
                <TH align="right">Balance</TH>
                <TH>Details</TH>
                <TH>By</TH>
              </tr>
            </THead>
            <TBody>
              {movements.map((m) => (
                <TR key={m.id}>
                  <TD className="whitespace-nowrap">{m.createdAt.toISOString().slice(0, 10)}</TD>
                  <TD className="text-ink">
                    <Link href={`/labs/${lab.id}/register/${m.itemId}`} className="hover:underline">
                      {m.item.name}
                    </Link>
                  </TD>
                  <TD>{labelOf(MOVEMENT_TYPES, m.type)}</TD>
                  <TD align="right" className={m.quantity < 0 ? 'text-[var(--danger)]' : 'text-success'}>
                    {m.quantity > 0 ? '+' : ''}
                    {m.quantity} {m.item.unit}
                  </TD>
                  <TD align="right">{m.balanceAfter}</TD>
                  <TD>
                    {[
                      m.vendorName,
                      m.invoiceNo ? `Bill ${m.invoiceNo}` : null,
                      m.studentId ? names.get(m.studentId) : null,
                      m.chargeMinor ? `recover ${formatMoney(m.chargeMinor)}` : null,
                      m.sessionId ? 'practical session' : null,
                      m.reason,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </TD>
                  <TD>{m.actorLabel ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </Card>
  )
}
