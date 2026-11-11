import { cache } from 'react'
import { randomInt } from 'node:crypto'
import { notFound as notFoundPage } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/server/db/prisma'
import type { AppContext, PlatformContext } from '@/server/context'
import { badRequest, forbidden, notFound } from '@/server/api/response'
import { audit } from '@/server/audit'
import { isProd } from '@/lib/env'
import { ROLE } from '@/lib/rbac/roles'
import { FEATURE, invalidateEntitlementsCache } from '@/server/entitlements'
import { resolveTenant, tenantUrl, type ResolvedTenant } from '@/server/tenant'
import { getSessionUser, createSession, requestMeta } from '@/server/auth/session'
import { hashPassword } from '@/server/auth/password'
import { storePhone } from '@/server/auth/phone'
import { rateLimit } from '@/server/rate-limit'
import { nextDocumentNumber, financialYearLabel } from '@/server/numbering'
import { provisionSchool } from '@/server/modules/platform/provision'
import { requireLearner } from './learning'
import { academySlug, isAcademy } from './academy-tenant'
import {
  captureRazorpayPayment,
  checkoutSignatureValid,
  createRazorpayOrder,
  fetchRazorpayPayment,
  razorpayKeys,
  webhookSignatureValid,
  type RazorpayPayment,
} from './razorpay'

/**
 * MyCampusView Academy: the public face of the Robotics & AI courses.
 *
 * The Academy is an ordinary school tenant run by the platform team, so
 * public learners get the same player, live classes and certificates as
 * school students. What is different lives here: public sign-up, a price on
 * each course, and Razorpay checkout. A paid order creates the enrolment,
 * which is what opens the course in the player.
 */

export const ACADEMY_NAME = 'MyCampusView Academy'

export { academySlug, isAcademy }

export function academyUrl(path = '/academy') {
  return tenantUrl(academySlug(), path)
}

export const academyTenant = cache(async () =>
  prisma.tenant.findUnique({ where: { slug: academySlug() }, select: { id: true, slug: true, name: true, status: true, archivedAt: true } }),
)

/** Page guard for the public pages: they exist only on the Academy's own address. */
export async function requireAcademyHost(): Promise<ResolvedTenant> {
  const tenant = await resolveTenant()
  if (!tenant || !isAcademy(tenant) || tenant.status === 'SUSPENDED') notFoundPage()
  return tenant
}

/** Razorpay when keys are set; a simulated checkout outside production; otherwise nothing is sold. */
export function paymentMode(): 'razorpay' | 'simulated' | 'off' {
  if (razorpayKeys()) return 'razorpay'
  return isProd() ? 'off' : 'simulated'
}

export function formatRupees(minor: number) {
  return `₹${(minor / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

/* ------------------------------------------------------------- catalogue */

function listedWhere(academyId: string) {
  return {
    deletedAt: null,
    status: 'PUBLISHED' as const,
    academyPriceMinor: { not: null },
    OR: [{ tenantId: null }, { tenantId: academyId }],
  }
}

export async function academyCatalogue(academyId: string, filter: { q?: string; category?: string } = {}) {
  const q = filter.q?.trim()
  const courses = await prisma.lmsCourse.findMany({
    where: {
      ...listedWhere(academyId),
      ...(filter.category ? { category: filter.category } : {}),
      ...(q
        ? { AND: [{ OR: [{ title: { contains: q, mode: 'insensitive' as const } }, { subtitle: { contains: q, mode: 'insensitive' as const } }] }] }
        : {}),
    },
    orderBy: [{ publishedAt: 'desc' }, { title: 'asc' }],
    include: { lessons: { select: { durationMinutes: true } } },
  })
  const learners = await prisma.lmsEnrollment.groupBy({
    by: ['courseId'],
    where: { tenantId: academyId, courseId: { in: courses.map((c) => c.id) } },
    _count: { _all: true },
  })
  const count = new Map(learners.map((l) => [l.courseId, l._count._all]))
  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    category: c.category,
    level: c.level,
    gradeFrom: c.gradeFrom,
    gradeTo: c.gradeTo,
    lessons: c.lessons.length,
    minutes: c.lessons.reduce((s, l) => s + (l.durationMinutes ?? 0), 0),
    priceMinor: c.academyPriceMinor ?? 0,
    learners: count.get(c.id) ?? 0,
  }))
}

export async function academyCourse(academyId: string, courseId: string) {
  const course = await prisma.lmsCourse.findFirst({
    where: { id: courseId, ...listedWhere(academyId) },
    include: {
      modules: {
        orderBy: { position: 'asc' },
        include: { lessons: { orderBy: { position: 'asc' }, select: { id: true, title: true, kind: true, durationMinutes: true } } },
      },
    },
  })
  if (!course) return null
  const [learners, batches] = await Promise.all([
    prisma.lmsEnrollment.count({ where: { tenantId: academyId, courseId } }),
    prisma.lmsBatch.count({ where: { tenantId: academyId, courseId, archivedAt: null } }),
  ])
  return { ...course, priceMinor: course.academyPriceMinor ?? 0, learners, hasLiveClasses: batches > 0 }
}

/** Who is looking at a public page: a signed-in Academy learner and what they own, or nobody. */
export async function academyVisitor(tenant: ResolvedTenant) {
  const user = await getSessionUser()
  if (!user || user.tenantId !== tenant.id) return null
  const student = await prisma.student.findFirst({
    where: { tenantId: tenant.id, userId: user.userId, deletedAt: null },
    select: { id: true },
  })
  const owned = student
    ? await prisma.lmsEnrollment.findMany({ where: { tenantId: tenant.id, studentId: student.id }, select: { courseId: true } })
    : []
  return {
    firstName: user.firstName,
    isLearner: !!student,
    owned: new Set(owned.map((o) => o.courseId)),
  }
}

/* --------------------------------------------------------------- sign-up */

export const signupSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().max(60).default(''),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(160),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => !v || /^\+?[\d\s-]{10,16}$/.test(v), 'Enter a valid mobile number'),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
})

export type SignupResult = { ok: true } | { ok: false; message: string; field?: string }

/** Creates a learner account on the Academy and signs them in. */
export async function signUpLearner(tenantId: string, raw: unknown): Promise<SignupResult> {
  const meta = await requestMeta()
  const limited = await rateLimit(`academy:signup:${meta.ip ?? 'unknown'}`, 5, 3600)
  if (!limited.ok) return { ok: false, message: 'Too many sign-ups from this network. Please try again in an hour.' }

  const parsed = signupSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, message: issue?.message ?? 'Check the form', field: String(issue?.path[0] ?? '') }
  }
  const input = parsed.data
  const phone = input.phone ? storePhone(input.phone) : null

  const taken = await prisma.user.findFirst({
    where: { tenantId, deletedAt: null, OR: [{ email: input.email }, ...(phone ? [{ phone }] : [])] },
    select: { email: true },
  })
  if (taken) {
    return taken.email === input.email
      ? { ok: false, field: 'email', message: 'An account already uses this email. Sign in instead.' }
      : { ok: false, field: 'phone', message: 'An account already uses this mobile number. Sign in instead.' }
  }

  const role = await prisma.role.findFirst({ where: { tenantId: null, key: ROLE.STUDENT }, select: { id: true } })
  if (!role) throw new Error('The student role is missing; run the seed')

  const passwordHash = await hashPassword(input.password)
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        tenantId,
        email: input.email,
        phone,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        status: 'ACTIVE',
        roles: { create: { roleId: role.id } },
      },
      select: { id: true, firstName: true, lastName: true },
    })
    await tx.student.create({
      data: {
        tenantId,
        userId: created.id,
        admissionNo: learnerNumber(),
        firstName: input.firstName,
        lastName: input.lastName,
        whatsappPhone: phone,
        admissionDate: new Date(),
      },
    })
    return created
  })

  await createSession({ userId: user.id, tenantId, ip: meta.ip, userAgent: meta.userAgent })
  await audit({
    tenantId,
    actorId: user.id,
    actorLabel: `${user.firstName} ${user.lastName}`.trim(),
    action: 'academy.signup',
    module: 'lms',
    entityType: 'User',
    entityId: user.id,
    summary: 'Joined the Academy',
  })
  return { ok: true }
}

/** "AC" and eight digits. Learners sign in with their email; this only fills the required student number. */
function learnerNumber() {
  return `AC${String(randomInt(0, 100_000_000)).padStart(8, '0')}`
}

/* -------------------------------------------------------------- checkout */

export type CheckoutStart =
  | { kind: 'owned'; courseId: string }
  | { kind: 'enrolled'; courseId: string }
  | {
      kind: 'razorpay'
      orderId: string
      keyId: string
      providerOrderId: string
      amountMinor: number
      currency: string
      courseTitle: string
      prefill: { name: string; email: string; contact: string }
    }
  | { kind: 'simulated'; orderId: string; amountMinor: number; courseTitle: string }

async function academyLearner(ctx: AppContext) {
  if (!isAcademy(ctx.tenant)) throw forbidden('Courses are bought on the Academy')
  return requireLearner(ctx)
}

export async function startPurchase(ctx: AppContext, courseId: string): Promise<CheckoutStart> {
  const learner = await academyLearner(ctx)
  const course = await prisma.lmsCourse.findFirst({
    where: { id: courseId, ...listedWhere(ctx.tenant.id) },
    select: { id: true, title: true, academyPriceMinor: true },
  })
  if (!course) throw notFound('Course')

  const enrolled = await ctx.db.lmsEnrollment.findFirst({ where: { courseId, studentId: learner.id }, select: { id: true } })
  if (enrolled) return { kind: 'owned', courseId }

  const price = course.academyPriceMinor ?? 0
  if (price === 0) {
    await enrol(ctx.tenant.id, courseId, learner.id)
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${learner.firstName} ${learner.lastName}`.trim(),
      action: 'academy.enrol_free',
      module: 'lms',
      entityType: 'LmsCourse',
      entityId: courseId,
      summary: `Joined the free course ${course.title}`,
    })
    return { kind: 'enrolled', courseId }
  }

  const mode = paymentMode()
  if (mode === 'off') throw badRequest('Online payments are not switched on yet. Please try again later.')

  const order = await ctx.db.lmsAcademyOrder.create({
    data: {
      tenantId: ctx.tenant.id,
      courseId,
      studentId: learner.id,
      userId: ctx.user.userId,
      amountMinor: price,
      currency: 'INR',
      provider: mode,
    },
  })

  if (mode === 'simulated') {
    await ctx.db.lmsAcademyOrder.update({ where: { id: order.id }, data: { providerOrderId: `sim_${order.id}` } })
    return { kind: 'simulated', orderId: order.id, amountMinor: price, courseTitle: course.title }
  }

  try {
    const remote = await createRazorpayOrder({
      amountMinor: price,
      currency: 'INR',
      receipt: order.id,
      notes: { academyOrderId: order.id, courseId, studentId: learner.id },
    })
    await ctx.db.lmsAcademyOrder.update({ where: { id: order.id }, data: { providerOrderId: remote.id } })
    return {
      kind: 'razorpay',
      orderId: order.id,
      keyId: razorpayKeys()!.keyId,
      providerOrderId: remote.id,
      amountMinor: price,
      currency: 'INR',
      courseTitle: course.title,
      prefill: {
        name: `${learner.firstName} ${learner.lastName}`.trim(),
        email: ctx.user.email ?? '',
        contact: ctx.user.phone ?? '',
      },
    }
  } catch (err) {
    console.error('[academy] could not create a Razorpay order', err)
    await ctx.db.lmsAcademyOrder.update({
      where: { id: order.id },
      data: { status: 'FAILED', failureReason: 'Razorpay order could not be created' },
    })
    throw badRequest('The payment could not be started. Please try again in a minute.')
  }
}

async function ownOrder(ctx: AppContext, orderId: string) {
  await academyLearner(ctx)
  const order = await ctx.db.lmsAcademyOrder.findFirst({ where: { id: orderId, userId: ctx.user.userId } })
  if (!order) throw notFound('Order')
  return order
}

export type SettleOutcome =
  | { status: 'paid' | 'already'; courseId: string; number: string | null }
  | { status: 'failed'; courseId: string; reason: string }

/** Back from Checkout: trust nothing until the signature and Razorpay's own record agree. */
export async function confirmPurchase(
  ctx: AppContext,
  input: { orderId: string; paymentId: string; providerOrderId: string; signature: string },
): Promise<SettleOutcome> {
  const order = await ownOrder(ctx, input.orderId)
  if (order.status === 'PAID') return { status: 'already', courseId: order.courseId, number: order.number }
  if (order.provider !== 'razorpay' || order.providerOrderId !== input.providerOrderId) throw badRequest('This payment does not match the order')
  if (!checkoutSignatureValid(input.providerOrderId, input.paymentId, input.signature)) {
    return { status: 'failed', courseId: order.courseId, reason: 'The payment could not be verified' }
  }
  return settleFromRazorpay(order.id, input.paymentId)
}

/** Development only: completes an order without a gateway. */
export async function confirmSimulatedPurchase(ctx: AppContext, orderId: string): Promise<SettleOutcome> {
  if (paymentMode() !== 'simulated') throw forbidden('Simulated payments are switched off')
  const order = await ownOrder(ctx, orderId)
  return settleOrder({
    orderId: order.id,
    providerPaymentId: `sim_pay_${order.id}`,
    amountMinor: order.amountMinor,
    currency: order.currency,
    raw: { simulated: true },
  })
}

/** Reads the payment from Razorpay, captures it if it is only authorised, then settles. */
async function settleFromRazorpay(orderId: string, paymentId: string): Promise<SettleOutcome> {
  const order = await prisma.lmsAcademyOrder.findUniqueOrThrow({ where: { id: orderId } })
  let payment: RazorpayPayment = await fetchRazorpayPayment(paymentId)
  if (payment.order_id !== order.providerOrderId) {
    return { status: 'failed', courseId: order.courseId, reason: 'The payment belongs to a different order' }
  }
  if (payment.status === 'authorized') payment = await captureRazorpayPayment(paymentId, payment.amount, payment.currency)
  if (payment.status !== 'captured') {
    return { status: 'failed', courseId: order.courseId, reason: `The payment is ${payment.status}` }
  }
  return settleOrder({ orderId, providerPaymentId: payment.id, amountMinor: payment.amount, currency: payment.currency, raw: payment })
}

/**
 * Marks an order paid and opens the course. The only path that grants a paid
 * course; reached from a verified Checkout return or a signed webhook, and
 * safe to run twice for the same payment.
 */
export async function settleOrder(params: {
  orderId: string
  providerPaymentId: string
  amountMinor: number
  currency: string
  raw: unknown
}): Promise<SettleOutcome> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "LmsAcademyOrder" WHERE "id" = ${params.orderId} FOR UPDATE`
    const order = await tx.lmsAcademyOrder.findUniqueOrThrow({
      where: { id: params.orderId },
      include: { course: { select: { title: true } } },
    })
    if (order.status === 'PAID') return { status: 'already' as const, courseId: order.courseId, number: order.number }

    // The amount is ours, not the gateway's: a payment for less never opens the course.
    if (params.amountMinor !== order.amountMinor || params.currency !== order.currency) {
      const reason = `Paid ${params.currency} ${params.amountMinor / 100}, order was ${order.currency} ${order.amountMinor / 100}`
      await tx.lmsAcademyOrder.update({
        where: { id: order.id },
        data: { status: 'FAILED', failureReason: reason, providerPaymentId: params.providerPaymentId, raw: params.raw as never },
      })
      return { status: 'failed' as const, courseId: order.courseId, reason: 'The amount paid does not match the price' }
    }

    const number = await nextDocumentNumber(tx, {
      tenantId: order.tenantId,
      kind: 'ACADEMY_ORDER',
      sessionLabel: financialYearLabel(new Date()),
    })
    await tx.lmsAcademyOrder.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        number,
        paidAt: new Date(),
        providerPaymentId: params.providerPaymentId,
        failureReason: null,
        raw: params.raw as never,
      },
    })
    await tx.lmsEnrollment.upsert({
      where: { tenantId_courseId_studentId: { tenantId: order.tenantId, courseId: order.courseId, studentId: order.studentId } },
      create: { tenantId: order.tenantId, courseId: order.courseId, studentId: order.studentId },
      update: {},
    })
    await tx.auditLog.create({
      data: {
        tenantId: order.tenantId,
        actorId: order.userId,
        actorLabel: 'Payment gateway',
        action: 'academy.order_paid',
        module: 'lms',
        entityType: 'LmsAcademyOrder',
        entityId: order.id,
        summary: `${number}: ${formatRupees(order.amountMinor)} paid for ${order.course.title}`,
      },
    })
    return { status: 'paid' as const, courseId: order.courseId, number }
  })
}

async function enrol(tenantId: string, courseId: string, studentId: string) {
  await prisma.lmsEnrollment.upsert({
    where: { tenantId_courseId_studentId: { tenantId, courseId, studentId } },
    create: { tenantId, courseId, studentId },
    update: {},
  })
}

/* --------------------------------------------------------------- webhook */

type WebhookBody = {
  event?: string
  payload?: { payment?: { entity?: RazorpayPayment & { error_description?: string } } }
}

/**
 * Razorpay's server-to-server callback. It settles orders whose buyer closed
 * the tab before Checkout returned. Every call is recorded, rejected ones too.
 */
export async function handleAcademyWebhook(rawBody: string, signature: string | null, eventId: string | null) {
  const verified = webhookSignatureValid(rawBody, signature)
  let body: WebhookBody | null = null
  try {
    body = JSON.parse(rawBody) as WebhookBody
  } catch {
    body = null
  }
  const payment = body?.payload?.payment?.entity
  const externalId = eventId || (payment ? `${body?.event}:${payment.id}` : null)

  const existing = externalId
    ? await prisma.paymentEvent.findUnique({ where: { provider_externalId: { provider: 'razorpay_academy', externalId } } })
    : null
  if (existing?.processedAt) return { handled: false, reason: 'Duplicate event' }

  const order = payment?.order_id
    ? await prisma.lmsAcademyOrder.findUnique({ where: { providerOrderId: payment.order_id }, select: { id: true, tenantId: true, status: true } })
    : null

  const event =
    existing ??
    (await prisma.paymentEvent.create({
      data: {
        tenantId: order?.tenantId ?? null,
        provider: 'razorpay_academy',
        eventType: String(body?.event ?? 'unknown'),
        externalId,
        signatureValid: verified,
        payload: (body ?? { raw: rawBody.slice(0, 2000) }) as never,
      },
    }))
  const finish = async (handled: boolean, reason: string) => {
    await prisma.paymentEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } })
    return { handled, reason }
  }

  if (!verified) {
    console.warn('[academy] rejected a webhook with an invalid signature', { externalId })
    return finish(false, 'Invalid signature')
  }
  if (!payment || !order) return finish(false, 'Not an Academy order')

  switch (body?.event) {
    case 'payment.captured':
    case 'order.paid': {
      const outcome = await settleOrder({
        orderId: order.id,
        providerPaymentId: payment.id,
        amountMinor: payment.amount,
        currency: payment.currency,
        raw: payment,
      })
      return finish(outcome.status !== 'failed', outcome.status)
    }
    case 'payment.authorized': {
      if (order.status === 'CREATED') await captureRazorpayPayment(payment.id, payment.amount, payment.currency)
      return finish(true, 'Captured')
    }
    case 'payment.failed': {
      await prisma.lmsAcademyOrder.updateMany({
        where: { id: order.id, status: 'CREATED' },
        data: { status: 'FAILED', failureReason: payment.error_description ?? 'Payment failed' },
      })
      return finish(true, 'Recorded a failed payment')
    }
    default:
      return finish(false, 'Ignored event')
  }
}

/* ------------------------------------------------------------- learner */

export async function myOrders(ctx: AppContext) {
  await academyLearner(ctx)
  return ctx.db.lmsAcademyOrder.findMany({
    where: { userId: ctx.user.userId, status: 'PAID' },
    orderBy: { paidAt: 'desc' },
    include: { course: { select: { id: true, title: true } } },
  })
}

/* ------------------------------------------------------------ platform */

export const setupSchema = z.object({
  adminName: z.string().trim().min(2, 'Enter the administrator’s name').max(120),
  adminEmail: z.string().trim().toLowerCase().email('Enter a valid email address'),
  adminPassword: z.string().min(10, 'Use at least 10 characters'),
  planId: z.string().min(1, 'Pick a plan'),
})

/** Creates the Academy tenant with the LMS switched on. Run once from the console. */
export async function setupAcademy(ctx: PlatformContext, raw: unknown) {
  const input = setupSchema.parse(raw)
  if (await academyTenant()) throw badRequest('The Academy is already set up')
  const { tenant } = await provisionSchool(ctx.db, {
    slug: academySlug(),
    schoolName: ACADEMY_NAME,
    adminEmail: input.adminEmail,
    adminPassword: input.adminPassword,
    adminName: input.adminName,
    planId: input.planId,
    trial: false,
  })
  await ctx.db.tenantEntitlementOverride.upsert({
    where: { tenantId_featureKey: { tenantId: tenant.id, featureKey: FEATURE.MODULE_ROBOTICS_LMS } },
    create: { tenantId: tenant.id, featureKey: FEATURE.MODULE_ROBOTICS_LMS, enabled: true, note: 'Academy' },
    update: { enabled: true },
  })
  await invalidateEntitlementsCache(tenant.id)
  await audit({
    tenantId: tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
    action: 'academy.setup',
    module: 'platform',
    entityType: 'Tenant',
    entityId: tenant.id,
    summary: `Set up ${ACADEMY_NAME}`,
  })
  return tenant
}

export const priceSchema = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 500_000), 'Enter a price between ₹0 and ₹5,00,000')
  .transform((v) => (v === null ? null : Math.round(v * 100)))

/** Blank takes the course off the Academy; 0 makes it free. */
export async function setAcademyPrice(ctx: PlatformContext, courseId: string, rawPrice: string) {
  const academy = await academyTenant()
  const priceMinor = priceSchema.parse(rawPrice)
  const course = await ctx.db.lmsCourse.findFirst({
    where: { id: courseId, deletedAt: null, OR: [{ tenantId: null }, ...(academy ? [{ tenantId: academy.id }] : [])] },
    select: { id: true, title: true, academyPriceMinor: true },
  })
  if (!course) throw notFound('Course')
  await ctx.db.lmsCourse.update({ where: { id: course.id }, data: { academyPriceMinor: priceMinor } })
  await audit({
    tenantId: academy?.id ?? null,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
    action: 'academy.price',
    module: 'platform',
    entityType: 'LmsCourse',
    entityId: course.id,
    summary:
      priceMinor === null
        ? `Took ${course.title} off the Academy`
        : `Priced ${course.title} at ${priceMinor === 0 ? 'free' : formatRupees(priceMinor)} on the Academy`,
  })
  return { title: course.title, priceMinor }
}

const ABANDONED_AFTER_MS = 60 * 60_000

export async function academyOverview() {
  const academy = await academyTenant()
  const courses = await prisma.lmsCourse.findMany({
    where: {
      deletedAt: null,
      status: { not: 'ARCHIVED' },
      OR: [{ tenantId: null }, ...(academy ? [{ tenantId: academy.id }] : [])],
    },
    orderBy: [{ status: 'desc' }, { title: 'asc' }],
    select: { id: true, title: true, status: true, tenantId: true, academyPriceMinor: true },
  })
  if (!academy) return { academy: null, courses: courses.map((c) => ({ ...c, learners: 0, revenueMinor: 0 })), totals: null, orders: [] }

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const [learners, enrolments, paid, paidMonth, revenueByCourse, orders] = await Promise.all([
    prisma.student.count({ where: { tenantId: academy.id, deletedAt: null } }),
    prisma.lmsEnrollment.groupBy({ by: ['courseId'], where: { tenantId: academy.id }, _count: { _all: true } }),
    prisma.lmsAcademyOrder.aggregate({ where: { tenantId: academy.id, status: 'PAID' }, _sum: { amountMinor: true }, _count: { _all: true } }),
    prisma.lmsAcademyOrder.aggregate({ where: { tenantId: academy.id, status: 'PAID', paidAt: { gte: monthStart } }, _sum: { amountMinor: true }, _count: { _all: true } }),
    prisma.lmsAcademyOrder.groupBy({ by: ['courseId'], where: { tenantId: academy.id, status: 'PAID' }, _sum: { amountMinor: true } }),
    prisma.lmsAcademyOrder.findMany({
      where: { tenantId: academy.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { course: { select: { title: true } } },
    }),
  ])
  const students = await prisma.student.findMany({
    where: { id: { in: [...new Set(orders.map((o) => o.studentId))] } },
    select: { id: true, firstName: true, lastName: true, user: { select: { email: true, phone: true } } },
  })
  const who = new Map(students.map((s) => [s.id, s]))
  const learnerCount = new Map(enrolments.map((e) => [e.courseId, e._count._all]))
  const revenue = new Map(revenueByCourse.map((r) => [r.courseId, r._sum.amountMinor ?? 0]))
  const now = Date.now()

  return {
    academy,
    courses: courses.map((c) => ({ ...c, learners: learnerCount.get(c.id) ?? 0, revenueMinor: revenue.get(c.id) ?? 0 })),
    totals: {
      learners,
      enrolments: enrolments.reduce((s, e) => s + e._count._all, 0),
      paidOrders: paid._count._all,
      revenueMinor: paid._sum.amountMinor ?? 0,
      monthOrders: paidMonth._count._all,
      monthRevenueMinor: paidMonth._sum.amountMinor ?? 0,
    },
    orders: orders.map((o) => {
      const s = who.get(o.studentId)
      return {
        id: o.id,
        number: o.number,
        course: o.course.title,
        learner: s ? `${s.firstName} ${s.lastName}`.trim() : 'Learner',
        contact: s?.user?.email ?? s?.user?.phone ?? '',
        amountMinor: o.amountMinor,
        provider: o.provider,
        status: o.status === 'CREATED' && now - o.createdAt.getTime() > ABANDONED_AFTER_MS ? ('ABANDONED' as const) : o.status,
        failureReason: o.failureReason,
        providerPaymentId: o.providerPaymentId,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
      }
    }),
  }
}
