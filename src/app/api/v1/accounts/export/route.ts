import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { badRequest } from '@/server/api/response'
import { csvResponse } from '@/lib/csv'
import { toDateInput } from '@/lib/dates'
import { schoolToday } from '@/lib/periods'
import {
  balanceSheet,
  defaultRange,
  generalLedger,
  profitAndLoss,
  trialBalance,
} from '@/server/modules/accounts/service'

const rupees = (minor: number) => (minor / 100).toFixed(2)
const iso = (v: string | null, fallback: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback)
const dr = (minor: number) => (minor > 0 ? rupees(minor) : '')
const cr = (minor: number) => (minor < 0 ? rupees(-minor) : '')

/** GET /api/v1/accounts/export?report=ledger|trial-balance|profit-loss|balance-sheet */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const p = req.nextUrl.searchParams
    const def = defaultRange()
    const from = iso(p.get('from'), def.from)
    const to = iso(p.get('to'), def.to)

    switch (p.get('report')) {
      case 'ledger': {
        const accountId = p.get('account')
        if (!accountId) throw badRequest('Choose an account')
        const l = await generalLedger(ctx, { accountId, from, to })
        return csvResponse(
          `ledger-${l.account.code}-${from}-to-${to}.csv`,
          ['Date', 'Voucher', 'Type', 'Reference', 'Particulars', 'Narration', 'Debit', 'Credit', 'Balance Dr', 'Balance Cr'],
          [
            [from, '', '', '', 'Opening balance', '', '', '', dr(l.openingMinor), cr(l.openingMinor)],
            ...l.rows.map((r) => [
              toDateInput(r.date), r.number, r.voucherType, r.reference ?? '', r.particulars, r.narration ?? '',
              r.debitMinor ? rupees(r.debitMinor) : '', r.creditMinor ? rupees(r.creditMinor) : '',
              dr(r.balanceMinor), cr(r.balanceMinor),
            ]),
            [to, '', '', '', 'Closing balance', '', rupees(l.debitMinor), rupees(l.creditMinor), dr(l.closingMinor), cr(l.closingMinor)],
          ],
        )
      }
      case 'trial-balance': {
        const tb = await trialBalance(ctx, { from, to })
        return csvResponse(
          `trial-balance-${from}-to-${to}.csv`,
          ['Code', 'Account', 'Type', 'Opening Dr', 'Opening Cr', 'Debit', 'Credit', 'Closing Dr', 'Closing Cr'],
          [
            ...tb.rows.map((r) => [
              r.code, r.name, r.type, dr(r.openingMinor), cr(r.openingMinor),
              rupees(r.debitMinor), rupees(r.creditMinor), dr(r.closingMinor), cr(r.closingMinor),
            ]),
            ['', 'Total', '', '', '', rupees(tb.totals.debitMinor), rupees(tb.totals.creditMinor), rupees(tb.totals.closingDrMinor), rupees(tb.totals.closingCrMinor)],
          ],
        )
      }
      case 'profit-loss': {
        const pl = await profitAndLoss(ctx, { from, to })
        return csvResponse(
          `income-expenditure-${from}-to-${to}.csv`,
          ['Section', 'Code', 'Account', 'Amount'],
          [
            ...pl.income.map((r) => ['Income', r.code, r.name, rupees(r.amountMinor)]),
            ['Income', '', 'Total income', rupees(pl.incomeMinor)],
            ...pl.directExpenses.map((r) => ['Direct expenses', r.code, r.name, rupees(r.amountMinor)]),
            ['Direct expenses', '', 'Total direct expenses', rupees(pl.directMinor)],
            ['', '', pl.grossSurplusMinor >= 0 ? 'Gross surplus' : 'Gross deficit', rupees(pl.grossSurplusMinor)],
            ...pl.indirectExpenses.map((r) => ['Indirect expenses', r.code, r.name, rupees(r.amountMinor)]),
            ['Indirect expenses', '', 'Total indirect expenses', rupees(pl.indirectMinor)],
            ['', '', pl.surplusMinor >= 0 ? 'Net surplus' : 'Net deficit', rupees(pl.surplusMinor)],
          ],
        )
      }
      case 'balance-sheet': {
        const asOf = iso(p.get('to'), schoolToday())
        const bs = await balanceSheet(ctx, { asOf })
        return csvResponse(
          `balance-sheet-${asOf}.csv`,
          ['Side', 'Code', 'Account', 'Amount'],
          [
            ...bs.equity.map((r) => ['Capital & reserves', r.code, r.name, rupees(r.amountMinor)]),
            ['Capital & reserves', '', 'Surplus brought forward', rupees(bs.retainedSurplusMinor)],
            ['Capital & reserves', '', 'Surplus for the current year', rupees(bs.currentSurplusMinor)],
            ...bs.liabilities.map((r) => ['Liabilities', r.code, r.name, rupees(r.amountMinor)]),
            ['', '', 'Total liabilities & funds', rupees(bs.fundsMinor)],
            ...bs.assets.map((r) => ['Assets', r.code, r.name, rupees(r.amountMinor)]),
            ['', '', 'Total assets', rupees(bs.assetsMinor)],
          ],
        )
      }
      default:
        throw badRequest('Unknown report')
    }
  },
  { permission: 'accounts.view' },
)
