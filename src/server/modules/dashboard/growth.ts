import { subMonths, startOfMonth } from 'date-fns'
import type { AppContext } from '@/server/context'

export type GrowthPoint = { label: string; value: number }

export type Growth = {
  /** Running total at the end of each of the last six months. */
  series: GrowthPoint[]
  /** Percentage change over the last full month, or null when unknowable. */
  changePercent: number | null
  addedThisMonth: number
}

type Countable = 'Student' | 'Staff' | 'Parent'

const MONTHS = 6

/**
 * Head-count growth for the KPI cards.
 *
 * The figure on the card is a live count; the sparkline behind it and the
 * comparison under it are reconstructed from when each record was created.
 * That reconstruction is honest but partial — a school that imported its whole
 * roll on one day will show a single step, because that is what happened.
 *
 * When there is no history to compare against, `changePercent` is null and the
 * card shows no delta. It never shows a made-up percentage: a fabricated
 * "+12.5%" on a head teacher's dashboard is worse than no number at all.
 */
export async function headcountGrowth(
  ctx: AppContext,
  model: Countable,
  total: number,
): Promise<Growth> {
  const since = startOfMonth(subMonths(new Date(), MONTHS - 1))

  // The model name is not user input — it is one of three literals in this
  // file — so interpolating it into the table name is safe here, and the
  // tenant id is still a bound parameter.
  const rows = await ctx.db.$queryRawUnsafe<{ month: Date; added: bigint }[]>(
    `SELECT date_trunc('month', "createdAt") AS month, COUNT(*)::bigint AS added
       FROM "${model}"
      WHERE "tenantId" = $1
        AND "deletedAt" IS NULL
        AND "createdAt" >= $2
      GROUP BY 1
      ORDER BY 1 ASC`,
    ctx.tenant.id,
    since,
  )

  const addedByMonth = new Map<string, number>()
  for (const row of rows) addedByMonth.set(monthKey(row.month), Number(row.added))

  const months = Array.from({ length: MONTHS }, (_, i) =>
    startOfMonth(subMonths(new Date(), MONTHS - 1 - i)),
  )

  // Walk backwards from the live total, removing what each month added, to get
  // the closing figure for every month without a second query.
  const closing: number[] = []
  let running = total
  for (let i = months.length - 1; i >= 0; i--) {
    closing[i] = running
    running -= addedByMonth.get(monthKey(months[i]!)) ?? 0
  }

  const series = months.map((month, i) => ({
    label: month.toLocaleDateString('en-IN', { month: 'short' }),
    value: Math.max(0, closing[i] ?? 0),
  }))

  const addedThisMonth = addedByMonth.get(monthKey(months[months.length - 1]!)) ?? 0
  const openingThisMonth = total - addedThisMonth

  return {
    series,
    addedThisMonth,
    changePercent:
      openingThisMonth > 0
        ? Math.round((addedThisMonth / openingThisMonth) * 1000) / 10
        : null,
  }
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`
}
