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

/** GET ?sectionId= | ?staffId= — the weekly grid from either point of view. */
export const GET = route(
  async (req: NextRequest, ctx) => {
    const sectionId = req.nextUrl.searchParams.get('sectionId')
    const staffId = req.nextUrl.searchParams.get('staffId')

    if (staffId) return ok(await teacherTimetable(ctx, staffId))
    if (sectionId) return ok(await sectionTimetable(ctx, sectionId))
    throw new ApiException(400, 'BAD_REQUEST', 'Provide a sectionId or a staffId')
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
