import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { csvResponse } from '@/lib/csv'
import { storeCategory } from '@/lib/store/options'
import { getViewSession } from '@/server/view-session'
import { studentPurchaseReport, studentPurchaseSchema } from '@/server/modules/store/student-purchases'
import { badRequest } from '@/server/api/response'

const STAMP = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
const rs = (minor: number) => (minor / 100).toFixed(2)

/** GET /api/v1/store/student-purchases/export: same filters as the student purchases page. */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const filter = studentPurchaseSchema.parse(Object.fromEntries(req.nextUrl.searchParams))
    const session = await getViewSession(ctx)
    if (!session) throw badRequest('Set up an academic session first')
    const report = await studentPurchaseReport(ctx, session, filter)
    const what = filter.item ?? (filter.category ? storeCategory(filter.category).label : 'store')

    if (filter.view === 'missing') {
      return csvResponse(
        `not-bought-${slug(what)}-${report.to}.csv`,
        ['Class', 'Section', 'Roll no.', 'Student', 'Admission no.', 'Parent phone'],
        report.missing.map((r) => [r.className, r.sectionName, r.rollNumber ?? '', r.name, r.admissionNo, r.parentPhone ?? '']),
      )
    }
    return csvResponse(
      `store-purchases-${slug(what)}-${report.to}.csv`,
      ['Date', 'Bill no.', 'Class', 'Section', 'Student', 'Admission no.', 'Item', 'Category', 'Qty', 'Amount (Rs)'],
      report.bought.map((r) => [
        STAMP.format(r.soldAt),
        r.billNumber,
        r.className,
        r.sectionName,
        r.name,
        r.admissionNo,
        r.item,
        storeCategory(r.category).label,
        r.quantity,
        rs(r.amountMinor),
      ]),
    )
  },
  { permission: 'store.view' },
)

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'store'
}
