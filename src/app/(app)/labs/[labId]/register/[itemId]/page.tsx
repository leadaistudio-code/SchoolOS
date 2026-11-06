import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireLabs } from '@/server/modules/labs/access'
import { getLab } from '@/server/modules/labs/service'
import { listMovements, studentNames } from '@/server/modules/labs/stock'
import { labelOf, MOVEMENT_TYPES } from '@/lib/labs/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney } from '@/lib/utils'
import { EditItemForm, MovementForm } from '../../../forms'

export const metadata = { title: 'Lab item' }

export default async function LabItemPage({ params }: { params: Promise<{ labId: string; itemId: string }> }) {
  const { labId, itemId } = await params
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const item = await ctx.db.labItem.findFirst({ where: { id: itemId, labId, deletedAt: null } })
  if (!item) notFound()
  const movements = await listMovements(ctx, labId, { itemId })
  const names = await studentNames(ctx, movements.map((m) => m.studentId ?? ''))
  const canStock = ctx.can('labs.stock')

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card variant="elevated" className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            {item.name} · {item.quantity} {item.unit} in stock
          </CardTitle>
          <p className="text-sm text-ink-muted">
            <Link href={`/labs/${lab.id}/register`} className="hover:underline">
              ← Register
            </Link>
            {item.msdsKey ? (
              <>
                {' · '}
                <a href={`/api/v1/files/${encodeURIComponent(item.msdsKey)}`} className="underline">
                  Safety data sheet
                </a>
              </>
            ) : null}
          </p>
        </CardHeader>
        {movements.length === 0 ? (
          <CardContent>
            <EmptyState title="No stock entries yet" />
          </CardContent>
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
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
                    <TD className="text-ink">{labelOf(MOVEMENT_TYPES, m.type)}</TD>
                    <TD align="right" className={m.quantity < 0 ? 'text-[var(--danger)]' : 'text-success'}>
                      {m.quantity > 0 ? '+' : ''}
                      {m.quantity}
                    </TD>
                    <TD align="right">{m.balanceAfter}</TD>
                    <TD>
                      {[
                        m.vendorName,
                        m.invoiceNo ? `Bill ${m.invoiceNo}` : null,
                        m.studentId ? names.get(m.studentId) : null,
                        m.chargeMinor ? `recover ${formatMoney(m.chargeMinor)}` : null,
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

      {canStock ? (
        <div className="space-y-4">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>Stock entry</CardTitle>
            </CardHeader>
            <CardContent>
              <MovementForm labId={lab.id} items={[{ id: item.id, label: item.name }]} defaultItemId={item.id} />
            </CardContent>
          </Card>
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>Edit item</CardTitle>
            </CardHeader>
            <CardContent>
              <EditItemForm
                labId={lab.id}
                item={{
                  id: item.id,
                  name: item.name,
                  category: item.category,
                  kind: item.kind,
                  unit: item.unit,
                  requiredQty: item.requiredQty,
                  reorderLevel: item.reorderLevel,
                  storageLocation: item.storageLocation,
                  hazards: item.hazards,
                  expiresOn: item.expiresOn ? item.expiresOn.toISOString().slice(0, 10) : null,
                  unitCostMinor: item.unitCostMinor,
                  notes: item.notes,
                }}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
