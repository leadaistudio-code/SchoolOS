import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import {
  checkConflicts,
  sectionTimetable,
  setSlot,
  slotSchema,
  teacherTimetable,
} from '@/server/modules/timetable/service'

/**
 * GET ?sectionId= | ?staffId= | ?mine=1
 * Weekly grid from a section or teacher point of view. `mine=1` resolves the
 * staff row linked to the signed-in user (phone clients do not know their
 * staffId up front).
 */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const sectionId = req.nextUrl.searchParams.get('sectionId')
    const staffId = req.nextUrl.searchParams.get('staffId')
    const mine =
      req.nextUrl.searchParams.get('mine') === '1' ||
      req.nextUrl.searchParams.get('mine') === 'true'

    if (mine) {
      const own = await ctx.db.staff.findFirst({
        where: { userId: ctx.user.userId, deletedAt: null },
        select: { id: true },
      })
      if (!own) {
        throw new ApiException(
          404,
          'NOT_FOUND',
          'No staff profile is linked to this account, so there is no personal timetable to show.',
        )
      }
      return ok(await teacherTimetable(ctx, own.id))
    }

    if (staffId) return ok(await teacherTimetable(ctx, staffId))
    if (sectionId) return ok(await sectionTimetable(ctx, sectionId))
    throw new ApiException(400, 'BAD_REQUEST', 'Provide a sectionId, a staffId, or mine=1')
  },
  { permission: 'timetable.view' },
)

/** PUT — set or clear one cell. Conflicts are refused with an explanation. */
export const PUT = route(
  async (req: NextRequest, ctx) => {
    const input = slotSchema.parse(await req.json())
    return ok(await setSlot(ctx, input))
  },
  { permission: 'timetable.manage', rateLimitKey: 'mutation' },
)

/** POST — dry-run conflict check used by the builder before committing. */
export const POST = route(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    const input = slotSchema.parse(body)
    const teacherId = body.teacherId ?? null
    return ok(await checkConflicts(ctx, input, teacherId))
  },
  { permission: 'timetable.manage' },
)
