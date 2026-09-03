import type { AppContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { emailProvider, smsProvider } from '@/server/providers'
import { sendParentMessage } from '@/server/messaging/send'
import { tenantEmailProvider } from '@/server/mail/smtp'

export type NotificationChannelValue = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH'

export type NotifyInput = {
  userIds: string[]
  eventKey: string
  title: string
  body: string
  linkUrl?: string
  data?: Record<string, unknown>
  /** Defaults to in-app only; other channels are queued for the worker. */
  channels?: NotificationChannelValue[]
}

/**
 * Notification engine.
 *
 * In-app notifications are written synchronously so the bell count is correct
 * the moment an action completes. Everything that leaves the building (email,
 * SMS, WhatsApp, push) is queued as a durable Job instead, because a fee
 * collection must not fail or hang because an SMS vendor is slow.
 *
 * Delivery rows are created up front in QUEUED state, so an undelivered
 * notification is visible rather than silently lost.
 */
export async function notify(ctx: AppContext, input: NotifyInput): Promise<void> {
  const recipients = [...new Set(input.userIds)].filter(Boolean)
  if (recipients.length === 0) return

  const channels = input.channels ?? ['IN_APP']
  const external = channels.filter((c) => c !== 'IN_APP')
  const queued: string[] = []

  try {
    await prisma.$transaction(async (tx) => {
      for (const userId of recipients) {
        const notification = await tx.notification.create({
          data: {
            tenantId: ctx.tenant.id,
            userId,
            eventKey: input.eventKey,
            title: input.title,
            body: input.body,
            linkUrl: input.linkUrl ?? null,
            data: (input.data ?? null) as never,
          },
        })

        if (external.length === 0) continue
        queued.push(notification.id)

        await tx.notificationDelivery.createMany({
          data: external.map((channel) => ({
            tenantId: ctx.tenant.id,
            notificationId: notification.id,
            channel,
          })),
        })

        await tx.job.create({
          data: {
            tenantId: ctx.tenant.id,
            queue: 'notifications',
            name: 'notification.send',
            payload: { notificationId: notification.id, channels: external } as never,
          },
        })
      }
    })
  } catch (err) {
    // A failed notification must never roll back the action that caused it.
    console.error('[notifications] failed to enqueue', { eventKey: input.eventKey, err })
    return
  }

  // Deliver small batches now rather than leaving them for a worker.
  //
  // The Job rows above are the durable record and the retry path, but nothing
  // drains that queue yet. A leave approval or a message to one colleague
  // should not wait for a worker that does not exist, so a handful of
  // recipients are attempted inline; anything larger stays queued rather than
  // holding a request open while a mail server works through a class list.
  if (queued.length > 0 && queued.length <= INLINE_DELIVERY_LIMIT) {
    await Promise.allSettled(queued.map((id) => deliverNotification(id)))
  }
}

/** Above this many recipients, delivery is left to the queue. */
const INLINE_DELIVERY_LIMIT = 25

/**
 * Processes one queued notification job. Called by the worker; exported here so
 * the dispatch logic lives with the rest of the engine rather than in the
 * worker script.
 */
export async function deliverNotification(notificationId: string): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      user: { select: { email: true, phone: true, firstName: true } },
      deliveries: { where: { status: 'QUEUED' } },
    },
  })
  if (!notification) return

  for (const delivery of notification.deliveries) {
    let result = { ok: false, providerMessageId: undefined as string | undefined, error: 'Unsupported channel' as string | undefined }
    let deliveredVia: string | null = null

    try {
      if (delivery.channel === 'EMAIL' && notification.user.email) {
        // The school's own mail server when it has connected one, the
        // platform sender otherwise. Resolved per notification because the
        // answer belongs to the tenant, not to the process.
        const provider = notification.tenantId
          ? await tenantEmailProvider(notification.tenantId)
          : emailProvider()
        const r = await provider.send({
          to: notification.user.email,
          subject: notification.title,
          html: `<p>${escapeHtml(notification.body)}</p>`,
          text: notification.body,
        })
        result = { ok: r.ok, providerMessageId: r.providerMessageId, error: r.error }
      } else if (delivery.channel === 'WHATSAPP' && notification.user.phone) {
        const r = await sendParentMessage({
          to: notification.user.phone,
          body: `${notification.title}\n\n${notification.body}`,
        })
        result = {
          ok: r.ok,
          providerMessageId: r.providerMessageId,
          error: r.ok ? undefined : r.error,
        }
        deliveredVia = r.channel ?? 'whatsapp'
        if (r.ok && r.channel === 'sms' && r.failedWhatsApp) {
          console.warn('[notifications] WhatsApp failed; delivered by SMS', {
            notificationId: notification.id,
            error: r.failedWhatsApp,
          })
        }
      } else if (delivery.channel === 'SMS' && notification.user.phone) {
        const r = await smsProvider().send({
          to: notification.user.phone,
          body: `${notification.title}: ${notification.body}`,
        })
        result = { ok: r.ok, providerMessageId: r.providerMessageId, error: r.error }
      } else {
        result = { ok: false, providerMessageId: undefined, error: 'No address for this channel' }
      }
    } catch (err) {
      result = { ok: false, providerMessageId: undefined, error: String(err) }
    }

    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: result.ok ? 'SENT' : 'FAILED',
        provider: result.ok ? (deliveredVia ?? delivery.channel.toLowerCase()) : null,
        providerMessageId: result.providerMessageId ?? null,
        attempts: { increment: 1 },
        lastError: result.ok ? null : (result.error ?? 'Unknown error'),
        sentAt: result.ok ? new Date() : null,
      },
    })
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function markNotificationsRead(ctx: AppContext, ids?: string[]): Promise<number> {
  const result = await ctx.db.notification.updateMany({
    where: {
      userId: ctx.user.userId,
      readAt: null,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  })
  return result.count
}

export async function listNotifications(ctx: AppContext, limit = 30) {
  return ctx.db.notification.findMany({
    where: { userId: ctx.user.userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      eventKey: true,
      title: true,
      body: true,
      linkUrl: true,
      readAt: true,
      createdAt: true,
    },
  })
}
