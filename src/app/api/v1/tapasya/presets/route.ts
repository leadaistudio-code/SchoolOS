import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { createPreset, listPresets } from '@/server/modules/tapasya/presets'
import { presetSchema } from '@/server/modules/tapasya/schema'

export const GET = route(async (_req, ctx) => ok(await listPresets(ctx)), { permission: 'tapasya.use' })

export const POST = route(
  async (req: NextRequest, ctx) => ok(await createPreset(ctx, presetSchema.parse(await req.json())), undefined, { status: 201 }),
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)
