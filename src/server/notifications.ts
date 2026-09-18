import type { AppContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { emailProvider, smsProvider } from '@/server/providers'
import { sendParentMessage } from '@/server/messaging/send'
import { tenantEmailProvider } from '@/server/mail/smtp'
import { isExpoPushEndpoint, sendExpoPush } from '@/server/modules/push/service'

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

export type NotificationDeliveryResult = {
  attempted: number
  sent: number
  failed: number
  skipped: number
}

/**
 * Notification engine.
 *
 * In-app notifications are written synchronously so the bell count is correct
 * the moment an action completes. Everything that leaves the building (email,
 * SMS, WhatsApp, push) is queued as a durable Job instead, because a fee
 * collection must not fail or hang because an SMS vendor is slow.
 *
 * If the recipient has a registered push device, PUSH is queued automatically
 * even when the caller only asked for IN_APP — that is what makes the phone
 * feel live without every call site listing the channel.
 */
export async function notify(ctx: AppContext, input: NotifyInput): Promise<void> {
  return notifyTenant(ctx.tenant.id, input)
}

/** Server-job variant for trusted background work that already resolved tenant ownership. */
export async function notifyTenant(tenantId: string, input: NotifyInput): Promise<void> {
  const recipients = [...new Set(input.userIds)].filter(Boolean)
  if (recipients.length === 0) return

  const channels = input.channels ?? ['IN_APP']
  const baseExternal = channels.filter((c) => c !== 'IN_APP')

  try {
    await prisma.$transaction(async (tx) => {
      for (const userId of recipients) {
        const notification = await tx.notification.create({
          data: {
            tenantId,
            userId,
            eventKey: input.eventKey,
            title: input.title,
            body: input.body,
            linkUrl: input.linkUrl ?? null,
            data: (input.data ?? null) as never,
          },
        })

        const hasPush = await tx.pushSubscription.count({
          where: { tenantId, userId },
        })
        const external = [...baseExternal]
        if (hasPush > 0 && !external.includes('PUSH')) external.push('PUSH')

        if (external.length === 0) continue

        await tx.notificationDelivery.createMany({
          data: external.map((channel) => ({
            tenantId,
            notificationId: notification.id,
            channel,
          })),
        })

        await tx.job.create({
          data: {
            tenantId,
            queue: 'notifications',
            name: 'notification.send',
            payload: { notificationId: notification.id, channels: external } as never,
          },
        })
      }
    })
  } catch (err) {
    console.error('[notifications] failed to enqueue', { eventKey: input.eventKey, err })
    return
  }
}

/**
 * Processes one queued notification job. Called by the worker; exported here so
 * the dispatch logic lives with the rest of the engine rather than in the
 * worker script.
 */
export async function deliverNotification(
  notificationId: string,
): Promise<NotificationDeliveryResult> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      user: { select: { email: true, phone: true, firstName: true } },
      deliveries: { where: { status: { in: ['QUEUED', 'FAILED'] } } },
    },
  })
  if (!notification) return { attempted: 0, sent: 0, failed: 0, skipped: 0 }

  const summary: NotificationDeliveryResult = {
    attempted: notification.deliveries.length,
    sent: 0,
    failed: 0,
    skipped: 0,
  }
  for (const delivery of notification.deliveries) {
    let result = {
      ok: false,
      providerMessageId: undefined as string | undefined,
      error: 'Unsupported channel' as string | undefined,
    }
    let deliveredVia: string | null = null
    let shouldRetry = true

    try {
      if (delivery.channel === 'EMAIL' && notification.user.email) {
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
      } else if (delivery.channel === 'PUSH') {
        const subs = await prisma.pushSubscription.findMany({
          where: { tenantId: notification.tenantId, userId: notification.userId },
          select: { endpoint: true },
        })
        const expoTokens = subs.map((s) => s.endpoint).filter(isExpoPushEndpoint)
        if (expoTokens.length === 0) {
          result = {
            ok: false,
            error: 'No Expo push token for this user',
            providerMessageId: undefined,
          }
          shouldRetry = false
        } else {
          const deepLink = mobileDeepLink(notification.linkUrl, notification.eventKey)
          const r = await sendExpoPush(
            expoTokens.map((to) => ({
              to,
              title: notification.title,
              body: notification.body,
              data: {
                eventKey: notification.eventKey,
                linkUrl: notification.linkUrl,
                href: deepLink,
                notificationId: notification.id,
              },
            })),
          )
          result = {
            ok: r.ok,
            providerMessageId: r.providerMessageId,
            error: r.error,
          }
          deliveredVia = 'expo'
        }
      } else {
        result = { ok: false, providerMessageId: undefined, error: 'No address for this channel' }
        shouldRetry = false
      }
    } catch (err) {
      result = { ok: false, providerMessageId: undefined, error: String(err) }
    }

    const status = result.ok ? 'SENT' : shouldRetry ? 'FAILED' : 'SKIPPED'
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status,
        provider: result.ok ? (deliveredVia ?? delivery.channel.toLowerCase()) : null,
        providerMessageId: result.providerMessageId ?? null,
        attempts: { increment: 1 },
        lastError: result.ok ? null : (result.error ?? 'Unknown error'),
        sentAt: result.ok ? new Date() : null,
      },
    })

    if (status === 'SENT') summary.sent += 1
    else if (status === 'FAILED') summary.failed += 1
    else summary.skipped += 1
  }

  return summary
}

/**
 * Maps web-relative notification links to expo-router paths the phone opens.
 * Leave pending, fees/dues, exams, and notices are the daily-ops targets.
 */
export function mobileDeepLink(linkUrl: string | null | undefined, eventKey?: string): string {
  const path = (linkUrl ?? '').split('?')[0] || ''

  if (path.startsWith('/leave') || eventKey?.startsWith('leave.')) return '/(app)/leave'
  if (path.startsWith('/finance') || eventKey?.startsWith('fee.')) return '/(app)/fees'
  if (path.includes('/notices') || eventKey === 'notice.published') return '/(app)/notices'
  if (
    path.includes('/exams') ||
    path.includes('/exam') ||
    eventKey?.startsWith('result.') ||
    eventKey?.startsWith('exam.')
  ) {
    return '/(app)/exams'
  }
  if (path.includes('/homework')) return '/(app)/homework'
  if (path.includes('/attendance')) return '/(app)/attendance'
  if (path.includes('/admissions')) return '/(app)/admissions'
  return '/(app)'
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
