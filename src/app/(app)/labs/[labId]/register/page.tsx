import Link from 'next/link'
import { requireLabs } from '@/server/modules/labs/access'
import { getLab } from '@/server/modules/labs/service'
import { registerRows, type RegisterFilter } from '@/server/modules/labs/stock'
import { HAZARDS, ITEM_CATEGORIES, labelOf } from '@/lib/labs/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableToolbar, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { AddItemForm, MovementForm } from '../../forms'

export const metadata = { title: 'Lab register' }

const FILTERS: { value: RegisterFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'shortfall', label: 'Short of requirement' },
  { value: 'low', label: 'Low stock' },
  { value: 'expiry', label: 'Expired / expiring' },
  { value: 'chemicals', label: 'Chemicals & hazards' },
  { value: 'consumables', label: 'Consumables' },
  { value: 'non-consumables', label: 'Non-consumables' },
]

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''))

export default async function LabRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ labId: string }>
  searchParams: Promise<{ filter?: string }>
}) {
  const { labId } = await params
  const { filter: rawFilter } = await searchParams
  const filter = (FILTERS.find((f) => f.value === rawFilter)?.value ?? 'all') as RegisterFilter
  const ctx = await requireLabs()
  const lab = await getLab(ctx, labId)
  const [rows, all] = await Promise.all([registerRows(ctx, labId, filter), registerRows(ctx, labId)])
  const canStock = ctx.can('labs.stock')
  const shortCount = all.filter((r) => r.shortfall > 0).length

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card variant="elevated" className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            Item register · {all.length} items · {shortCount} below requirement
          </CardTitle>
        </CardHeader>
        <TableToolbar>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.value}
                href={f.value === 'all' ? `/labs/${lab.id}/register` : `/labs/${lab.id}/register?filter=${f.value}`}
                className={cn(buttonVariants({ variant: f.value === filter ? 'subtle' : 'ghost', size: 'sm' }))}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <div className="ml-auto flex gap-1.5">
            <a href={`/api/v1/labs/${lab.id}/register/export?format=xlsx&filter=${filter}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Excel
            </a>
            <a href={`/api/v1/labs/${lab.id}/register/export?format=csv&filter=${filter}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              CSV
            </a>
            <Link href={`/labs/${lab.id}/print/register`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Print
            </Link>
          </div>
        </TableToolbar>
        {rows.length === 0 ? (
          <CardContent className="pt-4">
            <EmptyState title="Nothing here" description={filter === 'all' ? 'Add items to the register.' : 'No items match this filter.'} />
          </CardContent>
        ) : (
          <TableWrap sticky>
            <Table>
              <THead sticky>
                <tr>
                  <TH>Item</TH>
                  <TH>Category</TH>
                  <TH align="right">In stock</TH>
                  <TH align="right">Required</TH>
                  <TH align="right">Short</TH>
                  <TH>Expiry</TH>
                  <TH>Location</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="text-ink">
                      <Link href={`/labs/${lab.id}/register/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {r.kind === 'CONSUMABLE' ? <Badge tone="neutral">Consumable</Badge> : null}
                        {r.hazards.map((h) => (
                          <Badge key={h} tone="danger">
                            {labelOf(HAZARDS, h)}
                          </Badge>
                        ))}
                        {r.low ? <Badge tone="warning">Low</Badge> : null}
                        {r.msdsKey ? <Badge tone="info">MSDS</Badge> : null}
                      </div>
                    </TD>
                    <TD>{labelOf(ITEM_CATEGORIES, r.category)}</TD>
                    <TD align="right" className="text-ink">
                      {qty(r.quantity)} {r.unit}
                    </TD>
                    <TD align="right">{r.requiredQty > 0 ? `${qty(r.requiredQty)} ${r.unit}` : '—'}</TD>
                    <TD align="right" className={r.shortfall > 0 ? 'font-semibold text-[var(--danger)]' : ''}>
                      {r.shortfall > 0 ? qty(r.shortfall) : '—'}
                    </TD>
                    <TD>
                      {r.expiresOn ? (
                        <span className={r.expired ? 'font-semibold text-[var(--danger)]' : r.expiring ? 'text-warning' : ''}>
                          {r.expiresOn.toISOString().slice(0, 10)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD>{r.storageLocation ?? '—'}</TD>
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
              <MovementForm labId={lab.id} items={all.map((r) => ({ id: r.id, label: `${r.name} (${qty(r.quantity)} ${r.unit})` }))} />
            </CardContent>
          </Card>
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>Add an item</CardTitle>
            </CardHeader>
            <CardContent>
              <AddItemForm labId={lab.id} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
