import type { NextRequest } from 'next/server'
import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { removePushSubscription, savePushSubscription } from '@/server/modules/push/service'

export const POST = route(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    const sub = await savePushSubscription(ctx, body)
    return ok({ id: sub.id })
  },
  { permission: 'dashboard.view', rateLimitKey: 'mutation' },
)

export const DELETE = route(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    await removePushSubscription(ctx, String(body.endpoint ?? ''))
    return ok({ removed: true })
  },
  { permission: 'dashboard.view', rateLimitKey: 'mutation' },
)
