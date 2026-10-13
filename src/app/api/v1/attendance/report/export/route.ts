import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { exportAttendanceReport } from '@/server/modules/attendance/service'
import { attendanceReportExportQuerySchema } from '@/server/modules/attendance/schema'

/**
 * GET /api/v1/attendance/report/export?from=&to=&table=summary|daily&classLevelId=&sectionId=
 *
 * CSV attachment for the Attendance → Reports page. Same filters as the
 * on-screen table; `table=summary` matches the page, `table=daily` is the
 * day-by-day audit dump.
 */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const query = attendanceReportExportQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )
    const { filename, csv } = await exportAttendanceReport(ctx, query)

    // BOM keeps Excel from mangling non-ASCII names on Windows.
    return new Response(`\uFEFF${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  },
  { permission: 'attendance.view' },
)
