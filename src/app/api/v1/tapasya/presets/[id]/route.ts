import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { deletePreset, duplicatePreset, updatePreset } from '@/server/modules/tapasya/presets'
import { presetSchema } from '@/server/modules/tapasya/schema'

export const PUT = route(
  async (req: NextRequest, ctx, params) => ok(await updatePreset(ctx, params.id!, presetSchema.parse(await req.json()))),
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)

/** POST /tapasya/presets/{id} — duplicate. `id` may be `builtin:CLASSIC` etc. */
export const POST = route(
  async (_req, ctx, params) => ok(await duplicatePreset(ctx, decodeURIComponent(params.id!)), undefined, { status: 201 }),
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (_req, ctx, params) => {
    await deletePreset(ctx, params.id!)
    return ok({ deleted: true })
  },
  { permission: 'tapasya.use', rateLimitKey: 'mutation' },
)
