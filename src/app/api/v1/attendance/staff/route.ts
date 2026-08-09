import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  manualMarkSchema,
  overrideAttendance,
  staffAttendanceSummary,
  staffDayRegister,
} from '@/server/modules/staff-attendance/service'
import { toDateInput } from '@/lib/dates'

/** GET — the staff roll for a day, or a summary when a range is supplied. */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const params = req.nextUrl.searchParams
    const from = params.get('from')
    const to = params.get('to')
    if (from && to) return ok(await staffAttendanceSummary(ctx, from, to))
    return ok(await staffDayRegister(ctx, params.get('onDate') ?? toDateInput(new Date())))
  },
  { permission: 'staff_attendance.view' },
)

/** PATCH — audited administrative correction. */
export const PATCH = route(
  async (req: NextRequest, ctx) => {
    const input = manualMarkSchema.parse(await req.json())
    return ok(await overrideAttendance(ctx, input))
  },
  { permission: 'staff_attendance.manage', rateLimitKey: 'mutation' },
)
