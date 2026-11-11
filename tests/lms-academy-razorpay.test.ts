import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const SLUG = vi.hoisted(() => {
  const slug = `zzrzp-${Date.now().toString(36)}`
  process.env.ACADEMY_SLUG = slug
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
  process.env.RAZORPAY_KEY_SECRET = 'test_key_secret'
  process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret'
  return slug
})

import { createHmac } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/server/db/tenant-client'
import type { AppContext } from '../src/server/context'
import { FEATURE, invalidateEntitlementsCache } from '../src/server/entitlements'
import * as academy from '../src/server/modules/lms/academy'

/**
 * Razorpay checkout against a stubbed Razorpay API: the course opens only
 * when the Checkout signature verifies and Razorpay itself reports the
 * payment captured for this order; webhooks need a valid signature and are
 * processed once.
 */
const prisma = new PrismaClient()
const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('hex')

let tenantId: string
let studentId: string
let learner: AppContext
let orderSeq = 0
const payments = new Map<string, { order_id: string; amount: number; status: string }>()
const captured: string[] = []

vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (init?.method === 'POST' && path === '/v1/orders') {
      const body = JSON.parse(String(init.body)) as { amount: number; currency: string }
      return json({ id: `order_T${++orderSeq}`, amount: body.amount, currency: body.currency, status: 'created' })
    }
    const capture = path.match(/^\/v1\/payments\/([^/]+)\/capture$/)
    if (init?.method === 'POST' && capture) {
      const p = payments.get(capture[1]!)!
      p.status = 'captured'
      captured.push(capture[1]!)
      return json({ id: capture[1], currency: 'INR', ...p })
    }
    const fetchPay = path.match(/^\/v1\/payments\/([^/]+)$/)
    if (fetchPay) {
      const p = payments.get(fetchPay[1]!)
      return p ? json({ id: fetchPay[1], currency: 'INR', ...p }) : json({ error: { description: 'not found' } }, 400)
    }
    return json({ error: { description: `unexpected ${path}` } }, 404)
  }),
)

function contextFor(userId: string): AppContext {
  const held = new Set(['lms.learn'])
  return {
    user: {
      sessionId: 's_test',
      userId,
      tenantId,
      isSuperAdmin: false,
      firstName: 'Paying',
      lastName: 'Learner',
      email: 'payer@example.com',
      phone: '+919800000000',
      avatarUrl: null,
      displayName: null,
      mustChangePassword: false,
      roleKeys: ['STUDENT'],
      permissions: held,
      impersonatedById: null,
    },
    tenant: { id: tenantId, slug: SLUG, name: 'Academy', currency: 'INR' } as never,
    db: tenantDb(tenantId),
    can: (p: string) => held.has(p),
    canAny: (...ps: string[]) => ps.some((p) => held.has(p)),
    require: (p: string) => {
      if (!held.has(p)) throw new Error(`missing ${p}`)
    },
  }
}

async function paidCourse(title: string, priceMinor = 49_900) {
  const c = await prisma.lmsCourse.create({
    data: {
      tenantId,
      title,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      academyPriceMinor: priceMinor,
      modules: { create: { tenantId, title: 'Start', position: 1 } },
    },
    include: { modules: true },
  })
  await prisma.lmsLesson.create({
    data: { tenantId, courseId: c.id, moduleId: c.modules[0]!.id, title: 'Hello', kind: 'TEXT', body: 'Hi', position: 1 },
  })
  return c.id
}

async function checkout(courseId: string) {
  const start = await academy.startPurchase(learner, courseId)
  if (start.kind !== 'razorpay') throw new Error(`expected a Razorpay order, got ${start.kind}`)
  return start
}

const owns = async (courseId: string) => (await prisma.lmsEnrollment.count({ where: { tenantId, courseId, studentId } })) === 1

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: SLUG, name: 'Test Academy', status: 'ACTIVE' } })
  tenantId = tenant.id
  await prisma.tenantEntitlementOverride.create({ data: { tenantId, featureKey: FEATURE.MODULE_ROBOTICS_LMS, enabled: true } })
  await invalidateEntitlementsCache(tenantId)
  const user = await prisma.user.create({ data: { tenantId, email: `${SLUG}@example.com`, firstName: 'Paying', lastName: 'Learner' } })
  const student = await prisma.student.create({ data: { tenantId, userId: user.id, admissionNo: 'AC00000001', firstName: 'Paying', lastName: 'Learner' } })
  studentId = student.id
  learner = contextFor(user.id)
})

afterAll(async () => {
  vi.unstubAllGlobals()
  if (tenantId) {
    await prisma.paymentEvent.deleteMany({ where: { tenantId } })
    await prisma.lmsAcademyOrder.deleteMany({ where: { tenantId } })
    await prisma.lmsCourse.deleteMany({ where: { tenantId } })
    await prisma.student.deleteMany({ where: { tenantId } })
    await prisma.user.deleteMany({ where: { tenantId } })
    await prisma.tenant.delete({ where: { id: tenantId } })
  }
  await prisma.$disconnect()
})

describe('Razorpay checkout', () => {
  it('creates a Razorpay order for the course price', async () => {
    expect(academy.paymentMode()).toBe('razorpay')
    const start = await checkout(await paidCourse('Order shape'))
    expect(start).toMatchObject({ keyId: 'rzp_test_key', amountMinor: 49_900, currency: 'INR', prefill: { email: 'payer@example.com' } })
    const row = await prisma.lmsAcademyOrder.findUniqueOrThrow({ where: { id: start.orderId } })
    expect(row).toMatchObject({ status: 'CREATED', provider: 'razorpay', providerOrderId: start.providerOrderId })
  })

  it('rejects a forged Checkout signature', async () => {
    const courseId = await paidCourse('Forged')
    const start = await checkout(courseId)
    payments.set('pay_forged', { order_id: start.providerOrderId, amount: 49_900, status: 'captured' })
    const r = await academy.confirmPurchase(learner, { orderId: start.orderId, paymentId: 'pay_forged', providerOrderId: start.providerOrderId, signature: 'deadbeef' })
    expect(r.status).toBe('failed')
    expect(await owns(courseId)).toBe(false)
  })

  it('opens the course when the signature verifies and Razorpay reports it captured', async () => {
    const courseId = await paidCourse('Genuine')
    const start = await checkout(courseId)
    payments.set('pay_good', { order_id: start.providerOrderId, amount: 49_900, status: 'captured' })
    const signature = sign(`${start.providerOrderId}|pay_good`, 'test_key_secret')
    const r = await academy.confirmPurchase(learner, { orderId: start.orderId, paymentId: 'pay_good', providerOrderId: start.providerOrderId, signature })
    expect(r.status).toBe('paid')
    expect(await owns(courseId)).toBe(true)
  })

  it('captures an authorised payment before settling it', async () => {
    const courseId = await paidCourse('Authorised only')
    const start = await checkout(courseId)
    payments.set('pay_auth', { order_id: start.providerOrderId, amount: 49_900, status: 'authorized' })
    const signature = sign(`${start.providerOrderId}|pay_auth`, 'test_key_secret')
    const r = await academy.confirmPurchase(learner, { orderId: start.orderId, paymentId: 'pay_auth', providerOrderId: start.providerOrderId, signature })
    expect(r.status).toBe('paid')
    expect(captured).toContain('pay_auth')
  })

  it('refuses a validly signed payment that belongs to another order', async () => {
    const courseId = await paidCourse('Swapped')
    const start = await checkout(courseId)
    payments.set('pay_other', { order_id: 'order_someone_else', amount: 49_900, status: 'captured' })
    const signature = sign(`${start.providerOrderId}|pay_other`, 'test_key_secret')
    const r = await academy.confirmPurchase(learner, { orderId: start.orderId, paymentId: 'pay_other', providerOrderId: start.providerOrderId, signature })
    expect(r.status).toBe('failed')
    expect(await owns(courseId)).toBe(false)
  })
})

describe('Razorpay webhook', () => {
  const eventBody = (orderId: string, paymentId: string, amount = 49_900, event = 'payment.captured') =>
    JSON.stringify({ event, payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, currency: 'INR', status: 'captured' } } } })

  it('ignores an unsigned call and settles a signed one exactly once', async () => {
    const courseId = await paidCourse('Closed the tab')
    const start = await checkout(courseId)
    const body = eventBody(start.providerOrderId, 'pay_webhook')

    const forged = await academy.handleAcademyWebhook(body, 'not-a-signature', `evt_forged_${SLUG}`)
    expect(forged).toEqual({ handled: false, reason: 'Invalid signature' })
    expect(await owns(courseId)).toBe(false)

    const eventId = `evt_ok_${SLUG}`
    const ok = await academy.handleAcademyWebhook(body, sign(body, 'test_webhook_secret'), eventId)
    expect(ok).toEqual({ handled: true, reason: 'paid' })
    expect(await owns(courseId)).toBe(true)
    const order = await prisma.lmsAcademyOrder.findUniqueOrThrow({ where: { id: start.orderId } })
    expect(order.number).toMatch(/^ACD-/)

    const again = await academy.handleAcademyWebhook(body, sign(body, 'test_webhook_secret'), eventId)
    expect(again).toEqual({ handled: false, reason: 'Duplicate event' })
  })

  it('records a failed payment and leaves unknown orders alone', async () => {
    const start = await checkout(await paidCourse('Card declined'))
    const failed = eventBody(start.providerOrderId, 'pay_declined', 49_900, 'payment.failed')
    expect(await academy.handleAcademyWebhook(failed, sign(failed, 'test_webhook_secret'), `evt_fail_${SLUG}`)).toEqual({ handled: true, reason: 'Recorded a failed payment' })
    expect((await prisma.lmsAcademyOrder.findUniqueOrThrow({ where: { id: start.orderId } })).status).toBe('FAILED')

    const stray = eventBody('order_from_fee_collection', 'pay_stray')
    expect(await academy.handleAcademyWebhook(stray, sign(stray, 'test_webhook_secret'), `evt_stray_${SLUG}`)).toEqual({ handled: false, reason: 'Not an Academy order' })
  })
})
