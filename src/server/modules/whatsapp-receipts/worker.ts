import { Prisma, type WhatsAppOutbox } from '@prisma/client'
import { env } from '@/lib/env'
import { prisma } from '@/server/db/prisma'
import { tenantDb } from '@/server/db/tenant-client'
import { tenantUrl } from '@/server/tenant'
import { getAccountingFlags } from '@/server/modules/accounting/service'
import {
  LINK_TTL_DAYS,
  MAX_ATTEMPTS,
  SWEEP_WINDOW_HOURS,
  receiptLinkKey,
  receiptParams,
  signReceiptToken,
} from './pure'
import {
  aiSensyProvider,
  dryRunProvider,
  liveSendAllowed,
  metaCloudApiProvider,
  type FetchLike,
  type ReceiptWhatsAppProvider,
} from './providers'
import { loadSendingConfig, pickRecipient, queueFeeReceiptWhatsApp } from './service'

/**
 * Notification outbox worker: sends one queued receipt message.
 *
 * The row is claimed QUEUED/FAILED → SENDING before the provider is called.
 * A row found already SENDING means an earlier attempt stopped mid-call: the
 * provider may have accepted it, so it is never resent automatically - it is
 * parked for a person to check and retry.
 */

export type ProcessOutcome =
  | { status: 'sent'; dryRun: boolean }
  | { status: 'retry'; error: string }
  | { status: 'dead' | 'skipped' | 'interrupted' | 'noop'; detail?: string }

export type ProcessDeps = { fetchImpl?: FetchLike; live?: boolean; now?: Date }

const INTERRUPTED = 'Interrupted while sending: WhatsApp may have delivered it. Check with the parent before retrying.'

function liveNow(): boolean {
  return liveSendAllowed({ nodeEnv: process.env.NODE_ENV, vitest: process.env.VITEST, dryRun: env().WHATSAPP_RECEIPTS_DRY_RUN })
}

async function finish(id: string, data: Prisma.WhatsAppOutboxUpdateManyMutationInput) {
  await prisma.whatsAppOutbox.updateMany({ where: { id, status: 'SENDING' }, data })
}

export async function processReceiptOutbox(outboxId: string, tenantId: string, deps: ProcessDeps = {}): Promise<ProcessOutcome> {
  const now = deps.now ?? new Date()
  const claimed = await prisma.$queryRaw<WhatsAppOutbox[]>(Prisma.sql`
    UPDATE "WhatsAppOutbox"
    SET "status" = CAST('SENDING' AS "WhatsAppOutboxStatus"), "attempts" = "attempts" + 1, "updatedAt" = NOW()
    WHERE "id" = ${outboxId} AND "tenantId" = ${tenantId}
      AND "status" IN (CAST('QUEUED' AS "WhatsAppOutboxStatus"), CAST('FAILED' AS "WhatsAppOutboxStatus"))
    RETURNING *`)
  const row = claimed[0]
  if (!row) {
    const current = await prisma.whatsAppOutbox.findFirst({ where: { id: outboxId, tenantId }, select: { status: true } })
    if (current?.status === 'SENDING') {
      await prisma.whatsAppOutbox.updateMany({
        where: { id: outboxId, tenantId, status: 'SENDING' },
        data: { status: 'DEAD', lastError: INTERRUPTED, failedAt: now },
      })
      return { status: 'interrupted' }
    }
    return { status: 'noop', detail: current?.status ?? 'missing' }
  }

  const skip = async (reason: string): Promise<ProcessOutcome> => {
    await finish(row.id, { status: 'SKIPPED', lastError: reason })
    return { status: 'skipped', detail: reason }
  }

  // Everything is checked again at send time: a switch, consent or payment
  // can change between queueing and sending.
  const db = tenantDb(tenantId)
  const flags = await getAccountingFlags(db)
  if (!flags.whatsappReceipts) return skip('WhatsApp receipts were switched off')

  const payment = row.paymentId
    ? await db.feePayment.findFirst({
        where: { id: row.paymentId },
        select: {
          status: true,
          amountMinor: true,
          currency: true,
          paidAt: true,
          receipt: { select: { id: true, number: true, issuedOn: true } },
          student: { select: { firstName: true, lastName: true, guardians: { orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }], select: { isPrimary: true, parent: { select: { firstName: true, lastName: true, phone: true, deletedAt: true } } } } } },
        },
      })
    : null
  if (!payment || payment.status !== 'SUCCESS' || !payment.receipt) return skip('The payment is no longer settled')

  const recipient = pickRecipient(payment.student.guardians)
  if (!recipient || recipient.phone !== row.toPhone) return skip('The guardian number changed; retry to use the new one')
  const consent = await db.whatsAppConsent.findFirst({ where: { phone: recipient.phone }, select: { status: true } })
  if (consent?.status !== 'OPTED_IN') return skip(consent?.status === 'OPTED_OUT' ? 'Parent opted out' : 'No WhatsApp consent recorded')

  const config = await loadSendingConfig(tenantId)
  if (!config.ok) return skip(`Not configured: ${config.missing.join(', ')}`)

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } })
  if (!tenant) return skip('School not found')

  const expiresAt = new Date(now.getTime() + LINK_TTL_DAYS * 86_400_000)
  const linkToken = signReceiptToken({ tenantId, receiptId: payment.receipt.id, expiresAt }, receiptLinkKey(env().AUTH_SECRET))
  const live = deps.live ?? liveNow()
  const provider: ReceiptWhatsAppProvider = !live
    ? dryRunProvider()
    : config.provider === 'META_CLOUD'
      ? metaCloudApiProvider({
          phoneNumberId: config.phoneNumberId!,
          accessToken: config.accessToken!,
          templateName: config.templateName!,
          language: config.templateLanguage,
          apiVersion: env().WHATSAPP_API_VERSION,
        }, deps.fetchImpl)
      : aiSensyProvider({ apiKey: config.apiKey!, campaignName: config.campaignName! }, deps.fetchImpl)

  const result = await provider.send({
    to: recipient.phone,
    params: receiptParams({
      studentName: `${payment.student.firstName} ${payment.student.lastName}`,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      receiptNumber: payment.receipt.number,
      paidOn: payment.paidAt ?? payment.receipt.issuedOn,
    }),
    linkToken,
    linkUrl: tenantUrl(tenant.slug, `/r/${linkToken}`),
    userName: recipient.name,
  })

  if (result.ok) {
    await finish(row.id, {
      status: 'SENT',
      provider: config.provider,
      providerMessageId: result.messageId,
      sentAt: now,
      linkExpiresAt: expiresAt,
      lastError: null,
      failedAt: null,
    })
    return { status: 'sent', dryRun: provider.name === 'dry_run' }
  }

  if (result.retryable && row.attempts < MAX_ATTEMPTS) {
    await finish(row.id, { status: 'FAILED', lastError: result.message, failedAt: now })
    return { status: 'retry', error: result.message }
  }
  await finish(row.id, { status: 'DEAD', lastError: result.message, failedAt: now })
  // Logged without the number, the message or any token.
  console.warn('[whatsapp-receipts] gave up', { outboxId: row.id, code: result.code, attempts: row.attempts })
  return { status: 'dead', detail: result.code }
}

/**
 * Catches receipts whose queue step never ran (for example the server stopped
 * right after the payment committed). Only recent receipts, only schools with
 * receipts switched on, and only receipts issued after it was switched on.
 */
export async function sweepMissedReceipts(limit = 100): Promise<number> {
  const e = env()
  if (!e.ACCOUNTING_MODULE_ENABLED || !e.WHATSAPP_RECEIPTS_ENABLED) return 0
  const missed = await prisma.$queryRaw<{ tenantId: string; paymentId: string }[]>(Prisma.sql`
    SELECT r."tenantId", r."paymentId"
    FROM "FeeReceipt" r
    JOIN "FeePayment" p ON p."id" = r."paymentId" AND p."status" = CAST('SUCCESS' AS "PaymentStatus")
    JOIN "AccountingSettings" s ON s."tenantId" = r."tenantId" AND s."whatsappReceiptsEnabled" = true
    WHERE r."issuedOn" >= NOW() - (${SWEEP_WINDOW_HOURS} * INTERVAL '1 hour')
      AND r."issuedOn" < NOW() - INTERVAL '2 minutes'
      AND r."issuedOn" >= s."updatedAt"
      AND NOT EXISTS (
        SELECT 1 FROM "WhatsAppOutbox" o
        WHERE o."tenantId" = r."tenantId" AND o."eventKey" = 'fee_receipt:' || r."id"
      )
    ORDER BY r."issuedOn"
    LIMIT ${limit}`)
  let queued = 0
  for (const m of missed) {
    const outcome = await queueFeeReceiptWhatsApp(m.tenantId, m.paymentId)
    if (outcome.queued || outcome.reason === 'skipped') queued += 1
  }
  return queued
}
