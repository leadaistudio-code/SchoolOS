import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { classProgress } from '@/server/modules/tapasya/tasks'

/** GET /tapasya/teacher/progress?sectionId= — task and focus progress for students in scope. */
export const GET = route(
  async (req: NextRequest, ctx) => ok(await classProgress(ctx, req.nextUrl.searchParams.get('sectionId'))),
  { permission: 'tapasya.teach' },
)
