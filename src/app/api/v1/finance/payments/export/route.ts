import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { exportPayments, paymentFilterSchema } from '@/server/modules/finance/payments'
import { csvResponse } from '@/lib/csv'
import { toDateInput } from '@/lib/dates'
import { getViewSession, withSessionPeriod } from '@/server/view-session'

const rupees = (minor: number) => (minor / 100).toFixed(2)

function statusLabel(status: string, mode: string, provider: string | null): string {
  if (status === 'PENDING' && mode === 'CHEQUE' && provider === 'manual') return 'Pending clearance'
  if (status === 'FAILED' && mode === 'CHEQUE' && provider === 'manual') return 'Bounced'
  if (status === 'REVERSED') return 'Cancelled'
  if (status === 'SUCCESS') return 'Cleared'
  return status.replaceAll('_', ' ').toLowerCase()
}

/** GET /api/v1/finance/payments/export?{same filters as the receipts page} */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries())
    const filter = withSessionPeriod(paymentFilterSchema.parse(params), await getViewSession(ctx))
    const rows = await exportPayments(ctx, params.q?.trim() || undefined, filter)
    return csvResponse(
      `fee-receipts-${toDateInput(new Date())}.csv`,
      ['Receipt', 'Date', 'Student', 'Admission no.', 'Class', 'Mode', 'Channel', 'Collected by', 'Reference / UTR', 'Bill book', 'Amount', 'Refunded', 'Status', 'Note'],
      rows.map((p) => {
        const enrollment = p.student.enrollments[0]
        return [
          p.receipt?.number ?? '',
          toDateInput(p.paidAt ?? p.createdAt),
          `${p.student.firstName} ${p.student.lastName}`,
          p.student.admissionNo,
          enrollment ? `${enrollment.classLevel.name} ${enrollment.section?.name ?? ''}`.trim() : '',
          p.mode,
          p.provider === 'manual' ? 'Office' : p.provider ?? 'Online',
          p.collectedByName,
          p.reference ?? p.providerPaymentId ?? '',
          p.billBookNo ?? '',
          rupees(p.amountMinor),
          rupees(p.refunds.filter((r) => r.status !== 'FAILED').reduce((t, r) => t + r.amountMinor, 0)),
          statusLabel(p.status, p.mode, p.provider),
          p.failureReason ?? '',
        ]
      }),
    )
  },
  { permission: 'fees.export' },
)
