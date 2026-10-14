import { Prisma, type JournalSourceType } from '@prisma/client'
import { prisma } from '@/server/db/prisma'
import type { AppContext } from '@/server/context'
import { ApiException, conflict, forbidden, notFound } from '@/server/api/response'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { schoolToday } from '@/lib/periods'
import { profitAndLoss } from '@/server/modules/accounts/service'
import { getAccountingFlags } from './service'
import { cashBankAccounts } from './cash-bank'
import { fixedAssetReconciliation } from './fixed-assets-service'
import {
  AGING_BUCKETS,
  CASH_FLOW_GROUPS,
  METRIC_DEFINITIONS,
  OPEN_INVOICE_EXCLUDED,
  agingRange,
  cashFlowBreakdown,
  daysOverdue,
  expenseDistribution,
  firstDay,
  heldOn,
  isMonthKey,
  lastDay,
  monthLabel,
  planRefresh,
  resolvePeriod,
  wdvSeries,
  type AgingBucketKey,
  type AnalyticsPeriod,
  type Drill,
  type RefreshMode,
  type SummaryRow,
} from './analytics'

export const DRILL_PAGE_SIZE = 25

// ------------------------------------------------------------ summary refresh

export type RefreshOutcome = { mode: RefreshMode | 'busy' | 'failed'; monthsRefreshed: number; durationMs: number }

const SUMMARY_INSERT = `
  INSERT INTO "LedgerMonthSummary" ("tenantId", "month", "accountId", "sourceType", "debitMinor", "creditMinor", "lineCount")
  SELECT e."tenantId", date_trunc('month', e."date")::date, l."accountId", e."sourceType",
         COALESCE(SUM(l."debitMinor"), 0), COALESCE(SUM(l."creditMinor"), 0), COUNT(*)::int
  FROM "JournalEntry" e
  JOIN "JournalLine" l ON l."entryId" = e."id" AND l."tenantId" = e."tenantId"
  WHERE e."tenantId" = $1`
const SUMMARY_GROUP = ` GROUP BY e."tenantId", date_trunc('month', e."date")::date, l."accountId", e."sourceType"`

/**
 * Brings LedgerMonthSummary up to date for one school. Only months that
 * received new journal entries are recomputed, each from its journal lines in
 * full, so re-running is always safe. One refresh per school at a time; a
 * second caller does not wait, it reads the summary as it stands.
 */
export async function refreshLedgerSummary(tenantId: string, opts: { force?: boolean } = {}): Promise<RefreshOutcome> {
  const started = Date.now()
  try {
    return await prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRawUnsafe<{ locked: boolean }[]>(
          'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked',
          `${tenantId}:ledger-summary`,
        )
        if (!lock?.locked) return { mode: 'busy' as const, monthsRefreshed: 0, durationMs: Date.now() - started }

        const state = await tx.ledgerSummaryState.findUnique({ where: { tenantId } })
        const newerWhere = { tenantId, ...(state?.watermark ? { createdAt: { gt: state.watermark } } : {}) }
        const count = await tx.journalEntry.count({ where: { tenantId } })
        const newer = await tx.journalEntry.count({ where: newerWhere })
        const newest = (await tx.journalEntry.aggregate({ where: { tenantId }, _max: { createdAt: true } }))._max.createdAt
        const mode = planRefresh(state ? { entryCount: state.entryCount, watermark: state.watermark } : null, { count, newer }, opts.force)

        let monthsRefreshed = 0
        if (mode === 'full') {
          await tx.$executeRawUnsafe('DELETE FROM "LedgerMonthSummary" WHERE "tenantId" = $1', tenantId)
          await tx.$executeRawUnsafe(SUMMARY_INSERT + SUMMARY_GROUP, tenantId)
          const [row] = await tx.$queryRawUnsafe<{ n: number }[]>(
            'SELECT COUNT(DISTINCT "month")::int AS n FROM "LedgerMonthSummary" WHERE "tenantId" = $1',
            tenantId,
          )
          monthsRefreshed = row?.n ?? 0
        } else if (mode === 'incremental') {
          const dates = await tx.journalEntry.findMany({ where: newerWhere, select: { date: true }, distinct: ['date'] })
          const months = [...new Set(dates.map((d) => toDateInput(d.date).slice(0, 7)))].sort()
          for (const month of months) {
            await tx.$executeRawUnsafe('DELETE FROM "LedgerMonthSummary" WHERE "tenantId" = $1 AND "month" = $2::date', tenantId, firstDay(month))
            await tx.$executeRawUnsafe(
              `${SUMMARY_INSERT} AND e."date" >= $2::date AND e."date" <= $3::date${SUMMARY_GROUP}`,
              tenantId,
              firstDay(month),
              lastDay(month),
            )
          }
          monthsRefreshed = months.length
        }

        const durationMs = Date.now() - started
        const now = new Date()
        const data = {
          watermark: mode === 'none' ? (state?.watermark ?? newest) : newest,
          entryCount: count,
          refreshedAt: now,
          ...(mode === 'full' ? { rebuiltAt: now } : {}),
          ...(mode === 'none' ? {} : { monthsRefreshed, durationMs }),
        }
        await tx.ledgerSummaryState.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data })
        return { mode, monthsRefreshed, durationMs }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000, maxWait: 5_000 },
    )
  } catch (err) {
    console.error('[analytics] ledger summary refresh failed', tenantId, err)
    return { mode: 'failed', monthsRefreshed: 0, durationMs: Date.now() - started }
  }
}

export type Freshness = {
  refreshedAt: Date | null
  rebuiltAt: Date | null
  entryCount: number
  outcome: RefreshOutcome
  /** True when this request could not bring the summary up to date. */
  stale: boolean
}

async function freshSummary(ctx: AppContext, force = false): Promise<Freshness> {
  const outcome = await refreshLedgerSummary(ctx.tenant.id, { force })
  const state = await ctx.db.ledgerSummaryState.findFirst()
  return {
    refreshedAt: state?.refreshedAt ?? null,
    rebuiltAt: state?.rebuiltAt ?? null,
    entryCount: state?.entryCount ?? 0,
    outcome,
    stale: outcome.mode === 'busy' || outcome.mode === 'failed',
  }
}

/** Full rebuild on request (accounts.manage). */
export async function rebuildAnalytics(ctx: AppContext) {
  ctx.require('accounts.manage')
  await requireModule(ctx)
  const fresh = await freshSummary(ctx, true)
  if (fresh.outcome.mode === 'busy') throw conflict('A refresh is already running for this school; try again in a moment')
  if (fresh.outcome.mode === 'failed') throw new ApiException(500, 'REFRESH_FAILED', 'The summary could not be rebuilt; the previous figures are unchanged')
  return fresh
}

// ------------------------------------------------------------------ helpers

async function requireModule(ctx: AppContext) {
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.module) throw new ApiException(403, 'FEATURE_DISABLED', 'Accounting analytics are not enabled for this school')
}

const n = (v: bigint | number | null | undefined) => Number(v ?? 0)

async function summaryRows(ctx: AppContext, period: AnalyticsPeriod, accountIds: string[]): Promise<SummaryRow[]> {
  if (!accountIds.length) return []
  const rows = await ctx.db.ledgerMonthSummary.findMany({
    where: { accountId: { in: accountIds }, month: { gte: attendanceDate(period.from), lte: attendanceDate(period.to) } },
  })
  return rows.map((r) => ({
    month: toDateInput(r.month).slice(0, 7),
    accountId: r.accountId,
    sourceType: r.sourceType,
    debitMinor: n(r.debitMinor),
    creditMinor: n(r.creditMinor),
    lineCount: r.lineCount,
  }))
}

async function expenseAccounts(ctx: AppContext) {
  return ctx.db.ledgerAccount.findMany({
    where: { type: 'EXPENSE' },
    select: { id: true, code: true, name: true, expenseNature: true },
    orderBy: { code: 'asc' },
  })
}

/** Opening cash and bank before the period: opening balances plus all earlier movements. */
async function openingCash(ctx: AppContext, period: AnalyticsPeriod, cashIds: string[]) {
  if (!cashIds.length) return 0
  const [accounts, before] = await Promise.all([
    ctx.db.ledgerAccount.findMany({ where: { id: { in: cashIds } }, select: { openingBalanceMinor: true } }),
    ctx.db.ledgerMonthSummary.aggregate({
      where: { accountId: { in: cashIds }, month: { lt: attendanceDate(period.from) } },
      _sum: { debitMinor: true, creditMinor: true },
    }),
  ])
  return accounts.reduce((s, a) => s + a.openingBalanceMinor, 0) + n(before._sum.debitMinor) - n(before._sum.creditMinor)
}

function openInvoiceWhere(bucket: AgingBucketKey | 'overdue' | 'all' | null, today: string): Prisma.FeeInvoiceWhereInput {
  const base: Prisma.FeeInvoiceWhereInput = { balanceMinor: { gt: 0 }, status: { notIn: [...OPEN_INVOICE_EXCLUDED] } }
  if (!bucket || bucket === 'all') return base
  if (bucket === 'overdue') return { ...base, dueOn: { lt: attendanceDate(today) } }
  const r = agingRange(bucket, today)
  return { ...base, dueOn: { ...(r.gte ? { gte: attendanceDate(r.gte) } : {}), ...(r.lte ? { lte: attendanceDate(r.lte) } : {}) } }
}

async function agingSummary(ctx: AppContext, today: string) {
  const buckets = await Promise.all(
    AGING_BUCKETS.map(async (b) => {
      const agg = await ctx.db.feeInvoice.aggregate({ where: openInvoiceWhere(b.key, today), _sum: { balanceMinor: true }, _count: { _all: true } })
      return { key: b.key, label: b.label, range: b.range, inAging: b.inAging, amountMinor: agg._sum.balanceMinor ?? 0, invoices: agg._count._all }
    }),
  )
  const overdueMinor = buckets.filter((b) => b.inAging).reduce((s, b) => s + b.amountMinor, 0)
  const outstandingMinor = buckets.reduce((s, b) => s + b.amountMinor, 0)
  return { asOf: today, buckets, overdueMinor, outstandingMinor }
}

async function wdvData(ctx: AppContext, upTo: string) {
  const day = attendanceDate(upTo)
  const assets = await ctx.db.fixedAsset.findMany({
    where: { status: { not: 'CANCELLED' }, capitalisedOn: { lte: day } },
    select: { id: true, code: true, name: true, costMinor: true, openingAccumulatedMinor: true, capitalisedOn: true, disposedOn: true },
  })
  const lines = assets.length
    ? await ctx.db.depreciationLine.findMany({
        where: { assetId: { in: assets.map((a) => a.id) }, run: { status: 'POSTED', periodEnd: { lte: day } } },
        select: { assetId: true, amountMinor: true, run: { select: { periodEnd: true } } },
      })
    : []
  return {
    assets: assets.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      costMinor: a.costMinor,
      openingAccumulatedMinor: a.openingAccumulatedMinor,
      capitalisedOn: toDateInput(a.capitalisedOn),
      disposedOn: a.disposedOn ? toDateInput(a.disposedOn) : null,
    })),
    lines: lines.map((l) => ({ assetId: l.assetId, amountMinor: l.amountMinor, periodEnd: toDateInput(l.run.periodEnd) })),
  }
}

// ---------------------------------------------------------------- dashboard

export async function getAnalyticsDashboard(ctx: AppContext, raw: { from?: string; to?: string }) {
  ctx.require('accounts.view')
  await requireModule(ctx)
  const today = schoolToday()
  const period = resolvePeriod(raw, today)
  const freshness = await freshSummary(ctx)

  const cash = await cashBankAccounts(ctx.db)
  const cashIds = cash.map((a) => a.id)
  const expenses = await expenseAccounts(ctx)
  const [cashRows, expenseRows, opening] = await Promise.all([
    summaryRows(ctx, period, cashIds),
    summaryRows(ctx, period, expenses.map((a) => a.id)),
    openingCash(ctx, period, cashIds),
  ])
  const flow = cashFlowBreakdown(cashRows, new Set(cashIds), period.months)

  const wdvUpTo = period.to < today ? period.to : today
  const wdvMonths = period.months.filter((m) => firstDay(m) <= wdvUpTo)
  const register = await wdvData(ctx, wdvUpTo)
  const canSeeDues = ctx.can('fees.accounts')

  return {
    period,
    today,
    freshness,
    generatedAt: new Date(),
    cashFlow: { ...flow, openingMinor: opening, closingMinor: opening + flow.netMinor, accounts: cash },
    expenses: expenseDistribution(expenseRows, expenses),
    aging: canSeeDues ? await agingSummary(ctx, today) : null,
    wdv: { points: wdvSeries(register.assets, register.lines, wdvMonths), upTo: wdvUpTo },
  }
}

export type AnalyticsDashboard = Awaited<ReturnType<typeof getAnalyticsDashboard>>

// ---------------------------------------------------------------- drilldown

type Reconciliation = { label: string; summaryMinor: number; recomputedMinor: number; matches: boolean; note?: string }

function reconcile(label: string, summaryMinor: number, recomputedMinor: number, note?: string): Reconciliation {
  return { label, summaryMinor, recomputedMinor, matches: summaryMinor === recomputedMinor, note }
}

export type DrillRow = {
  id: string
  ref: string
  href: string | null
  date: string | null
  description: string
  detail?: string
  figures?: { label: string; minor: number }[]
  amountMinor: number
  debitMinor?: number
  creditMinor?: number
}

export type DrillResult = {
  drill: Drill
  title: string
  /** The figure the chart showed for this selection. */
  valueMinor: number
  valueLabel: string
  definition: (typeof METRIC_DEFINITIONS)[keyof typeof METRIC_DEFINITIONS]
  periodLabel: string
  freshAt: Date | null
  freshNote: string
  rows: DrillRow[]
  total: number
  page: number
  pageSize: number
  reconciliation: Reconciliation[]
}

/**
 * The audit pane behind a chart value: the eligible transactions, paginated,
 * and the value recomputed from them live, beside the figure the chart drew.
 * Access follows the underlying ledger or register, not the dashboard.
 */
export async function getDrilldown(ctx: AppContext, drill: Drill, raw: { from?: string; to?: string }, rawPage?: string): Promise<DrillResult> {
  ctx.require('accounts.view')
  await requireModule(ctx)
  const today = schoolToday()
  const period = resolvePeriod(raw, today)
  const page = Math.max(1, Math.min(10_000, Number(rawPage) || 1))
  const skip = (page - 1) * DRILL_PAGE_SIZE
  const periodLabel = `${period.from} to ${period.to}`
  const state = await ctx.db.ledgerSummaryState.findFirst()

  if (drill.metric === 'cash_flow' || drill.metric === 'expense') {
    const isCash = drill.metric === 'cash_flow'
    const group = isCash ? (CASH_FLOW_GROUPS.find((g) => g.key === drill.key) ?? null) : null
    const month = isCash && isMonthKey(drill.key) ? drill.key : null
    const range = month ? { from: firstDay(month), to: lastDay(month) } : { from: period.from, to: period.to }
    const sources = group ? [...group.sources] : null
    let accountIds: string[]
    let title: string
    if (isCash) {
      accountIds = (await cashBankAccounts(ctx.db)).map((a) => a.id)
      title = group ? `${group.label}: cash and bank movements` : month ? `All cash and bank movements in ${monthLabel(month)}` : 'All cash and bank movements'
    } else if (drill.key === 'all') {
      accountIds = (await expenseAccounts(ctx)).map((a) => a.id)
      title = 'All expense ledgers'
    } else {
      const account = await ctx.db.ledgerAccount.findFirst({ where: { id: drill.key, type: 'EXPENSE' }, select: { id: true, code: true, name: true } })
      if (!account) throw notFound('Expense ledger')
      accountIds = [account.id]
      title = `${account.code} · ${account.name}`
    }
    const where: Prisma.JournalLineWhereInput = {
      accountId: { in: accountIds },
      entry: {
        date: { gte: attendanceDate(range.from), lte: attendanceDate(range.to) },
        ...(sources ? { sourceType: { in: sources } } : {}),
      },
    }
    const [lines, total, live, summary] = await Promise.all([
      ctx.db.journalLine.findMany({
        where,
        select: {
          id: true,
          debitMinor: true,
          creditMinor: true,
          memo: true,
          account: { select: { code: true, name: true } },
          entry: { select: { id: true, number: true, date: true, narration: true, sourceType: true, isReversal: true } },
        },
        orderBy: [{ entry: { date: 'asc' } }, { entry: { number: 'asc' } }, { id: 'asc' }],
        skip,
        take: DRILL_PAGE_SIZE,
      }),
      ctx.db.journalLine.count({ where }),
      ctx.db.journalLine.aggregate({ where, _sum: { debitMinor: true, creditMinor: true } }),
      ctx.db.ledgerMonthSummary.aggregate({
        where: {
          accountId: { in: accountIds },
          month: { gte: attendanceDate(range.from), lte: attendanceDate(range.to) },
          ...(sources ? { sourceType: { in: sources as JournalSourceType[] } } : {}),
        },
        _sum: { debitMinor: true, creditMinor: true },
      }),
    ])
    const liveDr = live._sum.debitMinor ?? 0
    const liveCr = live._sum.creditMinor ?? 0
    const sumDr = n(summary._sum.debitMinor)
    const sumCr = n(summary._sum.creditMinor)
    const note = 'Chart figure from the monthly summary; recomputed from the journal lines below just now.'
    const reconciliation = isCash
      ? [reconcile('Money in', sumDr, liveDr, note), reconcile('Money out', sumCr, liveCr), reconcile('Net', sumDr - sumCr, liveDr - liveCr)]
      : [reconcile('Expense (debits − credits)', sumDr - sumCr, liveDr - liveCr, note)]
    if (isCash && drill.key === 'all') {
      const [opening, accounts, toDate] = await Promise.all([
        openingCash(ctx, period, accountIds),
        ctx.db.ledgerAccount.findMany({ where: { id: { in: accountIds } }, select: { openingBalanceMinor: true } }),
        ctx.db.journalLine.aggregate({ where: { accountId: { in: accountIds }, entry: { date: { lte: attendanceDate(period.to) } } }, _sum: { debitMinor: true, creditMinor: true } }),
      ])
      const ledgerClosing = accounts.reduce((s, a) => s + a.openingBalanceMinor, 0) + (toDate._sum.debitMinor ?? 0) - (toDate._sum.creditMinor ?? 0)
      reconciliation.push(
        reconcile('Closing cash and bank (opening + net) vs ledger balance', opening + sumDr - sumCr, ledgerClosing, `Ledger balance at ${period.to}, including opening balances, as in the trial balance.`),
      )
    }
    if (!isCash && drill.key === 'all') {
      const pl = await profitAndLoss(ctx, { from: period.from, to: period.to })
      reconciliation.push(reconcile('Total expenses vs Profit & loss', sumDr - sumCr, pl.expenseMinor, 'Total expenses on the Profit & loss for the same dates.'))
    }
    return {
      drill,
      title,
      valueMinor: sumDr - sumCr,
      valueLabel: isCash ? 'Net cash movement (in − out)' : 'Expense in the period',
      definition: METRIC_DEFINITIONS[drill.metric],
      periodLabel: month ? `${range.from} to ${range.to}` : periodLabel,
      freshAt: state?.refreshedAt ?? null,
      freshNote: 'Monthly ledger summary, brought up to date when the dashboard loads',
      rows: lines.map((l) => ({
        id: l.id,
        ref: l.entry.number,
        href: `/accounts/journals/${l.entry.id}`,
        date: toDateInput(l.entry.date),
        description: l.entry.narration || l.memo || '—',
        detail: `${l.account.code} · ${l.account.name}${l.entry.isReversal ? ' · reversal' : ''}`,
        amountMinor: l.debitMinor - l.creditMinor,
        debitMinor: l.debitMinor,
        creditMinor: l.creditMinor,
      })),
      total,
      page,
      pageSize: DRILL_PAGE_SIZE,
      reconciliation,
    }
  }

  if (drill.metric === 'aging') {
    if (!ctx.can('fees.accounts')) throw forbidden('Missing permission: fees.accounts')
    const bucket = AGING_BUCKETS.find((b) => b.key === drill.key)
    const scope = bucket
      ? `Dues ${bucket.label.toLowerCase()} (${bucket.range})`
      : drill.key === 'overdue'
        ? 'All overdue dues (due before today)'
        : 'All outstanding dues'
    const where = openInvoiceWhere(drill.key, today)
    const [invoices, total, agg, all, overdue, byBucket] = await Promise.all([
      ctx.db.feeInvoice.findMany({
        where,
        select: {
          id: true,
          number: true,
          title: true,
          dueOn: true,
          balanceMinor: true,
          student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        },
        orderBy: [{ dueOn: 'asc' }, { number: 'asc' }],
        skip,
        take: DRILL_PAGE_SIZE,
      }),
      ctx.db.feeInvoice.count({ where }),
      ctx.db.feeInvoice.aggregate({ where, _sum: { balanceMinor: true } }),
      ctx.db.feeInvoice.aggregate({ where: openInvoiceWhere(null, today), _sum: { balanceMinor: true } }),
      // The definition of "overdue" used by the fee dashboards.
      ctx.db.feeInvoice.aggregate({
        where: { balanceMinor: { gt: 0 }, dueOn: { lt: attendanceDate(today) }, status: { notIn: ['CANCELLED', 'DRAFT'] } },
        _sum: { balanceMinor: true },
      }),
      Promise.all(AGING_BUCKETS.map((b) => ctx.db.feeInvoice.aggregate({ where: openInvoiceWhere(b.key, today), _sum: { balanceMinor: true } }))),
    ])
    const sumOf = (keys: (b: (typeof AGING_BUCKETS)[number]) => boolean) =>
      byBucket.reduce((s, b, i) => s + (keys(AGING_BUCKETS[i]!) ? (b._sum.balanceMinor ?? 0) : 0), 0)
    return {
      drill,
      title: scope,
      valueMinor: agg._sum.balanceMinor ?? 0,
      valueLabel: `Outstanding (${total} invoices)`,
      definition: METRIC_DEFINITIONS.aging,
      periodLabel: `As at ${today}`,
      freshAt: new Date(),
      freshNote: 'Read live from fee invoices',
      rows: invoices.map((i) => {
        const due = toDateInput(i.dueOn)
        const days = daysOverdue(due, today)
        return {
          id: i.id,
          ref: i.number,
          href: `/students/${i.student.id}`,
          date: due,
          description: `${i.student.firstName} ${i.student.lastName}`.trim(),
          detail: [i.student.admissionNo, i.title, days > 0 ? `${days} days overdue` : 'not yet due'].filter(Boolean).join(' · '),
          amountMinor: i.balanceMinor,
        }
      }),
      total,
      page,
      pageSize: DRILL_PAGE_SIZE,
      reconciliation: [
        reconcile('Overdue buckets vs fee overdue total', sumOf((b) => b.inAging), overdue._sum.balanceMinor ?? 0, 'Overdue as the fee dashboards count it: balance above zero, due before today, not cancelled or draft.'),
        reconcile('All buckets vs all open invoices', sumOf(() => true), all._sum.balanceMinor ?? 0, 'Every open invoice falls in exactly one bucket.'),
      ],
    }
  }

  // wdv
  const monthEnd = lastDay(drill.key)
  const asOf = monthEnd < today ? monthEnd : today
  const register = await wdvData(ctx, asOf)
  const held = register.assets.filter((a) => heldOn(a, asOf)).sort((a, b) => a.code.localeCompare(b.code))
  const posted = new Map<string, number>()
  for (const l of register.lines) if (l.periodEnd <= asOf) posted.set(l.assetId, (posted.get(l.assetId) ?? 0) + l.amountMinor)
  const rows = held.map((a) => {
    const accumulated = a.openingAccumulatedMinor + (posted.get(a.id) ?? 0)
    return {
      id: a.id,
      ref: a.code,
      href: `/accounts/fixed-assets/${a.id}`,
      date: a.capitalisedOn,
      description: a.name,
      figures: [
        { label: 'Cost', minor: a.costMinor },
        { label: 'Accumulated', minor: accumulated },
      ],
      amountMinor: a.costMinor - accumulated,
    }
  })
  const registerWdv = rows.reduce((s, r) => s + r.amountMinor, 0)
  const [point] = wdvSeries(register.assets, register.lines, [drill.key])
  const ledger = await fixedAssetReconciliation(ctx, asOf)
  const ledgerNet = ledger.cost.reduce((s, c) => s + c.ledgerMinor, 0) - ledger.accumulated.ledgerMinor
  return {
    drill,
    title: `Written-down value at ${asOf}`,
    valueMinor: point?.wdvMinor ?? 0,
    valueLabel: `Book WDV of ${rows.length} assets held`,
    definition: METRIC_DEFINITIONS.wdv,
    periodLabel: `Month ending ${monthEnd}`,
    freshAt: new Date(),
    freshNote: 'Read live from the fixed asset register',
    rows: rows.slice(skip, skip + DRILL_PAGE_SIZE),
    total: rows.length,
    page,
    pageSize: DRILL_PAGE_SIZE,
    reconciliation: [
      reconcile('Chart value vs assets listed', point?.wdvMinor ?? 0, registerWdv),
      reconcile('Register vs ledger net block', registerWdv, ledgerNet, 'Ledger: fixed asset ledgers less the accumulated depreciation credit balance. A difference means postings to those ledgers that the register does not explain.'),
    ],
  }
}
