import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { studentsForAssignment } from '@/server/modules/evaluation/service'
import { ok } from '@/server/api/response'

export const GET = route(
  async (_req: NextRequest, ctx, params) => ok(await studentsForAssignment(ctx, params.id!)),
  { permission: 'assessments.evaluate' },
)
