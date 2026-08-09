import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { getRegister, markAttendance, unmarkedSections } from '@/server/modules/attendance/service'
import { markAttendanceSchema } from '@/server/modules/attendance/schema'
import { toDateInput } from '@/lib/dates'

/**
 * GET /api/v1/attendance?sectionId=&onDate=
 * The register for one section on one date. Without a sectionId it reports
 * which sections are still unmarked, which is what a dashboard needs.
 */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = req.nextUrl.searchParams
    const onDate = params.get('onDate') ?? toDateInput(new Date())
    const sectionId = params.get('sectionId')

    if (!sectionId) return ok(await unmarkedSections(ctx, onDate))
    return ok(await getRegister(ctx, sectionId, onDate))
  },
  { permission: 'attendance.view' },
)

/** POST /api/v1/attendance — saves a whole section register in one transaction. */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const input = markAttendanceSchema.parse(await req.json())
    return ok(await markAttendance(ctx, input))
  },
  { permission: 'attendance.mark', rateLimitKey: 'mutation' },
)
