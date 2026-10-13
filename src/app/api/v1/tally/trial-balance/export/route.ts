import { route } from '@/server/api/handler'
import { badRequest } from '@/server/api/response'
import { getTrialBalanceView } from '@/server/modules/tally/trial-balance'

function csvCell(value: string | number): string {
  const text = String(value)
  // Leading = + - @ would run as a formula when the file is opened in Excel.
  const numeric = /^-?\d+(\.\d+)?$/.test(text)
  const safe = !numeric && /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

const rupees = (minor: number) => (minor / 100).toFixed(2)

/**
 * GET /api/v1/tally/trial-balance/export
 *
 * Latest Tally trial balance snapshot plus the MyCampusView match, as CSV.
 */
export const GET = route(
  async (_req, ctx) => {
    const view = await getTrialBalanceView(ctx)
    const tb = view.trialBalance
    if (!tb) throw badRequest('No trial balance has been fetched from Tally yet')

    const lines: string[] = []
    const row = (...cells: Array<string | number>) => lines.push(cells.map(csvCell).join(','))

    row(`Trial balance ${tb.fromDate} to ${tb.toDate}`)
    row('Ledger', 'Group', 'Primary group', 'Opening (Dr+)', 'Net change (Dr+)', 'Closing Dr', 'Closing Cr')
    for (const r of tb.rows) {
      row(
        r.name,
        r.group,
        r.primaryGroup,
        rupees(r.openingMinor),
        rupees(r.changeMinor),
        r.closingMinor > 0 ? rupees(r.closingMinor) : '',
        r.closingMinor < 0 ? rupees(-r.closingMinor) : '',
      )
    }
    row('Total', '', '', '', '', rupees(tb.totals.closingDrMinor), rupees(tb.totals.closingCrMinor))
    row('')
    row('MyCampusView vs Tally')
    row('Tally ledger', 'Side', 'Based on', 'MyCampusView', 'Posted to Tally', 'Tally movement', 'Difference', 'Status')
    for (const m of view.matches) {
      row(
        m.ledgerName,
        m.side === 'CREDIT' ? 'Fee income (Cr)' : 'Collection (Dr)',
        m.basis,
        rupees(m.mcvMinor),
        rupees(m.postedMinor),
        m.tallyMinor == null ? '' : rupees(m.tallyMinor),
        rupees(m.differenceMinor),
        m.status,
      )
    }

    const filename = `tally-trial-balance-${tb.fromDate}-to-${tb.toDate}.csv`
    return new Response(`\uFEFF${lines.join('\r\n')}\r\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  },
  { permission: 'fees.tally' },
)
