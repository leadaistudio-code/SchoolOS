import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { attendanceDate } from '@/lib/dates'
import { accessibleStudentIds } from '@/server/scope'
import { nextDocumentNumber, financialYearLabel } from '@/server/numbering'
import { paymentProvider } from '@/server/providers'
import { notify } from '@/server/notifications'
import {
  allocatePayment,
  deriveInvoiceStatus,
  refundableMinor,
  sumMinor,
  type Minor,
} from '@/lib/money'

const rupees = z.coerce
  .number()
  .positive('Enter an amount greater than zero')
  .max(10_000_000)
  .transform((v) => Math.round(v * 100))

export const collectSchema = z.object({
  studentId: z.string().min(1, 'Choose a student'),
  amount: rupees,
  mode: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'CARD', 'UPI', 'NET_BANKING']),
  reference: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(300).optional(),
  /** Specific invoices to settle; otherwise oldest-first across all dues. */
  invoiceIds: z.array(z.string()).optional(),
  /** Makes a retried request safe. */
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
})

export type CollectResult = {
  paymentId: string
  receiptNumber: string
  allocatedMinor: Minor
  unallocatedMinor: Minor
  invoices: { number: string; appliedMinor: Minor; balanceMinor: Minor }[]
}

/**
 * Records a payment taken at the counter and settles it against invoices.
 *
 * Everything below happens in ONE transaction: allocation, per-invoice balance
 * and status updates, and the receipt. A crash halfway must not leave a receipt
 * pointing at an invoice that was never credited, or an invoice credited with
 * no receipt to prove it.
 */
export async function collectPayment(
  ctx: AppContext,
  input: z.infer<typeof collectSchema>,
): Promise<CollectResult> {
  ctx.require('fees.collect')

  const student = await ctx.db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      guardians: { select: { parent: { select: { userId: true } } } },
    },
  })
  if (!student) throw notFound('Student')

  // A repeated request with the same key returns the original result instead
  // of taking the money twice.
  if (input.idempotencyKey) {
    const existing = await ctx.db.feePayment.findFirst({
      where: { idempotencyKey: input.idempotencyKey },
      include: { receipt: true, allocations: { include: { invoice: true } } },
    })
    if (existing) {
      return {
        paymentId: existing.id,
        receiptNumber: existing.receipt?.number ?? '',
        allocatedMinor: sumMinor(existing.allocations.map((a) => a.amountMinor)),
        unallocatedMinor:
          existing.amountMinor - sumMinor(existing.allocations.map((a) => a.amountMinor)),
        invoices: existing.allocations.map((a) => ({
          number: a.invoice.number,
          appliedMinor: a.amountMinor,
          balanceMinor: a.invoice.balanceMinor,
        })),
      }
    }
  }

  const result = await ctx.db.$transaction(async (tx) => {
    const outstanding = await tx.feeInvoice.findMany({
      where: {
        studentId: input.studentId,
        balanceMinor: { gt: 0 },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        ...(input.invoiceIds && input.invoiceIds.length > 0
          ? { id: { in: input.invoiceIds } }
          : {}),
      },
      orderBy: { dueOn: 'asc' },
      select: { id: true, number: true, balanceMinor: true, totalMinor: true, paidMinor: true, dueOn: true },
    })

    const { allocations, unallocatedMinor } = allocatePayment(
      input.amount,
      outstanding.map((i) => ({ id: i.id, balanceMinor: i.balanceMinor })),
    )

    const payment = await tx.feePayment.create({
      data: {
        tenantId: ctx.tenant.id,
        studentId: input.studentId,
        amountMinor: input.amount,
        currency: ctx.tenant.currency,
        mode: input.mode,
        // Counter collection is confirmed by the cashier taking it, so it is
        // SUCCESS at once. Gateway payments are not - see startOnlinePayment.
        status: 'SUCCESS',
        provider: 'manual',
        reference: input.reference,
        notes: input.notes,
        idempotencyKey: input.idempotencyKey,
        paidAt: new Date(),
        collectedById: ctx.user.userId,
      },
    })

    const applied: CollectResult['invoices'] = []

    for (const allocation of allocations) {
      const invoice = outstanding.find((i) => i.id === allocation.id)!
      const paidMinor = invoice.paidMinor + allocation.amountMinor
      const balanceMinor = invoice.totalMinor - paidMinor

      await tx.feePaymentAllocation.create({
        data: {
          tenantId: ctx.tenant.id,
          paymentId: payment.id,
          invoiceId: invoice.id,
          amountMinor: allocation.amountMinor,
        },
      })

      await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidMinor,
          balanceMinor,
          status: deriveInvoiceStatus({
            totalMinor: invoice.totalMinor,
            paidMinor,
            dueOn: invoice.dueOn,
          }),
        },
      })

      applied.push({
        number: invoice.number,
        appliedMinor: allocation.amountMinor,
        balanceMinor,
      })
    }

    const receiptNumber = await nextDocumentNumber(tx, {
      tenantId: ctx.tenant.id,
      kind: 'RECEIPT',
      sessionLabel: financialYearLabel(new Date()),
    })

    await tx.feeReceipt.create({
      data: { tenantId: ctx.tenant.id, number: receiptNumber, paymentId: payment.id },
    })

    return {
      paymentId: payment.id,
      receiptNumber,
      allocatedMinor: input.amount - unallocatedMinor,
      unallocatedMinor,
      invoices: applied,
    }
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_payment.collect',
    module: 'fees',
    entityType: 'FeePayment',
    entityId: result.paymentId,
    summary: `Collected ₹${input.amount / 100} from ${student.firstName} ${student.lastName} (${student.admissionNo}) by ${input.mode.toLowerCase()}, receipt ${result.receiptNumber}${result.unallocatedMinor > 0 ? `, ₹${result.unallocatedMinor / 100} held as advance` : ''}`,
    after: { amountMinor: input.amount, mode: input.mode, receipt: result.receiptNumber },
  })

  await notify(ctx, {
    userIds: student.guardians
      .map((g) => g.parent.userId)
      .filter((id): id is string => !!id),
    eventKey: 'fee.payment_received',
    title: 'Fee payment received',
    body: `We have received ₹${(input.amount / 100).toLocaleString('en-IN')} for ${student.firstName}. Receipt ${result.receiptNumber}.`,
    linkUrl: '/finance',
  })

  return result
}

/* --------------------------------------------------------- online payment */

export const startPaymentSchema = z.object({
  studentId: z.string().min(1),
  amount: rupees,
  invoiceIds: z.array(z.string()).optional(),
})

/**
 * Opens an online payment.
 *
 * The FeePayment row is created as INITIATED before the parent leaves for the
 * gateway, so a payment that succeeds at the bank but never returns to us is
 * still visible and reconcilable rather than invisible.
 */
export async function startOnlinePayment(
  ctx: AppContext,
  input: z.infer<typeof startPaymentSchema>,
) {
  ctx.require('fees.view')

  const allowed = await accessibleStudentIds(ctx)
  if (allowed !== null && !allowed.includes(input.studentId)) {
    throw new ApiException(403, 'FORBIDDEN', 'You cannot pay for this student')
  }

  const student = await ctx.db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardians: {
        take: 1,
        select: { parent: { select: { email: true, phone: true, firstName: true } } },
      },
    },
  })
  if (!student) throw notFound('Student')

  const due = await ctx.db.feeInvoice.aggregate({
    where: {
      studentId: input.studentId,
      balanceMinor: { gt: 0 },
      status: { notIn: ['CANCELLED', 'DRAFT'] },
    },
    _sum: { balanceMinor: true },
  })

  const outstanding = due._sum.balanceMinor ?? 0
  if (outstanding <= 0) throw conflict('There is nothing outstanding for this student')
  if (input.amount > outstanding) {
    throw new ApiException(
      400,
      'BAD_REQUEST',
      `The amount is more than the ₹${outstanding / 100} outstanding`,
    )
  }

  const payment = await ctx.db.feePayment.create({
    data: {
      tenantId: ctx.tenant.id,
      studentId: input.studentId,
      amountMinor: input.amount,
      currency: ctx.tenant.currency,
      mode: 'ONLINE',
      status: 'INITIATED',
      provider: paymentProvider().name,
      notes: input.invoiceIds?.length ? `invoices:${input.invoiceIds.join(',')}` : null,
    },
  })

  const guardian = student.guardians[0]?.parent
  const order = await paymentProvider().createOrder({
    tenantId: ctx.tenant.id,
    amountMinor: input.amount,
    currency: ctx.tenant.currency,
    reference: payment.id,
    customer: {
      name: guardian?.firstName ?? `${student.firstName} ${student.lastName}`,
      email: guardian?.email,
      phone: guardian?.phone,
    },
    returnUrl: `/finance/payments/${payment.id}`,
  })

  await ctx.db.feePayment.update({
    where: { id: payment.id },
    data: { providerOrderId: order.providerOrderId, providerResponse: order.raw as never },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_payment.initiate',
    module: 'fees',
    entityType: 'FeePayment',
    entityId: payment.id,
    summary: `Started an online payment of ₹${input.amount / 100} for ${student.firstName} ${student.lastName}`,
  })

  return {
    paymentId: payment.id,
    providerOrderId: order.providerOrderId,
    checkoutUrl: order.checkoutUrl,
    amountMinor: input.amount,
  }
}

export type SettlementOutcome = {
  status: 'SUCCESS' | 'FAILED' | 'IGNORED'
  reason?: string
  receiptNumber?: string
}

/**
 * Settles a verified online payment.
 *
 * This is the ONLY path that turns an online payment into money, and it is
 * reached only from a signature-verified webhook or a server-to-server fetch.
 * It runs on the unscoped client because a webhook arrives without a session -
 * the tenant comes from the payment row itself, which the provider reference
 * identified.
 *
 * Replay-safe: a payment already SUCCESS returns IGNORED without touching a
 * single balance.
 */
export async function settleOnlinePayment(params: {
  paymentId: string
  providerPaymentId: string
  verifiedAmountMinor?: number
  raw: unknown
}): Promise<SettlementOutcome> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.feePayment.findUnique({
      where: { id: params.paymentId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            guardians: { select: { parent: { select: { userId: true } } } },
          },
        },
      },
    })

    if (!payment) return { status: 'IGNORED', reason: 'Unknown payment' }

    if (payment.status === 'SUCCESS') {
      return { status: 'IGNORED', reason: 'Already settled' }
    }
    if (payment.status === 'REFUNDED' || payment.status === 'CANCELLED') {
      return { status: 'IGNORED', reason: `Payment is ${payment.status.toLowerCase()}` }
    }

    // The amount is taken from OUR record, not the callback. A tampered
    // webhook claiming a larger amount cannot credit more than was ordered.
    if (
      params.verifiedAmountMinor !== undefined &&
      params.verifiedAmountMinor !== payment.amountMinor
    ) {
      await tx.feePayment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          failureReason: `Amount mismatch: gateway reported ${params.verifiedAmountMinor}, order was ${payment.amountMinor}`,
          providerPaymentId: params.providerPaymentId,
          providerResponse: params.raw as never,
        },
      })
      return { status: 'FAILED', reason: 'Amount did not match the order' }
    }

    const outstanding = await tx.feeInvoice.findMany({
      where: {
        tenantId: payment.tenantId,
        studentId: payment.studentId,
        balanceMinor: { gt: 0 },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      orderBy: { dueOn: 'asc' },
      select: { id: true, number: true, balanceMinor: true, totalMinor: true, paidMinor: true, dueOn: true },
    })

    const { allocations } = allocatePayment(
      payment.amountMinor,
      outstanding.map((i) => ({ id: i.id, balanceMinor: i.balanceMinor })),
    )

    for (const allocation of allocations) {
      const invoice = outstanding.find((i) => i.id === allocation.id)!
      const paidMinor = invoice.paidMinor + allocation.amountMinor

      await tx.feePaymentAllocation.create({
        data: {
          tenantId: payment.tenantId,
          paymentId: payment.id,
          invoiceId: invoice.id,
          amountMinor: allocation.amountMinor,
        },
      })

      await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidMinor,
          balanceMinor: invoice.totalMinor - paidMinor,
          status: deriveInvoiceStatus({
            totalMinor: invoice.totalMinor,
            paidMinor,
            dueOn: invoice.dueOn,
          }),
        },
      })
    }

    await tx.feePayment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        paidAt: new Date(),
        providerPaymentId: params.providerPaymentId,
        providerResponse: params.raw as never,
      },
    })

    const receiptNumber = await nextDocumentNumber(tx, {
      tenantId: payment.tenantId,
      kind: 'RECEIPT',
      sessionLabel: financialYearLabel(new Date()),
    })

    await tx.feeReceipt.create({
      data: { tenantId: payment.tenantId, number: receiptNumber, paymentId: payment.id },
    })

    await tx.auditLog.create({
      data: {
        tenantId: payment.tenantId,
        actorLabel: 'Payment gateway',
        action: 'fee_payment.settled',
        module: 'fees',
        entityType: 'FeePayment',
        entityId: payment.id,
        summary: `Online payment of ₹${payment.amountMinor / 100} verified and settled across ${allocations.length} invoices, receipt ${receiptNumber}`,
      },
    })

    return { status: 'SUCCESS', receiptNumber }
  })
}

/**
 * Handles an inbound gateway webhook.
 *
 * The signature is checked before anything is trusted, and every callback is
 * recorded verbatim in PaymentEvent - including rejected ones, which is what
 * makes an attempted forgery visible afterwards.
 */
export async function handleWebhook(
  rawBody: string,
  signature: string | null,
): Promise<{ handled: boolean; reason: string }> {
  const provider = paymentProvider()
  const verification = await provider.verifyWebhook(rawBody, signature)

  const body = safeJson(rawBody)
  const externalId = String(body?.eventId ?? body?.paymentId ?? '')

  // A replayed webhook hits this unique constraint and is dropped before it
  // can touch any balance.
  const existing = externalId
    ? await prisma.paymentEvent.findUnique({
        where: { provider_externalId: { provider: provider.name, externalId } },
      })
    : null

  if (existing) return { handled: false, reason: 'Duplicate event' }

  const paymentId = String(body?.reference ?? '')
  const payment = paymentId
    ? await prisma.feePayment.findUnique({
        where: { id: paymentId },
        select: { id: true, tenantId: true },
      })
    : null

  await prisma.paymentEvent.create({
    data: {
      tenantId: payment?.tenantId ?? null,
      paymentId: payment?.id ?? null,
      provider: provider.name,
      eventType: String(body?.event ?? 'payment.update'),
      externalId: externalId || null,
      signatureValid: verification.verified,
      payload: (body ?? { raw: rawBody }) as never,
      processedAt: new Date(),
    },
  })

  if (!verification.verified) {
    console.warn('[payments] rejected a webhook with an invalid signature', { externalId })
    return { handled: false, reason: 'Invalid signature' }
  }
  if (!payment) return { handled: false, reason: 'Unknown payment reference' }

  if (verification.status !== 'SUCCESS') {
    await prisma.feePayment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: 'Gateway reported failure',
        providerResponse: (body ?? {}) as never,
      },
    })
    return { handled: true, reason: 'Recorded a failed payment' }
  }

  const outcome = await settleOnlinePayment({
    paymentId: payment.id,
    providerPaymentId: verification.providerPaymentId ?? externalId,
    verifiedAmountMinor: verification.amountMinor,
    raw: body,
  })

  return { handled: outcome.status === 'SUCCESS', reason: outcome.reason ?? outcome.status }
}

function safeJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/* ----------------------------------------------------------------- refunds */

export const refundSchema = z.object({
  paymentId: z.string().min(1),
  amount: rupees,
  reason: z.string().trim().min(5, 'Give a reason for the refund').max(300),
})

/**
 * Refunds part or all of a payment.
 *
 * The refunded amount is taken back off the invoices it settled, so a refund
 * restores the balance rather than leaving an invoice looking paid.
 */
export async function refundPayment(ctx: AppContext, input: z.infer<typeof refundSchema>) {
  ctx.require('fees.refund')

  const payment = await ctx.db.feePayment.findFirst({
    where: { id: input.paymentId },
    include: {
      refunds: true,
      allocations: { include: { invoice: true } },
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
    },
  })
  if (!payment) throw notFound('Payment')
  if (payment.status !== 'SUCCESS' && payment.status !== 'PARTIALLY_REFUNDED') {
    throw conflict(`A ${payment.status.toLowerCase()} payment cannot be refunded`)
  }

  const alreadyRefunded = sumMinor(
    payment.refunds.filter((r) => r.status !== 'FAILED').map((r) => r.amountMinor),
  )
  const available = refundableMinor(payment.amountMinor, alreadyRefunded)

  if (input.amount > available) {
    throw new ApiException(
      400,
      'BAD_REQUEST',
      available === 0
        ? 'This payment has already been fully refunded'
        : `Only ₹${available / 100} of this payment can still be refunded`,
    )
  }

  const refund = await ctx.db.$transaction(async (tx) => {
    let remaining = input.amount

    // Unwind the allocations in reverse, so the most recently settled invoice
    // is the first to reopen.
    for (const allocation of [...payment.allocations].reverse()) {
      if (remaining <= 0) break

      const take = Math.min(allocation.amountMinor, remaining)
      const invoice = allocation.invoice
      const paidMinor = Math.max(0, invoice.paidMinor - take)

      await tx.feeInvoice.update({
        where: { id: invoice.id },
        data: {
          paidMinor,
          balanceMinor: invoice.totalMinor - paidMinor,
          status: deriveInvoiceStatus({
            totalMinor: invoice.totalMinor,
            paidMinor,
            dueOn: invoice.dueOn,
          }),
        },
      })

      await tx.feePaymentAllocation.update({
        where: { id: allocation.id },
        data: { amountMinor: allocation.amountMinor - take },
      })

      remaining -= take
    }

    const totalRefunded = alreadyRefunded + input.amount

    await tx.feePayment.update({
      where: { id: payment.id },
      data: {
        status: totalRefunded >= payment.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      },
    })

    return tx.feeRefund.create({
      data: {
        tenantId: ctx.tenant.id,
        paymentId: payment.id,
        amountMinor: input.amount,
        reason: input.reason,
        status: 'SUCCESS',
        approvedById: ctx.user.userId,
        completedAt: new Date(),
      },
    })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_payment.refund',
    module: 'fees',
    entityType: 'FeePayment',
    entityId: payment.id,
    summary: `Refunded ₹${input.amount / 100} to ${payment.student.firstName} ${payment.student.lastName} (${payment.student.admissionNo}): ${input.reason}`,
    before: { status: payment.status, refundedMinor: alreadyRefunded },
    after: { refundedMinor: alreadyRefunded + input.amount },
  })

  return refund
}

/* ------------------------------------------------------------ payment list */

export const paymentFilterSchema = z.object({
  status: z
    .enum(['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'])
    .optional(),
  mode: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})

export async function listPayments(
  ctx: AppContext,
  query: { page: number; pageSize: number; q?: string },
  filter: z.infer<typeof paymentFilterSchema>,
) {
  ctx.require('fees.view')

  const allowed = await accessibleStudentIds(ctx)

  const where: Prisma.FeePaymentWhereInput = {
    ...(allowed === null ? {} : { studentId: { in: allowed } }),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.mode ? { mode: filter.mode as never } : {}),
    ...(filter.from || filter.to
      ? {
          paidAt: {
            ...(filter.from ? { gte: attendanceDate(filter.from) } : {}),
            ...(filter.to
              ? { lte: new Date(attendanceDate(filter.to).getTime() + 86_399_000) }
              : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { reference: { contains: query.q, mode: 'insensitive' } },
            { receipt: { number: { contains: query.q, mode: 'insensitive' } } },
            { student: { firstName: { contains: query.q, mode: 'insensitive' } } },
            { student: { lastName: { contains: query.q, mode: 'insensitive' } } },
            { student: { admissionNo: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [rows, total, agg] = await Promise.all([
    ctx.db.feePayment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        amountMinor: true,
        mode: true,
        status: true,
        reference: true,
        paidAt: true,
        createdAt: true,
        provider: true,
        receipt: { select: { number: true } },
        refunds: { select: { amountMinor: true, status: true } },
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
      },
    }),
    ctx.db.feePayment.count({ where }),
    ctx.db.feePayment.aggregate({
      where: { ...where, status: 'SUCCESS' },
      _sum: { amountMinor: true },
    }),
  ])

  return {
    total,
    collectedMinor: agg._sum.amountMinor ?? 0,
    rows: rows.map((p) => ({
      id: p.id,
      amountMinor: p.amountMinor,
      mode: p.mode,
      status: p.status,
      reference: p.reference,
      provider: p.provider,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
      receiptNumber: p.receipt?.number ?? null,
      refundedMinor: sumMinor(
        p.refunds.filter((r) => r.status !== 'FAILED').map((r) => r.amountMinor),
      ),
      studentId: p.student.id,
      studentName: `${p.student.firstName} ${p.student.lastName}`,
      admissionNo: p.student.admissionNo,
    })),
  }
}

export async function getReceipt(ctx: AppContext, paymentId: string) {
  ctx.require('fees.view')

  const allowed = await accessibleStudentIds(ctx)

  const payment = await ctx.db.feePayment.findFirst({
    where: {
      id: paymentId,
      ...(allowed === null ? {} : { studentId: { in: allowed } }),
    },
    include: {
      receipt: true,
      refunds: true,
      student: {
        select: {
          firstName: true,
          lastName: true,
          admissionNo: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: {
              rollNumber: true,
              classLevel: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
          guardians: {
            where: { isPrimary: true },
            take: 1,
            select: { parent: { select: { firstName: true, lastName: true } } },
          },
        },
      },
      allocations: {
        include: {
          invoice: {
            select: {
              number: true,
              title: true,
              lines: { select: { label: true, amountMinor: true, discountMinor: true } },
            },
          },
        },
      },
    },
  })

  if (!payment) throw notFound('Payment')
  return payment
}
