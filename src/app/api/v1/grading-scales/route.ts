import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createGradingScale, gradingScaleSchema, listGradingScales } from '@/server/modules/exams/service'

export const GET = route(async (_req: NextRequest, ctx) => ok(await listGradingScales(ctx)), { permission: 'exams.manage' })
export const POST = route(async (req: NextRequest, ctx) => ok(await createGradingScale(ctx, gradingScaleSchema.parse(await req.json())), undefined, { status: 201 }), { permission: 'exams.manage', rateLimitKey: 'mutation' })
