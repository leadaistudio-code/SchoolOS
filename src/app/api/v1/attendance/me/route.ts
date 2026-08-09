import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { checkIn, checkOut, geofenceStatus, checkInSchema } from '@/server/modules/staff-attendance/service'

/** GET — what the check-in screen needs before asking for location. */
export const GET = route(async (_req, ctx) => ok(await geofenceStatus(ctx)), {
  permission: 'staff_attendance.mark',
})

/**
 * POST — geofenced check-in or check-out.
 * The client reports coordinates; the SERVER decides whether they are inside.
 */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    if (body?.action === 'CHECK_OUT') return ok(await checkOut(ctx))
    return ok(await checkIn(ctx, checkInSchema.parse(body)))
  },
  { permission: 'staff_attendance.mark', rateLimitKey: 'mutation' },
)
