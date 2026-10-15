import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { badRequest } from '@/server/api/response'
import { schoolToday } from '@/lib/periods'

/**
 * Stock Summary, Tally style: per item, opening, inward, outward and closing
 * quantity and value for a period.
 *
 * Valuation is the perpetual weighted average the store already keeps: every
 * movement records the unit cost it moved at (purchase cost in, running
 * average cost out), so a value is the signed sum of quantity × unit cost.
 * No NRV write-down is applied here; one appears only if it is recorded as a
 * stock adjustment.
 */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const stockSummaryQuerySchema = z.object({
  from: isoDay.optional().catch(undefined),
  to: isoDay.optional().catch(undefined),
})

// The store records movement times; days are read in IST, as elsewhere in the store module.
const startOf = (iso: string) => new Date(`${iso}T00:00:00+05:30`)
const endOf = (iso: string) => new Date(`${iso}T23:59:59.999+05:30`)

export type StockSummaryRow = {
  itemId: string
  sku: string
  name: string
  variant: string | null
  unit: string
  openingQty: number
  openingValueMinor: number
  inwardQty: number
  inwardValueMinor: number
  outwardQty: number
  outwardValueMinor: number
  closingQty: number
  closingValueMinor: number
  /** Closing value ÷ closing quantity; 0 when nothing is in stock. */
  closingRateMinor: number
}

type Agg = { itemId: string; oq: bigint | number | null; ov: bigint | number | null; iq: bigint | number | null; iv: bigint | number | null; xq: bigint | number | null; xv: bigint | number | null }

export function stockSummaryRow(item: { id: string; sku: string; name: string; variant: string | null; unit: string }, a: Omit<Agg, 'itemId'> | undefined): StockSummaryRow {
  const n = (v: bigint | number | null | undefined) => Number(v ?? 0)
  const openingQty = n(a?.oq)
  const openingValueMinor = n(a?.ov)
  const inwardQty = n(a?.iq)
  const inwardValueMinor = n(a?.iv)
  const outwardQty = n(a?.xq)
  const outwardValueMinor = n(a?.xv)
  const closingQty = openingQty + inwardQty - outwardQty
  const closingValueMinor = openingValueMinor + inwardValueMinor - outwardValueMinor
  return {
    itemId: item.id, sku: item.sku, name: item.name, variant: item.variant, unit: item.unit,
    openingQty, openingValueMinor, inwardQty, inwardValueMinor, outwardQty, outwardValueMinor, closingQty, closingValueMinor,
    closingRateMinor: closingQty > 0 ? Math.round(closingValueMinor / closingQty) : 0,
  }
}

export async function getStockSummary(ctx: AppContext, raw: Record<string, string | undefined>) {
  ctx.require('store.view')
  const q = stockSummaryQuerySchema.parse(raw)
  const to = q.to ?? schoolToday()
  const from = q.from ?? `${to.slice(0, 8)}01`
  if (from > to) throw badRequest('The start date is after the end date')
  const [items, aggs] = await Promise.all([
    ctx.db.storeItem.findMany({ orderBy: [{ name: 'asc' }, { variant: 'asc' }], select: { id: true, sku: true, name: true, variant: true, unit: true, isActive: true } }),
    ctx.db.$queryRaw<Agg[]>`
      SELECT "itemId",
        SUM(CASE WHEN "createdAt" < ${startOf(from)} THEN "quantity" ELSE 0 END) AS oq,
        SUM(CASE WHEN "createdAt" < ${startOf(from)} THEN "quantity" * "unitCostMinor" ELSE 0 END) AS ov,
        SUM(CASE WHEN "createdAt" >= ${startOf(from)} AND "quantity" > 0 THEN "quantity" ELSE 0 END) AS iq,
        SUM(CASE WHEN "createdAt" >= ${startOf(from)} AND "quantity" > 0 THEN "quantity" * "unitCostMinor" ELSE 0 END) AS iv,
        SUM(CASE WHEN "createdAt" >= ${startOf(from)} AND "quantity" < 0 THEN -"quantity" ELSE 0 END) AS xq,
        SUM(CASE WHEN "createdAt" >= ${startOf(from)} AND "quantity" < 0 THEN -"quantity" * "unitCostMinor" ELSE 0 END) AS xv
      FROM "StockMovement"
      WHERE "tenantId" = ${ctx.tenant.id} AND "createdAt" <= ${endOf(to)}
      GROUP BY "itemId"`,
  ])
  const byItem = new Map(aggs.map((a) => [a.itemId, a]))
  const rows = items
    .map((i) => stockSummaryRow(i, byItem.get(i.id)))
    .filter((r) => r.openingQty || r.inwardQty || r.outwardQty || r.closingQty)
  const sum = (k: keyof StockSummaryRow) => rows.reduce((s, r) => s + (r[k] as number), 0)
  return {
    from,
    to,
    rows,
    totals: {
      openingValueMinor: sum('openingValueMinor'),
      inwardValueMinor: sum('inwardValueMinor'),
      outwardValueMinor: sum('outwardValueMinor'),
      closingValueMinor: sum('closingValueMinor'),
    },
  }
}
