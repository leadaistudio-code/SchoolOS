import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import {
  exportStudentFeeReport,
  studentFeeReportExportSchema,
} from '@/server/modules/finance/student-fee-report-export'

/**
 * GET /api/v1/finance/reports/students/export?format=csv|pdf&view=status|payers&status=&classLevelId=&sectionId=&q=&from=&to=
 *
 * Same filters as the Fee reports page, for the session chosen in the header.
 * PDF is a printable HTML page.
 */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const query = studentFeeReportExportSchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()))
    const file = await exportStudentFeeReport(ctx, query)
    const disposition = query.format === 'pdf' ? 'inline' : 'attachment'
    return new Response(file.body, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `${disposition}; filename="${file.filename.replace(/[^\w.-]+/g, '-')}"`,
        'Cache-Control': 'no-store',
      },
    })
  },
  { permission: 'fees.export' },
)
