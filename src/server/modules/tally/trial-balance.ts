import type { AppContext } from '@/server/context'
import { badRequest } from '@/server/api/response'
import { enqueueTallyCommand } from './commands'
import { getOrCreateIntegration } from './settings'
import { cleanTallyName } from '@/server/integrations/tally/xml'

/** ₹1 — receipt lines are split per fee head and rounded per line. */
const MATCH_TOLERANCE_MINOR = 100

export type TrialBalanceRow = {
  name: string
  group: string
  primaryGroup: string
  /** Signed minor units, Debit positive / Credit negative. */
  openingMinor: number
  changeMinor: number
  closingMinor: number
}

export type TrialBalance = {
  fromDate: string
  toDate: string
  rows: TrialBalanceRow[]
  totals: {
    openingDrMinor: number
    openingCrMinor: number
    closingDrMinor: number
    closingCrMinor: number
    differenceMinor: number
  }
}

export type MatchStatus = 'MATCHED' | 'NOT_POSTED' | 'MISMATCH' | 'MISSING_IN_TALLY'

export type MatchRow = {
  ledgerName: string
  side: 'CREDIT' | 'DEBIT'
  basis: string
  mcvMinor: number
  postedMinor: number
  tallyMinor: number | null
  differenceMinor: number
  status: MatchStatus
}

type RawSnapshot = {
  fromDate?: string
  toDate?: string
  ledgers?: Array<{ name: string; parent?: string | null; opening?: number; closing?: number }>
  groups?: Array<{ name: string; parent?: string | null }>
}

// Tally prefixes reserved groups with control characters (e.g. "\u0004 Primary").
function cleanGroup(value: string | null | undefined): string {
  return (value ?? '').replace(/[\u0000-\u001f]/g, '').trim()
}

/** Tally exports Debit as negative; flip to Debit-positive minor units. */
function toDrMinor(tallyAmount: number | undefined): number {
  return Math.round(-(Number(tallyAmount) || 0) * 100)
}

function tallyDateToIso(value: string | undefined): string {
  const v = String(value ?? '')
  return /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v
}

export function buildTrialBalance(raw: RawSnapshot): TrialBalance {
  const groupParent = new Map<string, string>()
  for (const g of raw.groups ?? []) {
    const name = cleanTallyName(g.name)
    if (name) groupParent.set(name, cleanGroup(g.parent))
  }
  const primaryOf = (group: string): string => {
    let current = group
    for (let i = 0; i < 20; i++) {
      const parent = groupParent.get(current)
      if (!parent || parent === 'Primary') return current
      current = parent
    }
    return current
  }

  const rows: TrialBalanceRow[] = []
  for (const l of raw.ledgers ?? []) {
    const name = cleanTallyName(l.name)
    if (!name) continue
    const group = cleanGroup(l.parent) || 'Other'
    const openingMinor = toDrMinor(l.opening)
    const closingMinor = toDrMinor(l.closing)
    rows.push({
      name,
      group,
      primaryGroup: group === 'Primary' ? 'Primary' : primaryOf(group),
      openingMinor,
      changeMinor: closingMinor - openingMinor,
      closingMinor,
    })
  }
  rows.sort((a, b) => a.primaryGroup.localeCompare(b.primaryGroup) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name))

  const sum = (pick: (r: TrialBalanceRow) => number) => rows.reduce((t, r) => t + pick(r), 0)
  const closingDrMinor = sum((r) => Math.max(0, r.closingMinor))
  const closingCrMinor = sum((r) => Math.max(0, -r.closingMinor))
  return {
    fromDate: tallyDateToIso(raw.fromDate),
    toDate: tallyDateToIso(raw.toDate),
    rows,
    totals: {
      openingDrMinor: sum((r) => Math.max(0, r.openingMinor)),
      openingCrMinor: sum((r) => Math.max(0, -r.openingMinor)),
      closingDrMinor,
      closingCrMinor,
      differenceMinor: closingDrMinor - closingCrMinor,
    },
  }
}

type Expected = { mcvMinor: number; postedMinor: number; basis: Set<string> }

export function matchAgainstTally(
  tb: TrialBalance,
  expected: { credit: Map<string, Expected>; debit: Map<string, Expected> },
): MatchRow[] {
  const byName = new Map(tb.rows.map((r) => [r.name, r]))
  const rows: MatchRow[] = []
  const push = (side: 'CREDIT' | 'DEBIT', ledgerName: string, e: Expected) => {
    const row = byName.get(ledgerName)
    // Fee income increases the Credit side; collections increase the Debit side.
    const tallyMinor = row ? (side === 'CREDIT' ? -row.changeMinor : row.changeMinor) : null
    const differenceMinor = (tallyMinor ?? 0) - e.mcvMinor
    let status: MatchStatus
    if (tallyMinor == null) status = 'MISSING_IN_TALLY'
    else if (Math.abs(differenceMinor) <= MATCH_TOLERANCE_MINOR) status = 'MATCHED'
    else if (e.postedMinor < e.mcvMinor && Math.abs(tallyMinor - e.postedMinor) <= MATCH_TOLERANCE_MINOR)
      status = 'NOT_POSTED'
    else status = 'MISMATCH'
    rows.push({
      ledgerName,
      side,
      basis: [...e.basis].sort().join(', '),
      mcvMinor: e.mcvMinor,
      postedMinor: e.postedMinor,
      tallyMinor,
      differenceMinor,
      status,
    })
  }
  for (const [name, e] of expected.credit) push('CREDIT', name, e)
  for (const [name, e] of expected.debit) push('DEBIT', name, e)
  return rows
}

function tzOffset(timeZone: string, at: Date): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value
  const m = part?.match(/GMT([+-]\d{2}:\d{2})/)
  return m?.[1] ?? '+00:00'
}

function dayBounds(iso: string, timeZone: string) {
  const probe = new Date(`${iso}T12:00:00Z`)
  const offset = tzOffset(timeZone, probe)
  return {
    start: new Date(`${iso}T00:00:00.000${offset}`),
    end: new Date(`${iso}T23:59:59.999${offset}`),
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function defaultPeriod(today = new Date()): { from: string; to: string } {
  const y = today.getUTCFullYear()
  const fyStartYear = today.getUTCMonth() >= 3 ? y : y - 1
  return { from: `${fyStartYear}-04-01`, to: today.toISOString().slice(0, 10) }
}

export async function requestTrialBalance(ctx: AppContext, input: { from: string; to: string }) {
  ctx.require('fees.tally_manage')
  if (!ISO_DATE.test(input.from) || !ISO_DATE.test(input.to)) throw badRequest('Choose a valid date range')
  if (input.from > input.to) throw badRequest('From date must be on or before To date')
  const integration = await getOrCreateIntegration(ctx)
  const companyName = cleanTallyName(integration.companyName)
  if (!companyName) throw badRequest('Set the Tally company name in Settings → Tally ERP first')
  const compact = (iso: string) => iso.replaceAll('-', '')
  return enqueueTallyCommand(ctx, {
    type: 'FETCH_BALANCES',
    payload: {
      companyName,
      fromDate: compact(input.from),
      toDate: compact(input.to),
      openingAsOf: compact(addDays(input.from, -1)),
    },
  })
}

async function collectExpected(ctx: AppContext, integrationId: string, from: string, to: string) {
  const tz = ctx.tenant.timezone || 'Asia/Kolkata'
  const start = dayBounds(from, tz).start
  const end = dayBounds(to, tz).end

  const [feeMaps, modeMaps, rules] = await Promise.all([
    ctx.db.tallyMapping.findMany({
      where: { integrationId, kind: 'FEE_HEAD', active: true },
      select: { localKey: true, localLabel: true, tallyLedgerName: true },
    }),
    ctx.db.tallyMapping.findMany({
      where: { integrationId, kind: 'PAYMENT_MODE', active: true },
      select: { localKey: true, tallyLedgerName: true },
    }),
    ctx.db.tallyAccountingRule.findMany({
      where: { integrationId, active: true },
      orderBy: { sortOrder: 'asc' },
      select: { paymentMode: true, debitLedgerName: true },
    }),
  ])
  const feeLedger = new Map(feeMaps.map((m) => [m.localKey, m]))
  const defaultDebit = rules.find((r) => r.paymentMode == null)?.debitLedgerName ?? null
  const debitFor = (mode: string) =>
    modeMaps.find((m) => m.localKey === mode)?.tallyLedgerName ??
    rules.find((r) => r.paymentMode === mode)?.debitLedgerName ??
    defaultDebit

  const credit = new Map<string, Expected>()
  const debit = new Map<string, Expected>()
  const add = (bucket: Map<string, Expected>, ledger: string, label: string, minor: number, posted: boolean) => {
    const e = bucket.get(ledger) ?? { mcvMinor: 0, postedMinor: 0, basis: new Set<string>() }
    e.mcvMinor += minor
    if (posted) e.postedMinor += minor
    e.basis.add(label)
    bucket.set(ledger, e)
  }

  let unmappedFeeMinor = 0
  let unallocatedMinor = 0
  let noDebitLedgerMinor = 0
  let paymentCount = 0
  let postedCount = 0
  let cursor: string | undefined

  for (;;) {
    const payments = await ctx.db.feePayment.findMany({
      where: { status: 'SUCCESS', paidAt: { gte: start, lte: end } },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        mode: true,
        amountMinor: true,
        allocations: {
          select: {
            amountMinor: true,
            invoice: {
              select: {
                totalMinor: true,
                lines: { select: { feeHeadId: true, amountMinor: true, feeHead: { select: { name: true } } } },
              },
            },
          },
        },
      },
    })
    const last = payments[payments.length - 1]
    if (!last) break
    cursor = last.id

    const synced = new Set(
      (
        await ctx.db.tallyVoucherLink.findMany({
          where: { entityKind: 'FEE_PAYMENT', entityId: { in: payments.map((p) => p.id) }, status: 'SYNCED' },
          select: { entityId: true },
        })
      ).map((l) => l.entityId),
    )

    for (const p of payments) {
      paymentCount++
      const posted = synced.has(p.id)
      if (posted) postedCount++

      const debitLedger = debitFor(p.mode)
      if (debitLedger) add(debit, debitLedger, p.mode, p.amountMinor, posted)
      else noDebitLedgerMinor += p.amountMinor

      let allocated = 0
      for (const alloc of p.allocations) {
        const total = Math.max(1, alloc.invoice.totalMinor)
        for (const line of alloc.invoice.lines) {
          if (!line.feeHeadId) continue
          const share = Math.round((alloc.amountMinor * line.amountMinor) / total)
          if (share <= 0) continue
          allocated += share
          const map = feeLedger.get(line.feeHeadId)
          if (map) add(credit, map.tallyLedgerName, map.localLabel ?? line.feeHead?.name ?? 'Fee head', share, posted)
          else unmappedFeeMinor += share
        }
      }
      if (p.amountMinor > allocated) unallocatedMinor += p.amountMinor - allocated
    }
    if (payments.length < 500) break
  }

  return {
    credit,
    debit,
    summary: { paymentCount, postedCount, unmappedFeeMinor, unallocatedMinor, noDebitLedgerMinor },
  }
}

export async function getTrialBalanceView(ctx: AppContext) {
  if (!ctx.canAny('fees.tally', 'fees.tally_manage')) ctx.require('fees.tally')
  const integration = await getOrCreateIntegration(ctx)
  const [latest, pending] = await Promise.all([
    ctx.db.tallyCommand.findFirst({
      where: { integrationId: integration.id, type: 'FETCH_BALANCES', status: 'SUCCEEDED' },
      orderBy: { completedAt: 'desc' },
      select: { id: true, resultJson: true, completedAt: true },
    }),
    ctx.db.tallyCommand.findFirst({
      where: { integrationId: integration.id, type: 'FETCH_BALANCES', status: { in: ['PENDING', 'CLAIMED', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, error: true, createdAt: true, payload: true },
    }),
  ])
  const pendingNewer = pending && (!latest?.completedAt || pending.createdAt > latest.completedAt) ? pending : null

  if (!latest?.resultJson) {
    return { integration, trialBalance: null, matches: [], summary: null, fetchedAt: null, request: pendingNewer }
  }

  const trialBalance = buildTrialBalance(latest.resultJson as RawSnapshot)
  const expected = await collectExpected(ctx, integration.id, trialBalance.fromDate, trialBalance.toDate)
  return {
    integration,
    trialBalance,
    matches: matchAgainstTally(trialBalance, expected),
    summary: expected.summary,
    fetchedAt: latest.completedAt,
    request: pendingNewer,
  }
}
