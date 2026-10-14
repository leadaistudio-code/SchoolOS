import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The deployment switches are read once by env(); set them before anything reads it.
const flagState = vi.hoisted(() => {
  const saved = { module: process.env.ACCOUNTING_MODULE_ENABLED, whatsapp: process.env.WHATSAPP_RECEIPTS_ENABLED }
  process.env.ACCOUNTING_MODULE_ENABLED = 'true'
  process.env.WHATSAPP_RECEIPTS_ENABLED = 'true'
  return { on: false, saved }
})

vi.mock('@/server/modules/accounting/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/server/modules/accounting/service')>()
  return {
    ...actual,
    getAccountingFlags: vi.fn(async () => ({ module: true, studentLedger: false, approvals: false, whatsappReceipts: flagState.on, fiscalYearStartMonth: 4 })),
  }
})

import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'
import { decryptSecret, hmacSha256 } from '../src/server/crypto'
import { receiptLinkKey, signReceiptToken, verifyReceiptToken } from '../src/server/modules/whatsapp-receipts/pure'
import type { FetchLike } from '../src/server/modules/whatsapp-receipts/providers'
import {
  getReceiptSettings,
  listOutbox,
  queueFeeReceiptWhatsApp,
  retryOutbox,
  saveReceiptConfig,
  setConsent,
  setWhatsAppReceipts,
} from '../src/server/modules/whatsapp-receipts/service'
import { processReceiptOutbox, sweepMissedReceipts } from '../src/server/modules/whatsapp-receipts/worker'
import { handleStatusWebhook, verifySubscription } from '../src/server/modules/whatsapp-receipts/webhook'
import { openReceiptLink } from '../src/server/modules/whatsapp-receipts/link'

/**
 * WhatsApp fee receipts against the database, in a throwaway school that is
 * deleted afterwards. Every provider call is a mocked fetch: nothing is sent.
 */
const prisma = new PrismaClient()
const TAG = `zzwa${Date.now().toString(36)}`
const APP_SECRET = 'test-app-secret'
const PHONE_ID = '1234567890'
const linkKey = () => receiptLinkKey(process.env.AUTH_SECRET!)

let tenantId: string
let admin: AppContext
let clerk: AppContext
let webhookKey: string
let n = 0
let skipSweep = false

function contextFor(id: string, held: string[]): AppContext {
  const set = new Set(held)
  return {
    user: {
      sessionId: 's_test', userId: 'u_test', tenantId: id, isSuperAdmin: false, firstName: 'WhatsApp', lastName: 'Tester',
      email: null, phone: null, avatarUrl: null, displayName: null, mustChangePassword: false, roleKeys: ['SCHOOL_ADMIN'],
      permissions: set, impersonatedById: null,
    },
    tenant: { id, name: 'Test School', currency: 'INR' } as never,
    db: tenantDb(id),
    can: (p: string) => set.has(p),
    canAny: (...ps: string[]) => ps.some((p) => set.has(p)),
    require: (p: string) => {
      if (!set.has(p)) throw new Error(`Missing permission: ${p}`)
    },
  }
}

function randomMobile() {
  return `9${Math.floor(100_000_000 + Math.random() * 899_999_999)}`
}

/** A student whose guardians have the given numbers (the first is primary), with one settled receipt. */
async function family(phones: (string | null)[], opts: { status?: 'SUCCESS' | 'PENDING'; issuedOn?: Date } = {}) {
  n += 1
  const student = await prisma.student.create({ data: { tenantId, admissionNo: `${TAG}-${n}`, firstName: 'Aarav', lastName: `Test${n}` } })
  for (const [i, phone] of phones.entries()) {
    const parent = await prisma.parent.create({ data: { tenantId, firstName: 'Priya', lastName: `Guardian${n}${i}`, phone } })
    await prisma.studentGuardian.create({ data: { tenantId, studentId: student.id, parentId: parent.id, isPrimary: i === 0 } })
  }
  const payment = await prisma.feePayment.create({
    data: { tenantId, studentId: student.id, amountMinor: 1_230_000, mode: 'CASH', status: opts.status ?? 'SUCCESS', provider: 'manual', paidAt: new Date('2026-10-13T20:00:00.000Z') },
  })
  const receipt = await prisma.feeReceipt.create({
    data: { tenantId, number: `${TAG}-R${n}`, paymentId: payment.id, ...(opts.issuedOn ? { issuedOn: opts.issuedOn } : {}) },
  })
  return { studentId: student.id, paymentId: payment.id, receiptId: receipt.id }
}

function outbox(id: string) {
  return prisma.whatsAppOutbox.findUniqueOrThrow({ where: { id } })
}

function jobsFor(outboxId: string) {
  return prisma.job.count({ where: { tenantId, queue: 'whatsapp', payload: { path: ['outboxId'], equals: outboxId } } })
}

const metaOk = (id: string): FetchLike => vi.fn<FetchLike>(async () => new Response(JSON.stringify({ messages: [{ id }] }), { status: 200 }))
const metaFails = (status: number, body: unknown): FetchLike => vi.fn<FetchLike>(async () => new Response(JSON.stringify(body), { status }))

function metaEnvelope(statuses: unknown[], messages: unknown[] = [], phoneNumberId = PHONE_ID) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: phoneNumberId }, statuses, messages } }] }],
  })
}
const sign = (raw: string, secret = APP_SECRET) => `sha256=${hmacSha256(raw, secret)}`

/** A queued, consented, sent message for webhook tests. */
async function sentMessage(messageId: string) {
  const phone = randomMobile()
  const f = await family([phone])
  await setConsent(admin, { phone, status: 'OPTED_IN', source: 'form' })
  const q = await queueFeeReceiptWhatsApp(tenantId, f.paymentId)
  if (!q.queued) throw new Error('expected a queued message')
  await processReceiptOutbox(q.outboxId, tenantId, { live: true, fetchImpl: metaOk(messageId) })
  return { ...f, outboxId: q.outboxId, phone: `91${phone}` }
}

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: TAG, name: `WhatsApp test ${TAG}` } })
  tenantId = tenant.id
  admin = contextFor(tenantId, ['accounts.view', 'accounts.manage', 'settings.integrations', 'fees.collect'])
  clerk = contextFor(tenantId, ['accounts.view'])
  // The sweeper scans every school; only run it when no real school has receipts switched on.
  skipSweep = (await prisma.accountingSettings.count({ where: { whatsappReceiptsEnabled: true } })) > 0
})

afterAll(async () => {
  // Test files share the worker process; later files must see the real switches.
  for (const [name, value] of [['ACCOUNTING_MODULE_ENABLED', flagState.saved.module], ['WHATSAPP_RECEIPTS_ENABLED', flagState.saved.whatsapp]] as const) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  if (tenantId) {
    await prisma.whatsAppOutbox.deleteMany({ where: { tenantId } })
    await prisma.job.deleteMany({ where: { tenantId } })
    await prisma.whatsAppConsent.deleteMany({ where: { tenantId } })
    await prisma.whatsAppReceiptConfig.deleteMany({ where: { tenantId } })
    await prisma.accountingSettings.deleteMany({ where: { tenantId } })
    await prisma.auditLog.deleteMany({ where: { tenantId } })
    await prisma.feeReceipt.deleteMany({ where: { tenantId } })
    await prisma.feePayment.deleteMany({ where: { tenantId } })
    await prisma.studentGuardian.deleteMany({ where: { tenantId } })
    await prisma.parent.deleteMany({ where: { tenantId } })
    await prisma.student.deleteMany({ where: { tenantId } })
    await prisma.tenant.delete({ where: { id: tenantId } })
  }
  await prisma.$disconnect()
})

describe('whatsapp receipts: settings and switch', () => {
  it('cannot be switched on before the provider settings are complete', async () => {
    await expect(setWhatsAppReceipts(admin, { enabled: true })).rejects.toThrow(/Finish the WhatsApp settings first/)
  })

  it('stores secrets encrypted and never returns them', async () => {
    await expect(saveReceiptConfig(clerk, { provider: 'META_CLOUD', templateLanguage: 'en' } as never)).rejects.toThrow(/settings.integrations/)
    await saveReceiptConfig(admin, {
      provider: 'META_CLOUD', phoneNumberId: PHONE_ID, templateName: 'fee_receipt', templateLanguage: 'en',
      accessToken: 'meta-access-token', appSecret: APP_SECRET, campaignName: undefined, apiKey: undefined,
    })
    const row = await prisma.whatsAppReceiptConfig.findUniqueOrThrow({ where: { tenantId } })
    expect(row.accessTokenEncrypted).not.toContain('meta-access-token')
    expect(decryptSecret(row.accessTokenEncrypted!)).toBe('meta-access-token')
    webhookKey = decryptSecret(row.webhookKeyEncrypted)

    const view = await getReceiptSettings(admin)
    expect(view.check.complete).toBe(true)
    expect(JSON.stringify(view)).not.toContain('meta-access-token')
    expect(JSON.stringify(view)).not.toContain(APP_SECRET)
    expect(view.config?.webhookUrl).toContain(webhookKey)
    // Without integrations permission the secret URL is withheld.
    expect((await getReceiptSettings(clerk)).config?.webhookUrl).toBeNull()

    // Saving again with blank secrets keeps them.
    await saveReceiptConfig(admin, { provider: 'META_CLOUD', phoneNumberId: PHONE_ID, templateName: 'fee_receipt', templateLanguage: 'en', accessToken: undefined, appSecret: undefined, campaignName: undefined, apiKey: undefined })
    expect(decryptSecret((await prisma.whatsAppReceiptConfig.findUniqueOrThrow({ where: { tenantId } })).accessTokenEncrypted!)).toBe('meta-access-token')
  })
})

describe('whatsapp receipts: queueing', () => {
  it('queues nothing while the switch is off', async () => {
    flagState.on = false
    const f = await family([randomMobile()])
    expect(await queueFeeReceiptWhatsApp(tenantId, f.paymentId)).toEqual({ queued: false, reason: 'disabled' })
    expect(await prisma.whatsAppOutbox.count({ where: { tenantId, paymentId: f.paymentId } })).toBe(0)
    flagState.on = true
  })

  it('ignores payments that have not settled', async () => {
    const f = await family([randomMobile()], { status: 'PENDING' })
    expect(await queueFeeReceiptWhatsApp(tenantId, f.paymentId)).toEqual({ queued: false, reason: 'not_settled' })
  })

  it('records a skip, with no job, when there is no consent, no number or an opt-out', async () => {
    const noConsent = await family([randomMobile()])
    expect(await queueFeeReceiptWhatsApp(tenantId, noConsent.paymentId)).toMatchObject({ queued: false, reason: 'skipped', detail: 'No WhatsApp consent recorded' })

    const noPhone = await family([null, '12345'])
    expect(await queueFeeReceiptWhatsApp(tenantId, noPhone.paymentId)).toMatchObject({ reason: 'skipped', detail: 'No guardian mobile number' })

    const phone = randomMobile()
    await setConsent(admin, { phone, status: 'OPTED_OUT', source: 'parent_request' })
    const optedOut = await family([phone])
    const out = await queueFeeReceiptWhatsApp(tenantId, optedOut.paymentId)
    expect(out).toMatchObject({ reason: 'skipped', detail: 'Parent opted out' })
    expect(await jobsFor(out.outboxId!)).toBe(0)
  })

  it('sends to the primary guardian, falling back to the first guardian with a number', async () => {
    const primary = randomMobile()
    const other = randomMobile()
    await setConsent(admin, { phone: primary, status: 'OPTED_IN', source: 'form' })
    await setConsent(admin, { phone: other, status: 'OPTED_IN', source: 'form' })
    const both = await family([primary, other])
    const q1 = await queueFeeReceiptWhatsApp(tenantId, both.paymentId)
    expect((await outbox(q1.queued ? q1.outboxId : '')).toPhone).toBe(`91${primary}`)

    const fallback = await family([null, other])
    const q2 = await queueFeeReceiptWhatsApp(tenantId, fallback.paymentId)
    expect((await outbox(q2.queued ? q2.outboxId : '')).toPhone).toBe(`91${other}`)
  })

  it('queues at most one message and one job per receipt, even when called concurrently', async () => {
    const phone = randomMobile()
    await setConsent(admin, { phone, status: 'OPTED_IN', source: 'form' })
    const f = await family([phone])
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => queueFeeReceiptWhatsApp(tenantId, f.paymentId)))
    expect(outcomes.filter((o) => o.queued)).toHaveLength(1)
    expect(outcomes.filter((o) => !o.queued).every((o) => !o.queued && o.reason === 'duplicate')).toBe(true)
    const rows = await prisma.whatsAppOutbox.findMany({ where: { tenantId, paymentId: f.paymentId } })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.eventKey).toBe(`fee_receipt:${f.receiptId}`)
    expect(await jobsFor(rows[0]!.id)).toBe(1)
    expect(await queueFeeReceiptWhatsApp(tenantId, f.paymentId)).toMatchObject({ queued: false, reason: 'duplicate', outboxId: rows[0]!.id })
  })
})

describe('whatsapp receipts: sending', () => {
  it('sends the template with a signed 7-day link and records the provider message id', async () => {
    const phone = randomMobile()
    await setConsent(admin, { phone, status: 'OPTED_IN', source: 'form' })
    const f = await family([phone])
    const q = await queueFeeReceiptWhatsApp(tenantId, f.paymentId)
    const fetchImpl = metaOk('wamid.SENT1')
    const now = new Date()
    expect(await processReceiptOutbox(q.queued ? q.outboxId : '', tenantId, { live: true, fetchImpl, now })).toEqual({ status: 'sent', dryRun: false })

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!
    expect(url).toContain(`/${PHONE_ID}/messages`)
    const body = JSON.parse(String(init.body))
    expect(body.to).toBe(`91${phone}`)
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([`Aarav Test${n}`, '₹12,300', `${TAG}-R${n}`, '14 Oct 2026'])
    const token = body.template.components[1].parameters[0].text as string
    expect(verifyReceiptToken(token, tenantId, linkKey(), now)).toMatchObject({ ok: true, receiptId: f.receiptId })

    const row = await outbox(q.queued ? q.outboxId : '')
    expect(row).toMatchObject({ status: 'SENT', providerMessageId: 'wamid.SENT1', attempts: 1, provider: 'META_CLOUD' })
    expect(row.linkExpiresAt!.getTime() - now.getTime()).toBe(7 * 86_400_000)

    // A second run of the same job sends nothing.
    const again = metaOk('wamid.SENT2')
    expect(await processReceiptOutbox(row.id, tenantId, { live: true, fetchImpl: again })).toMatchObject({ status: 'noop' })
    expect(again).not.toHaveBeenCalled()
  })

  it('uses the dry-run provider unless sending is live', async () => {
    const phone = randomMobile()
    await setConsent(admin, { phone, status: 'OPTED_IN', source: 'form' })
    const f = await family([phone])
    const q = await queueFeeReceiptWhatsApp(tenantId, f.paymentId)
    const fetchImpl = vi.fn<FetchLike>(async () => { throw new Error('must not be called') })
    expect(await processReceiptOutbox(q.queued ? q.outboxId : '', tenantId, { fetchImpl })).toEqual({ status: 'sent', dryRun: true })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect((await outbox(q.queued ? q.outboxId : '')).providerMessageId).toMatch(/^dryrun_/)
  })

  it('retries outages, gives up on rejections, and lets staff retry safely', async () => {
    const phone = randomMobile()
    await setConsent(admin, { phone, status: 'OPTED_IN', source: 'form' })
    const f = await family([phone])
    const q = await queueFeeReceiptWhatsApp(tenantId, f.paymentId)
    const id = q.queued ? q.outboxId : ''

    expect(await processReceiptOutbox(id, tenantId, { live: true, fetchImpl: metaFails(503, {}) })).toMatchObject({ status: 'retry' })
    expect((await outbox(id)).status).toBe('FAILED')

    expect(await processReceiptOutbox(id, tenantId, { live: true, fetchImpl: metaFails(400, { error: { code: 132001, title: 'Template name does not exist' } }) }))
      .toEqual({ status: 'dead', detail: 'meta_132001' })
    const dead = await outbox(id)
    expect(dead).toMatchObject({ status: 'DEAD', attempts: 2 })
    expect(dead.lastError).not.toContain('meta-access-token')

    await expect(retryOutbox(clerk, id)).rejects.toThrow(/accounts.manage/)
    const jobsBefore = await jobsFor(id)
    await retryOutbox(admin, id)
    expect(await outbox(id)).toMatchObject({ status: 'QUEUED', attempts: 0, lastError: null })
    expect(await jobsFor(id)).toBe(jobsBefore + 1)
    await expect(retryOutbox(admin, id)).rejects.toThrow(/already being sent/)

    expect(await processReceiptOutbox(id, tenantId, { live: true, fetchImpl: metaOk('wamid.RETRIED') })).toMatchObject({ status: 'sent' })
    await expect(retryOutbox(admin, id)).rejects.toThrow(/already sent/)
  })

  it('gives up after five transient failures', async () => {
    const phone = randomMobile()
    await setConsent(admin, { phone, status: 'OPTED_IN', source: 'form' })
    const f = await family([phone])
    const q = await queueFeeReceiptWhatsApp(tenantId, f.paymentId)
    const id = q.queued ? q.outboxId : ''
    const outcomes = []
    for (let i = 0; i < 5; i++) outcomes.push((await processReceiptOutbox(id, tenantId, { live: true, fetchImpl: metaFails(500, {}) })).status)
    expect(outcomes).toEqual(['retry', 'retry', 'retry', 'retry', 'dead'])
    expect(await outbox(id)).toMatchObject({ status: 'DEAD', attempts: 5 })
  })

  it('never resends a message interrupted mid-send', async () => {
    const phone = randomMobile()
    await setConsent(admin, { phone, status: 'OPTED_IN', source: 'form' })
    const f = await family([phone])
    const q = await queueFeeReceiptWhatsApp(tenantId, f.paymentId)
    const id = q.queued ? q.outboxId : ''
    await prisma.whatsAppOutbox.update({ where: { id }, data: { status: 'SENDING', attempts: 1 } })
    const fetchImpl = metaOk('wamid.NEVER')
    expect(await processReceiptOutbox(id, tenantId, { live: true, fetchImpl })).toEqual({ status: 'interrupted' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect((await outbox(id)).status).toBe('DEAD')
    expect((await outbox(id)).lastError).toMatch(/Interrupted while sending/)
  })

  it('checks consent, payment and switch again at send time', async () => {
    const phone = randomMobile()
    await setConsent(admin, { phone, status: 'OPTED_IN', source: 'form' })
    const a = await family([phone])
    const b = await family([phone])
    const c = await family([phone])
    const qa = await queueFeeReceiptWhatsApp(tenantId, a.paymentId)
    const qb = await queueFeeReceiptWhatsApp(tenantId, b.paymentId)
    const qc = await queueFeeReceiptWhatsApp(tenantId, c.paymentId)
    const fetchImpl = metaOk('wamid.NEVER')

    await prisma.feePayment.update({ where: { id: b.paymentId }, data: { status: 'REVERSED' } })
    expect(await processReceiptOutbox(qb.queued ? qb.outboxId : '', tenantId, { live: true, fetchImpl })).toMatchObject({ status: 'skipped', detail: 'The payment is no longer settled' })

    flagState.on = false
    expect(await processReceiptOutbox(qc.queued ? qc.outboxId : '', tenantId, { live: true, fetchImpl })).toMatchObject({ status: 'skipped', detail: 'WhatsApp receipts were switched off' })
    flagState.on = true

    await setConsent(admin, { phone, status: 'OPTED_OUT', source: 'parent_request' })
    expect(await processReceiptOutbox(qa.queued ? qa.outboxId : '', tenantId, { live: true, fetchImpl })).toMatchObject({ status: 'skipped', detail: 'Parent opted out' })
    expect(fetchImpl).not.toHaveBeenCalled()

    // Staff cannot push it through either.
    await expect(retryOutbox(admin, qa.queued ? qa.outboxId : '')).rejects.toThrow(/opted out/)
    await expect(retryOutbox(admin, qb.queued ? qb.outboxId : '')).rejects.toThrow(/no longer settled/)
  })

  it('lists messages with masked numbers', async () => {
    const list = await listOutbox(clerk, { status: 'all' })
    expect(list.total).toBeGreaterThan(0)
    expect(list.canRetry).toBe(false)
    for (const row of list.rows) expect(row.to).toMatch(/^(—|\+91 \*{6}\d{4})$/)
  })
})

describe('whatsapp receipts: delivery-status webhook', () => {
  it('answers the Meta handshake only with the right verify token', async () => {
    const ok = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': webhookKey, 'hub.challenge': '1158201444' })
    expect(await verifySubscription(webhookKey, ok)).toBe('1158201444')
    const wrong = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '1' })
    expect(await verifySubscription(webhookKey, wrong)).toBeNull()
    expect(await verifySubscription('unknown-key-unknown-key-123', ok)).toBeNull()
  })

  it('rejects unknown URLs and unsigned or mis-signed Meta callbacks', async () => {
    const raw = metaEnvelope([])
    expect(await handleStatusWebhook('unknown-key-unknown-key-123', raw, sign(raw))).toEqual({ http: 404 })
    expect(await handleStatusWebhook('../../etc', raw, sign(raw))).toEqual({ http: 404 })
    expect(await handleStatusWebhook(webhookKey, raw, null)).toEqual({ http: 403 })
    expect(await handleStatusWebhook(webhookKey, raw, sign(raw, 'wrong-secret'))).toEqual({ http: 403 })
    expect(await handleStatusWebhook(webhookKey, raw, sign(`${raw} `))).toEqual({ http: 403 })
  })

  it('applies statuses forward only, whatever order they arrive in', async () => {
    const m = await sentMessage('wamid.HOOK1')
    const read = metaEnvelope([{ id: 'wamid.HOOK1', status: 'read', timestamp: '1760400100' }])
    expect(await handleStatusWebhook(webhookKey, read, sign(read))).toMatchObject({ http: 200, applied: 1 })
    const lateDelivered = metaEnvelope([{ id: 'wamid.HOOK1', status: 'delivered', timestamp: '1760400050' }])
    expect(await handleStatusWebhook(webhookKey, lateDelivered, sign(lateDelivered))).toMatchObject({ http: 200, applied: 0 })
    const row = await outbox(m.outboxId)
    expect(row.status).toBe('READ')
    expect(row.readAt).toEqual(new Date(1_760_400_100_000))
    expect(row.deliveredAt).toEqual(new Date(1_760_400_100_000))

    // Another school's number, or a malformed body, changes nothing.
    const foreign = metaEnvelope([{ id: 'wamid.HOOK1', status: 'failed', timestamp: '1' }], [], '999')
    expect(await handleStatusWebhook(webhookKey, foreign, sign(foreign))).toMatchObject({ http: 200, applied: 0 })
    expect(await handleStatusWebhook(webhookKey, '{not json', sign('{not json'))).toMatchObject({ http: 200, recognised: false })
    expect((await outbox(m.outboxId)).status).toBe('READ')
  })

  it('records failed deliveries', async () => {
    const m = await sentMessage('wamid.HOOK2')
    const failed = metaEnvelope([{ id: 'wamid.HOOK2', status: 'failed', timestamp: '1760400200', errors: [{ code: 131026, title: 'Undeliverable' }] }])
    await handleStatusWebhook(webhookKey, failed, sign(failed))
    expect(await outbox(m.outboxId)).toMatchObject({ status: 'DEAD', lastError: 'Not delivered (meta_131026)' })
  })

  it('turns STOP and START replies into consent changes', async () => {
    const m = await sentMessage('wamid.HOOK3')
    const stop = metaEnvelope([], [{ from: m.phone, id: 'wamid.in1', type: 'text', text: { body: 'STOP' } }])
    expect(await handleStatusWebhook(webhookKey, stop, sign(stop))).toMatchObject({ http: 200, replies: 1 })
    expect(await prisma.whatsAppConsent.findFirst({ where: { tenantId, phone: m.phone } })).toMatchObject({ status: 'OPTED_OUT', source: 'reply_stop' })
    const start = metaEnvelope([], [{ from: m.phone, id: 'wamid.in2', type: 'text', text: { body: 'start' } }])
    await handleStatusWebhook(webhookKey, start, sign(start))
    expect(await prisma.whatsAppConsent.findFirst({ where: { tenantId, phone: m.phone } })).toMatchObject({ status: 'OPTED_IN', source: 'reply_start' })
  })
})

describe('whatsapp receipts: receipt link', () => {
  it('opens a valid link with only what the receipt shows, and logs it', async () => {
    const f = await family([randomMobile()])
    const token = signReceiptToken({ tenantId, receiptId: f.receiptId, expiresAt: new Date(Date.now() + 86_400_000) }, linkKey())
    const result = await openReceiptLink(tenantId, token)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.receipt).toMatchObject({ number: `${TAG}-R${n}`, amountMinor: 1_230_000, studentName: `Aarav Test${n}`, advanceMinor: 1_230_000 })
    expect(Object.keys(result.receipt).sort()).toEqual(['admissionNo', 'advanceMinor', 'amountMinor', 'classLabel', 'currency', 'expiresAt', 'lines', 'mode', 'number', 'paidAt', 'reference', 'studentName'])
    expect(await prisma.auditLog.count({ where: { tenantId, action: 'fee_receipt.link_opened', entityId: f.receiptId } })).toBe(1)
  })

  it('refuses expired, tampered and other-school links, and links to reversed payments', async () => {
    const f = await family([randomMobile()])
    const expiresAt = new Date(Date.now() + 86_400_000)
    const token = signReceiptToken({ tenantId, receiptId: f.receiptId, expiresAt }, linkKey())
    expect(await openReceiptLink(tenantId, token, new Date(expiresAt.getTime() + 1000))).toEqual({ ok: false, reason: 'expired' })
    expect(await openReceiptLink(tenantId, `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`)).toEqual({ ok: false, reason: 'invalid' })
    const demo = await prisma.tenant.findFirst({ where: { NOT: { id: tenantId } }, select: { id: true } })
    if (demo) expect(await openReceiptLink(demo.id, token)).toEqual({ ok: false, reason: 'invalid' })

    flagState.on = false
    expect(await openReceiptLink(tenantId, token)).toEqual({ ok: false, reason: 'unavailable' })
    flagState.on = true

    await prisma.feePayment.update({ where: { id: f.paymentId }, data: { status: 'REVERSED' } })
    expect(await openReceiptLink(tenantId, token)).toEqual({ ok: false, reason: 'unavailable' })
    expect(await prisma.auditLog.count({ where: { tenantId, action: 'fee_receipt.link_opened', entityId: f.receiptId } })).toBe(0)
  })
})

describe('whatsapp receipts: AiSensy and the sweeper', () => {
  it('switching provider drops the old secrets but keeps the status URL', async () => {
    await saveReceiptConfig(admin, { provider: 'AISENSY', campaignName: 'fee_receipts', apiKey: 'aisensy-key', templateLanguage: 'en', phoneNumberId: undefined, templateName: undefined, accessToken: undefined, appSecret: undefined })
    const row = await prisma.whatsAppReceiptConfig.findUniqueOrThrow({ where: { tenantId } })
    expect(row).toMatchObject({ provider: 'AISENSY', accessTokenEncrypted: null, appSecretEncrypted: null, phoneNumberId: null })
    expect(decryptSecret(row.webhookKeyEncrypted)).toBe(webhookKey)
  })

  it('sends through AiSensy and accepts its status callbacks on the secret URL', async () => {
    const phone = randomMobile()
    await setConsent(admin, { phone, status: 'OPTED_IN', source: 'form' })
    const f = await family([phone])
    const q = await queueFeeReceiptWhatsApp(tenantId, f.paymentId)
    const id = q.queued ? q.outboxId : ''
    const fetchImpl = vi.fn<FetchLike>(async () => new Response(JSON.stringify({ success: 'true', submitted_message_id: 'ais-77' }), { status: 200 }))
    expect(await processReceiptOutbox(id, tenantId, { live: true, fetchImpl })).toMatchObject({ status: 'sent' })
    const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]![1].body))
    expect(body).toMatchObject({ apiKey: 'aisensy-key', campaignName: 'fee_receipts', destination: `91${phone}` })
    expect(body.templateParams[4]).toMatch(/\/r\//)

    expect(await handleStatusWebhook(webhookKey, JSON.stringify({ messageId: 'ais-77', status: 'delivered', timestamp: 1760400300 }), null)).toMatchObject({ http: 200, applied: 1 })
    expect((await outbox(id)).status).toBe('DELIVERED')
    expect(await handleStatusWebhook(webhookKey, JSON.stringify({ something: 'else' }), null)).toMatchObject({ http: 200, recognised: false })
    // The Meta handshake does not apply to AiSensy.
    expect(await verifySubscription(webhookKey, new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': webhookKey, 'hub.challenge': '1' }))).toBeNull()
  })

  it('queues receipts whose queue step never ran, once', async (ctx) => {
    if (skipSweep) ctx.skip()
    const switchedOnAt = new Date(Date.now() - 10 * 60_000)
    await prisma.accountingSettings.create({ data: { tenantId, whatsappReceiptsEnabled: true } })
    await prisma.$executeRaw`UPDATE "AccountingSettings" SET "updatedAt" = ${switchedOnAt} WHERE "tenantId" = ${tenantId}`

    const phone = randomMobile()
    await setConsent(admin, { phone, status: 'OPTED_IN', source: 'form' })
    const missed = await family([phone], { issuedOn: new Date(Date.now() - 5 * 60_000) })
    const tooNew = await family([phone], { issuedOn: new Date() })
    const beforeSwitch = await family([phone], { issuedOn: new Date(Date.now() - 20 * 60_000) })

    expect(await sweepMissedReceipts()).toBe(1)
    expect(await prisma.whatsAppOutbox.count({ where: { tenantId, paymentId: missed.paymentId, status: 'QUEUED' } })).toBe(1)
    expect(await prisma.whatsAppOutbox.count({ where: { tenantId, paymentId: { in: [tooNew.paymentId, beforeSwitch.paymentId] } } })).toBe(0)
    expect(await sweepMissedReceipts()).toBe(0)
  })
})
