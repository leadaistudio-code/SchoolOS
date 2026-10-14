import { prisma } from '@/server/db/prisma'
import { decryptSecret, sha256, timingSafeEqual } from '@/server/crypto'
import { metaSignatureValid } from '@/server/messaging/meta-signature'
import { audit } from '@/server/audit'
import { consentIntent, maskNumber, nextOutboxStatus, parseAiSensyWebhook, parseMetaWebhook } from './pure'
import { writeConsent } from './service'

/**
 * Delivery-status callbacks. The URL carries a per-school secret, looked up by
 * its hash. Meta callbacks must also carry a valid signature from the school's
 * app secret; AiSensy publishes no signature, so the URL secret is its proof.
 */

export type WebhookResult =
  | { http: 200; statuses: number; applied: number; replies: number; recognised: boolean }
  | { http: 403 | 404 }

async function configForKey(key: string) {
  if (!/^[\w-]{20,64}$/.test(key)) return null
  return prisma.whatsAppReceiptConfig.findUnique({ where: { webhookKeyHash: sha256(key) } })
}

/** Meta's subscription handshake: echo the challenge when the verify token is this URL's secret. */
export async function verifySubscription(key: string, params: URLSearchParams): Promise<string | null> {
  const config = await configForKey(key)
  if (!config || config.provider !== 'META_CLOUD') return null
  const token = params.get('hub.verify_token')
  if (params.get('hub.mode') !== 'subscribe' || !token || !timingSafeEqual(token, key)) return null
  return params.get('hub.challenge')
}

export async function handleStatusWebhook(key: string, rawBody: string, signature: string | null): Promise<WebhookResult> {
  const config = await configForKey(key)
  if (!config) return { http: 404 }
  const tenantId = config.tenantId

  if (config.provider === 'META_CLOUD') {
    const appSecret = config.appSecretEncrypted ? decryptSecret(config.appSecretEncrypted) : undefined
    if (!metaSignatureValid(rawBody, signature, appSecret)) return { http: 403 }
  }

  let body: unknown = null
  try {
    body = JSON.parse(rawBody)
  } catch {
    return { http: 200, statuses: 0, applied: 0, replies: 0, recognised: false }
  }
  const parsed = config.provider === 'META_CLOUD' ? parseMetaWebhook(body, config.phoneNumberId) : parseAiSensyWebhook(body)
  if (!parsed) return { http: 200, statuses: 0, applied: 0, replies: 0, recognised: false }

  let applied = 0
  for (const s of parsed.statuses) {
    const row = await prisma.whatsAppOutbox.findFirst({
      where: { tenantId, providerMessageId: s.messageId },
      select: { id: true, status: true, deliveredAt: true },
    })
    if (!row) continue
    const next = nextOutboxStatus(row.status, s.status)
    if (!next) continue
    const updated = await prisma.whatsAppOutbox.updateMany({
      where: { id: row.id, status: row.status },
      data: {
        status: next,
        ...(next === 'DELIVERED' ? { deliveredAt: s.at } : {}),
        ...(next === 'READ' ? { readAt: s.at, deliveredAt: row.deliveredAt ?? s.at } : {}),
        ...(next === 'DEAD' ? { failedAt: s.at, lastError: `Not delivered (${s.errorCode ?? 'provider failure'})` } : {}),
      },
    })
    applied += updated.count
  }

  for (const reply of parsed.replies) {
    const intent = consentIntent(reply.text)
    if (!intent) continue
    const status = intent === 'opt_out' ? 'OPTED_OUT' : 'OPTED_IN'
    await writeConsent(tenantId, reply.from, status, intent === 'opt_out' ? 'reply_stop' : 'reply_start', null, null)
    await audit({
      tenantId,
      actorLabel: 'WhatsApp reply',
      action: status === 'OPTED_IN' ? 'whatsapp_receipts.consent.opt_in' : 'whatsapp_receipts.consent.opt_out',
      module: 'accounting',
      entityType: 'WhatsAppConsent',
      summary: `${maskNumber(reply.from)} replied ${intent === 'opt_out' ? 'STOP' : 'START'} to WhatsApp receipts`,
    })
  }

  return { http: 200, statuses: parsed.statuses.length, applied, replies: parsed.replies.length, recognised: true }
}
