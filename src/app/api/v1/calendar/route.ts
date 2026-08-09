import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import {
  calendarEventSchema,
  calendarMonth,
  createCalendarEvent,
} from '@/server/modules/academics/content-service'

export const GET = route(
  async (req: NextRequest, ctx) =>
    ok(await calendarMonth(ctx, req.nextUrl.searchParams.get('month') ?? undefined)),
  { permission: 'calendar.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) =>
    ok(await createCalendarEvent(ctx, calendarEventSchema.parse(await req.json())), undefined, {
      status: 201,
    }),
  { permission: 'calendar.manage', rateLimitKey: 'mutation' },
)
