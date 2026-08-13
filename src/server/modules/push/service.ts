import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound } from '@/server/api/response'

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(10).max(500),
    auth: z.string().min(10).max(500),
  }),
})

export async function savePushSubscription(ctx: AppContext, raw: unknown) {
  ctx.require('dashboard.view')
  const input = pushSubscribeSchema.parse(raw)

  const sub = await ctx.db.pushSubscription.upsert({
    where: {
      tenantId_endpoint: { tenantId: ctx.tenant.id, endpoint: input.endpoint },
    },
    create: {
      tenantId: ctx.tenant.id,
      userId: ctx.user.userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: null,
    },
    update: {
      userId: ctx.user.userId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'push.subscribe',
    module: 'settings',
    entityType: 'PushSubscription',
    entityId: sub.id,
    summary: 'Registered push subscription for this device',
  })

  return sub
}

export async function removePushSubscription(ctx: AppContext, endpoint: string) {
  ctx.require('dashboard.view')
  const row = await ctx.db.pushSubscription.findFirst({ where: { endpoint } })
  if (!row) throw notFound('Subscription not found')
  await ctx.db.pushSubscription.delete({ where: { id: row.id } })
}

export async function listMyPushSubscriptions(ctx: AppContext) {
  ctx.require('dashboard.view')
  return ctx.db.pushSubscription.findMany({
    where: { userId: ctx.user.userId },
    select: { id: true, endpoint: true, createdAt: true },
  })
}
