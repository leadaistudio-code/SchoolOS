import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound } from '@/server/api/response'

const expoToken = z
  .string()
  .trim()
  .regex(/^Expo(nent)?PushToken\[.+\]$/, 'Enter a valid Expo push token')

/**
 * Web Push (VAPID) or Expo. Mobile sends `{ provider: 'expo', token }`;
 * the PWA keeps sending `{ endpoint, keys }`.
 */
export const pushSubscribeSchema = z.union([
  z.object({
    provider: z.literal('expo'),
    token: expoToken,
  }),
  z.object({
    endpoint: z.string().url().max(2000),
    keys: z.object({
      p256dh: z.string().min(10).max(500),
      auth: z.string().min(10).max(500),
    }),
  }),
])

function normalised(raw: z.infer<typeof pushSubscribeSchema>): {
  endpoint: string
  p256dh: string
  auth: string
} {
  if ('provider' in raw) {
    return { endpoint: raw.token, p256dh: 'expo', auth: 'expo' }
  }
  return {
    endpoint: raw.endpoint,
    p256dh: raw.keys.p256dh,
    auth: raw.keys.auth,
  }
}

export function isExpoPushEndpoint(endpoint: string): boolean {
  return /^Expo(nent)?PushToken\[.+\]$/.test(endpoint)
}

export async function savePushSubscription(ctx: AppContext, raw: unknown) {
  ctx.require('dashboard.view')
  const input = normalised(pushSubscribeSchema.parse(raw))

  const sub = await ctx.db.pushSubscription.upsert({
    where: {
      tenantId_endpoint: { tenantId: ctx.tenant.id, endpoint: input.endpoint },
    },
    create: {
      tenantId: ctx.tenant.id,
      userId: ctx.user.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: null,
    },
    update: {
      userId: ctx.user.userId,
      p256dh: input.p256dh,
      auth: input.auth,
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

/**
 * Sends via Expo's push gateway. No FCM service account required for Expo
 * tokens; native FCM wiring is only needed for bare-workflow custom senders.
 */
export async function sendExpoPush(messages: {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
}[]): Promise<{ ok: boolean; providerMessageId?: string; error?: string }> {
  if (messages.length === 0) return { ok: true }

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'accept-encoding': 'gzip, deflate',
        'content-type': 'application/json',
      },
      body: JSON.stringify(
        messages.map((m) => ({
          to: m.to,
          sound: 'default',
          title: m.title,
          body: m.body,
          data: m.data ?? {},
          channelId: 'default',
        })),
      ),
    })
    const json = (await res.json().catch(() => null)) as {
      data?: { status?: string; id?: string; message?: string } | { status?: string; id?: string }[]
    } | null

    if (!res.ok) {
      return { ok: false, error: `Expo push HTTP ${res.status}` }
    }

    const rows = Array.isArray(json?.data) ? json.data : json?.data ? [json.data] : []
    const failed = rows.find((r) => r && r.status === 'error') as
      | { status?: string; message?: string }
      | undefined
    if (failed) {
      return { ok: false, error: failed.message ?? 'Expo push rejected the token' }
    }

    const id = rows.find((r) => r.id)?.id
    return { ok: true, providerMessageId: id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
