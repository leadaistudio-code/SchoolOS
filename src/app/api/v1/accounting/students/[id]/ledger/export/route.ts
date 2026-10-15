import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { exportStudentLedger } from '@/server/modules/accounting/student-ledger-service'

/**
 * GET /api/v1/accounting/students/:id/ledger/export?fy=all|YYYY-YY&format=csv|pdf
 *
 * The statement of account for one student. PDF is a printable HTML page.
 */
export const GET = route(
  async (req: NextRequest, ctx, params) => {
    const file = await exportStudentLedger(ctx, params.id!, Object.fromEntries(req.nextUrl.searchParams))
    const disposition = file.filename.endsWith('.html') ? 'inline' : 'attachment'
    return new Response(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `${disposition}; filename="${file.filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  },
  { permission: 'fees.export' },
)
