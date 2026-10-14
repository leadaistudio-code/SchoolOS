import { z } from 'zod'
import { Prisma, type WhatsAppOutboxStatus, type WhatsAppReceiptConfig } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { tenantDb } from '@/server/db/tenant-client'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { audit } from '@/server/audit'
import { decryptSecret, encryptSecret, randomToken, sha256 } from '@/server/crypto'
import { platformUrl } from '@/server/tenant'
import { accountingEnvSwitches, getAccountingFlags, saveAccountingSettings } from '@/server/modules/accounting/service'
import { MAX_ATTEMPTS, maskNumber, receiptEventKey, toWhatsAppNumber } from './pure'

/**
 * WhatsApp notification service for fee receipts.
 *
 * Fee code calls one function, `queueFeeReceiptWhatsApp`, after a payment has
 * committed. Everything else - the school's provider, consent, the outbox and
 * the worker - lives here, so fee logic never sees a provider.
 */

export const OUTBOX_QUEUE = 'whatsapp'
export const OUTBOX_JOB = 'whatsapp.receipt'
export const PAGE_SIZE = 25

/* ----------------------------------------------------------------- config */

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined)

export const receiptConfigSchema = z.object({
  provider: z.enum(['META_CLOUD', 'AISENSY']),
  phoneNumberId: optionalText(40).refine((v) => !v || /^\d{5,30}$/.test(v), 'Phone number id is digits only'),
  templateName: optionalText(512).refine((v) => !v || /^[a-z0-9_]+$/.test(v), 'Template names use lowercase letters, digits and _'),
  templateLanguage: z.string().trim().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, 'Use a language code such as en or en_US').default('en'),
  campaignName: optionalText(200),
  // Blank means "keep the saved value": the form never receives secrets back.
  accessToken: optionalText(2000),
  appSecret: optionalText(200),
  apiKey: optionalText(4000),
})

export type ConfigCheck = { complete: boolean; missing: string[] }

export function checkConfig(row: Pick<WhatsAppReceiptConfig,
  'provider' | 'phoneNumberId' | 'templateName' | 'campaignName' | 'accessTokenEncrypted' | 'appSecretEncrypted' | 'apiKeyEncrypted'> | null): ConfigCheck {
  if (!row) return { complete: false, missing: ['provider'] }
  const missing: string[] = []
  if (row.provider === 'META_CLOUD') {
    if (!row.phoneNumberId) missing.push('phone number id')
    if (!row.templateName) missing.push('template name')
    if (!row.accessTokenEncrypted) missing.push('access token')
    if (!row.appSecretEncrypted) missing.push('app secret (to verify delivery updates)')
  } else {
    if (!row.campaignName) missing.push('API campaign name')
    if (!row.apiKeyEncrypted) missing.push('API key')
  }
  return { complete: missing.length === 0, missing }
}

export function statusWebhookUrl(key: string) {
  return platformUrl(`/api/v1/whatsapp/receipts/status/${key}`)
}

export async function getReceiptSettings(ctx: AppContext) {
  ctx.require('accounts.view')
  const [flags, row] = await Promise.all([
    getAccountingFlags(ctx.db),
    ctx.db.whatsAppReceiptConfig.findFirst(),
  ])
  const canConfigure = ctx.can('settings.integrations')
  return {
    flags,
    canConfigure,
    canToggle: ctx.can('accounts.manage'),
    check: checkConfig(row),
    config: row
      ? {
          provider: row.provider,
          phoneNumberId: row.phoneNumberId,
          templateName: row.templateName,
          templateLanguage: row.templateLanguage,
          campaignName: row.campaignName,
          hasAccessToken: !!row.accessTokenEncrypted,
          hasAppSecret: !!row.appSecretEncrypted,
          hasApiKey: !!row.apiKeyEncrypted,
          updatedAt: row.updatedAt,
          // The URL carries a secret, so only people who manage integrations see it.
          webhookUrl: canConfigure ? statusWebhookUrl(decryptSecret(row.webhookKeyEncrypted)) : null,
        }
      : null,
  }
}

export async function saveReceiptConfig(ctx: AppContext, input: z.infer<typeof receiptConfigSchema>) {
  ctx.require('settings.integrations')
  const existing = await ctx.db.whatsAppReceiptConfig.findFirst()
  const providerChanged = !!existing && existing.provider !== input.provider
  const secret = (value: string | undefined, saved: string | null | undefined) =>
    value ? encryptSecret(value) : providerChanged ? null : (saved ?? null)

  const data = {
    provider: input.provider,
    phoneNumberId: input.provider === 'META_CLOUD' ? (input.phoneNumberId ?? null) : null,
    templateName: input.provider === 'META_CLOUD' ? (input.templateName ?? null) : null,
    templateLanguage: input.templateLanguage,
    campaignName: input.provider === 'AISENSY' ? (input.campaignName ?? null) : null,
    accessTokenEncrypted: input.provider === 'META_CLOUD' ? secret(input.accessToken, existing?.accessTokenEncrypted) : null,
    appSecretEncrypted: input.provider === 'META_CLOUD' ? secret(input.appSecret, existing?.appSecretEncrypted) : null,
    apiKeyEncrypted: input.provider === 'AISENSY' ? secret(input.apiKey, existing?.apiKeyEncrypted) : null,
    updatedById: ctx.user.userId,
  }

  if (existing) {
    await ctx.db.whatsAppReceiptConfig.update({ where: { id: existing.id }, data })
  } else {
    const key = randomToken(24)
    await ctx.db.whatsAppReceiptConfig.create({
      data: { tenantId: ctx.tenant.id, ...data, webhookKeyHash: sha256(key), webhookKeyEncrypted: encryptSecret(key) },
    })
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'whatsapp_receipts.config.save',
    module: 'accounting',
    entityType: 'WhatsAppReceiptConfig',
    // Which secrets changed, never their values.
    summary: `Saved WhatsApp receipt settings (${input.provider === 'META_CLOUD' ? 'Meta Cloud API' : 'AiSensy'})` +
      `${[input.accessToken && 'access token', input.appSecret && 'app secret', input.apiKey && 'API key'].filter(Boolean).map((s) => `, new ${s}`).join('')}`,
  })
}

/** The school's switch. It can only be turned on once the provider settings are complete. */
export async function setWhatsAppReceipts(ctx: AppContext, raw: unknown) {
  ctx.require('accounts.manage')
  const { enabled } = z.object({ enabled: z.boolean() }).parse(raw)
  if (enabled) {
    if (!accountingEnvSwitches().whatsappReceipts) throw conflict('WhatsApp receipts are not available on this deployment')
    const check = checkConfig(await ctx.db.whatsAppReceiptConfig.findFirst())
    if (!check.complete) throw conflict(`Finish the WhatsApp settings first: ${check.missing.join(', ')}`)
  }
  await saveAccountingSettings(ctx, { whatsappReceiptsEnabled: enabled })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: enabled ? 'whatsapp_receipts.enable' : 'whatsapp_receipts.disable',
    module: 'accounting',
    entityType: 'AccountingSettings',
    summary: enabled ? 'Switched on WhatsApp fee receipts' : 'Switched off WhatsApp fee receipts',
  })
  return { enabled }
}

/** Issues a new status-callback secret; the old URL stops working at once. */
export async function rotateWebhookKey(ctx: AppContext) {
  ctx.require('settings.integrations')
  const existing = await ctx.db.whatsAppReceiptConfig.findFirst()
  if (!existing) throw notFound('WhatsApp receipt settings')
  const key = randomToken(24)
  await ctx.db.whatsAppReceiptConfig.update({
    where: { id: existing.id },
    data: { webhookKeyHash: sha256(key), webhookKeyEncrypted: encryptSecret(key), updatedById: ctx.user.userId },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'whatsapp_receipts.webhook.rotate',
    module: 'accounting',
    entityType: 'WhatsAppReceiptConfig',
    summary: 'Issued a new WhatsApp delivery-status URL',
  })
}

/** Decrypted settings for the worker. Server-side only. */
export async function loadSendingConfig(tenantId: string) {
  const row = await tenantDb(tenantId).whatsAppReceiptConfig.findFirst()
  const check = checkConfig(row)
  if (!row || !check.complete) return { ok: false as const, missing: check.missing }
  return {
    ok: true as const,
    provider: row.provider,
    phoneNumberId: row.phoneNumberId,
    templateName: row.templateName,
    templateLanguage: row.templateLanguage,
    campaignName: row.campaignName,
    accessToken: row.accessTokenEncrypted ? decryptSecret(row.accessTokenEncrypted) : null,
    apiKey: row.apiKeyEncrypted ? decryptSecret(row.apiKeyEncrypted) : null,
  }
}

/* ---------------------------------------------------------------- consent */

export const consentSchema = z.object({
  phone: z.string().trim().min(10).max(20),
  status: z.enum(['OPTED_IN', 'OPTED_OUT']),
  source: z.enum(['form', 'verbal', 'parent_request']),
  note: optionalText(300),
})

export const CONSENT_SOURCES: Record<string, string> = {
  form: 'Signed form',
  verbal: 'Told the office',
  parent_request: 'Parent asked',
  reply_stop: 'Replied STOP',
  reply_start: 'Replied START',
}

export async function setConsent(ctx: AppContext, input: z.infer<typeof consentSchema>) {
  ctx.require('fees.collect')
  const phone = toWhatsAppNumber(input.phone)
  if (!phone) throw badRequest('Enter a full mobile number')
  await writeConsent(ctx.tenant.id, phone, input.status, input.source, input.note ?? null, ctx.user.userId)
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: input.status === 'OPTED_IN' ? 'whatsapp_receipts.consent.opt_in' : 'whatsapp_receipts.consent.opt_out',
    module: 'accounting',
    entityType: 'WhatsAppConsent',
    summary: `${input.status === 'OPTED_IN' ? 'Recorded WhatsApp receipt consent' : 'Recorded WhatsApp receipt opt-out'} for ${maskNumber(phone)} (${CONSENT_SOURCES[input.source]})`,
  })
}

export async function writeConsent(
  tenantId: string,
  phone: string,
  status: 'OPTED_IN' | 'OPTED_OUT',
  source: string,
  note: string | null,
  recordedById: string | null,
) {
  const now = new Date()
  const stamp = status === 'OPTED_IN' ? { optedInAt: now } : { optedOutAt: now }
  await tenantDb(tenantId).whatsAppConsent.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    create: { tenantId, phone, status, source, note, recordedById, ...stamp },
    update: { status, source, note, recordedById, ...stamp },
  })
}

/** Students with their receipt recipient and that number's consent, for the consent list. */
export async function listRecipients(ctx: AppContext, raw: { q?: string; page?: string }) {
  ctx.require('accounts.view')
  const page = Math.max(1, Math.min(10_000, Number(raw.page) || 1))
  const q = raw.q?.trim().slice(0, 80)
  const where: Prisma.StudentWhereInput = {
    deletedAt: null,
    status: 'ACTIVE',
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { admissionNo: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
  const [total, students] = await Promise.all([
    ctx.db.student.count({ where }),
    ctx.db.student.findMany({
      where,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, firstName: true, lastName: true, admissionNo: true, guardians: guardianSelect },
    }),
  ])
  const rows = students.map((s) => {
    const r = pickRecipient(s.guardians)
    return { studentId: s.id, studentName: `${s.firstName} ${s.lastName}`, admissionNo: s.admissionNo, recipient: r }
  })
  const phones = rows.flatMap((r) => (r.recipient ? [r.recipient.phone] : []))
  const consents = phones.length
    ? await ctx.db.whatsAppConsent.findMany({ where: { phone: { in: phones } } })
    : []
  const byPhone = new Map(consents.map((c) => [c.phone, c]))
  return {
    page,
    pageSize: PAGE_SIZE,
    total,
    canEdit: ctx.can('fees.collect'),
    rows: rows.map((r) => {
      const c = r.recipient ? byPhone.get(r.recipient.phone) : undefined
      return {
        ...r,
        recipient: r.recipient ? { name: r.recipient.name, phone: r.recipient.phone, masked: maskNumber(r.recipient.phone) } : null,
        consent: c ? { status: c.status, source: CONSENT_SOURCES[c.source] ?? c.source, at: c.status === 'OPTED_IN' ? c.optedInAt : c.optedOutAt } : null,
      }
    }),
  }
}

/* -------------------------------------------------------------- recipient */

const guardianSelect = {
  orderBy: [{ isPrimary: 'desc' as const }, { id: 'asc' as const }],
  select: { isPrimary: true, parent: { select: { firstName: true, lastName: true, phone: true, deletedAt: true } } },
}

type GuardianRow = { isPrimary: boolean; parent: { firstName: string; lastName: string; phone: string | null; deletedAt: Date | null } }

/** The primary guardian, or else the first guardian with a usable number. */
export function pickRecipient(guardians: GuardianRow[]): { phone: string; name: string } | null {
  for (const g of guardians) {
    if (g.parent.deletedAt) continue
    const phone = toWhatsAppNumber(g.parent.phone)
    if (phone) return { phone, name: `${g.parent.firstName} ${g.parent.lastName}`.trim() }
  }
  return null
}

/* ------------------------------------------------------------------ queue */

export type QueueOutcome =
  | { queued: true; outboxId: string }
  | { queued: false; reason: 'disabled' | 'not_settled' | 'duplicate' | 'skipped'; outboxId?: string; detail?: string }

type Prepared =
  | { status: 'QUEUED'; toPhone: string; provider: WhatsAppReceiptConfig['provider'] }
  | { status: 'SKIPPED'; reason: string; toPhone: string | null; provider: WhatsAppReceiptConfig['provider'] | null }

/** Who the message goes to and whether it may be sent, checked from the database alone. */
async function prepare(tenantId: string, studentId: string): Promise<Prepared> {
  const db = tenantDb(tenantId)
  const [student, config] = await Promise.all([
    db.student.findFirst({ where: { id: studentId }, select: { guardians: guardianSelect } }),
    db.whatsAppReceiptConfig.findFirst(),
  ])
  const check = checkConfig(config)
  const provider = config?.provider ?? null
  if (!check.complete) return { status: 'SKIPPED', reason: `Not configured: ${check.missing.join(', ')}`, toPhone: null, provider }
  const recipient = student ? pickRecipient(student.guardians) : null
  if (!recipient) return { status: 'SKIPPED', reason: 'No guardian mobile number', toPhone: null, provider }
  const consent = await db.whatsAppConsent.findFirst({ where: { phone: recipient.phone }, select: { status: true } })
  if (consent?.status !== 'OPTED_IN') {
    return {
      status: 'SKIPPED',
      reason: consent?.status === 'OPTED_OUT' ? 'Parent opted out' : 'No WhatsApp consent recorded',
      toPhone: recipient.phone,
      provider,
    }
  }
  return { status: 'QUEUED', toPhone: recipient.phone, provider: config!.provider }
}

/**
 * Queues the receipt message for a payment that has committed as settled.
 * Safe to call any number of times: the outbox holds one row per receipt.
 * Never throws - a fee collection must not fail because of WhatsApp.
 */
export async function queueFeeReceiptWhatsApp(tenantId: string, paymentId: string): Promise<QueueOutcome> {
  try {
    const db = tenantDb(tenantId)
    const flags = await getAccountingFlags(db)
    if (!flags.whatsappReceipts) return { queued: false, reason: 'disabled' }

    // Status and amount come from the committed row, never from the caller.
    const payment = await db.feePayment.findFirst({
      where: { id: paymentId },
      select: { id: true, status: true, studentId: true, receipt: { select: { id: true } } },
    })
    if (!payment || payment.status !== 'SUCCESS' || !payment.receipt) return { queued: false, reason: 'not_settled' }

    const eventKey = receiptEventKey(payment.receipt.id)
    const existing = await db.whatsAppOutbox.findFirst({ where: { eventKey }, select: { id: true } })
    if (existing) return { queued: false, reason: 'duplicate', outboxId: existing.id }

    const prepared = await prepare(tenantId, payment.studentId)
    const outboxId = await prisma.$transaction(async (tx) => {
      const row = await tx.whatsAppOutbox.create({
        data: {
          tenantId,
          eventKey,
          paymentId: payment.id,
          receiptId: payment.receipt!.id,
          studentId: payment.studentId,
          toPhone: prepared.toPhone,
          provider: prepared.provider,
          status: prepared.status,
          lastError: prepared.status === 'SKIPPED' ? prepared.reason : null,
        },
        select: { id: true },
      })
      if (prepared.status === 'QUEUED') {
        await tx.job.create({
          data: { tenantId, queue: OUTBOX_QUEUE, name: OUTBOX_JOB, maxAttempts: MAX_ATTEMPTS, payload: { outboxId: row.id, tenantId } },
        })
      }
      return row.id
    })
    return prepared.status === 'QUEUED'
      ? { queued: true, outboxId }
      : { queued: false, reason: 'skipped', outboxId, detail: prepared.reason }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { queued: false, reason: 'duplicate' }
    }
    console.error('[whatsapp-receipts] queue failed', { tenantId, paymentId, error: error instanceof Error ? error.message : 'unknown' })
    return { queued: false, reason: 'skipped', detail: 'Could not queue' }
  }
}

/* ------------------------------------------------------------------ retry */

const RETRYABLE_BY_STAFF: WhatsAppOutboxStatus[] = ['FAILED', 'DEAD', 'SKIPPED']

/**
 * Sends a failed, given-up or skipped message again. Recipient, consent and
 * settings are checked afresh, and a message already accepted by WhatsApp
 * can never be retried.
 */
export async function retryOutbox(ctx: AppContext, id: string) {
  ctx.require('accounts.manage')
  const row = await ctx.db.whatsAppOutbox.findFirst({ where: { id } })
  if (!row) throw notFound('Message')
  if (!RETRYABLE_BY_STAFF.includes(row.status)) {
    throw conflict(row.status === 'SENDING' || row.status === 'QUEUED' ? 'This message is already being sent' : 'This message was already sent')
  }
  const flags = await getAccountingFlags(ctx.db)
  if (!flags.whatsappReceipts) throw conflict('WhatsApp receipts are switched off')
  if (row.paymentId) {
    const payment = await ctx.db.feePayment.findFirst({ where: { id: row.paymentId }, select: { status: true } })
    if (payment?.status !== 'SUCCESS') throw conflict('The payment is no longer settled, so its receipt cannot be sent')
  }
  const prepared = row.studentId ? await prepare(ctx.tenant.id, row.studentId) : null
  if (!prepared || prepared.status === 'SKIPPED') throw conflict(prepared?.reason ?? 'No student on this message')

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.whatsAppOutbox.updateMany({
      where: { id: row.id, tenantId: ctx.tenant.id, status: row.status },
      data: { status: 'QUEUED', attempts: 0, lastError: null, failedAt: null, toPhone: prepared.toPhone, provider: prepared.provider },
    })
    if (claimed.count !== 1) throw conflict('Someone else changed this message; refresh and try again')
    await tx.job.create({
      data: { tenantId: ctx.tenant.id, queue: OUTBOX_QUEUE, name: OUTBOX_JOB, maxAttempts: MAX_ATTEMPTS, payload: { outboxId: row.id, tenantId: ctx.tenant.id } },
    })
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'whatsapp_receipts.retry',
    module: 'accounting',
    entityType: 'WhatsAppOutbox',
    entityId: row.id,
    summary: `Queued the WhatsApp receipt again (was ${row.status.toLowerCase()}${row.lastError ? `: ${row.lastError}` : ''})`,
  })
}

/* ---------------------------------------------------------------- listing */

export const OUTBOX_FILTERS = ['all', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'DEAD', 'SKIPPED'] as const

export async function listOutbox(ctx: AppContext, raw: { status?: string; page?: string }) {
  ctx.require('accounts.view')
  const status = (OUTBOX_FILTERS as readonly string[]).includes(raw.status ?? '') && raw.status !== 'all'
    ? (raw.status as WhatsAppOutboxStatus)
    : null
  const page = Math.max(1, Math.min(10_000, Number(raw.page) || 1))
  const where = status ? { status } : {}
  const [total, rows, counts] = await Promise.all([
    ctx.db.whatsAppOutbox.count({ where }),
    ctx.db.whatsAppOutbox.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    ctx.db.whatsAppOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  const receiptIds = rows.flatMap((r) => (r.receiptId ? [r.receiptId] : []))
  const studentIds = rows.flatMap((r) => (r.studentId ? [r.studentId] : []))
  const [receipts, students] = await Promise.all([
    receiptIds.length ? ctx.db.feeReceipt.findMany({ where: { id: { in: receiptIds } }, select: { id: true, number: true, paymentId: true } }) : [],
    studentIds.length ? ctx.db.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
  ])
  const receiptById = new Map(receipts.map((r) => [r.id, r]))
  const studentById = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`]))
  return {
    status: status ?? 'all',
    page,
    pageSize: PAGE_SIZE,
    total,
    canRetry: ctx.can('accounts.manage'),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<WhatsAppOutboxStatus, number>>,
    rows: rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      sentAt: r.sentAt,
      deliveredAt: r.deliveredAt,
      readAt: r.readAt,
      attempts: r.attempts,
      lastError: r.lastError,
      provider: r.provider,
      dryRun: !!r.providerMessageId?.startsWith('dryrun_'),
      to: maskNumber(r.toPhone),
      receipt: r.receiptId ? receiptById.get(r.receiptId) ?? null : null,
      student: r.studentId ? studentById.get(r.studentId) ?? null : null,
      retryable: RETRYABLE_BY_STAFF.includes(r.status),
    })),
  }
}
