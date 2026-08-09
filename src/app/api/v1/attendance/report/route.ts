import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { attendanceReport } from '@/server/modules/attendance/service'
import { attendanceReportQuerySchema } from '@/server/modules/attendance/schema'

/** GET /api/v1/attendance/report?from=&to=&classLevelId=&sectionId=&studentId= */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const query = attendanceReportQuerySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )
    return ok(await attendanceReport(ctx, query))
  },
  { permission: 'attendance.view' },
)
