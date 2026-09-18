import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { accessibleStudentIds, isPortalOnlyRole } from '@/server/scope'
import { nextDocumentNumber, financialYearLabel } from '@/server/numbering'
import { paymentProvider } from '@/server/providers'
import { notify } from '@/server/notifications'
import { ROLE } from '@/lib/rbac/roles'
import {
  allocatePayment,
  computeInvoiceTotals,
  deriveInvoiceStatus,
  sumMinor,
  type Minor,
} from '@/lib/money'

const rupees = z.coerce
  .number()
  .positive('Enter an amount greater than zero')
  .max(10_000_000)
  .transform((v) => Math.round(v * 100))

const rupeesOrZero = z.coerce
  .number()
  .min(0)
  .max(10_000_000)
  .transform((v) => Math.round(v * 100))

export const collectSchema = z
  .object({
    studentId: z.string().min(1, 'Choose a student'),
    collectedById: z.string().min(1, 'Choose the accountant who collected this payment').optional(),
    amount: rupeesOrZero,
    /** One-shot counter waive in rupees, applied oldest-first before the cash settles. */
    discount: rupeesOrZero.optional(),
    discountReason: z.string().trim().min(3).max(300).optional(),
    mode: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'CARD', 'UPI', 'NET_BANKING']),
    reference: z.string().trim().max(60).optional(),
    /** Serial from the school's paper receipt book, when one was also issued. */
    billBookNo: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(300).optional(),
    /**
     * Calendar day the money was actually received (YYYY-MM-DD).
     * Defaults to today; set earlier for a backdated counter entry.
     */
    paidOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid payment date')
      .optional(),
    /** Specific invoices to settle; otherwise oldest-first across all dues. */
    invoiceIds: z.array(z.string()).optional(),
    /** Makes a retried request safe. */
    idempotencyKey: z.string().trim().min(8).max(80).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.amount <= 0 && !(data.discount && data.discount > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'Enter an amount greater than zero',
      })
    }
    if ((data.discount ?? 0) > 0 && !data.discountReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountReason'],
        message: 'Enter a reason for the discount',
      })
    }
    if (data.paidOn) {
      const paid = attendanceDate(data.paidOn)
      const today = attendanceDate(new Date())
      if (paid.getTime() > today.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paidOn'],
          message: 'Payment date cannot be in the future',
        })
      }
      // Guard against absurdly old ledger dates (typos / wrong century).
      const earliest = attendanceDate(
        new Date(Date.UTC(today.getUTCFullYear() - 5, today.getUTCMonth(), today.getUTCDate())),
      )
      if (paid.getTime() < earliest.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paidOn'],
          message: 'Payment date cannot be more than 5 years ago',
        })
      }
    }
  })

export type CollectResult = {
  paymentId: string
  receiptNumber: string
  allocatedMinor: Minor
  unallocatedMinor: Minor
  discountedMinor: Minor
  invoices: { number: string; appliedMinor: Minor; balanceMinor: Minor }[]
}

export async function feeCollectorOptions(ctx: AppContext) {
  ctx.require('fees.collect')
  return ctx.db.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      OR: [
        { id: ctx.user.userId },
        { roles: { some: { role: { key: ROLE.ACCOUNTANT } } } },
      ],
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      staff: { select: { employeeCode: true } },
    },
  })
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
  const discountMinor = input.discount ?? 0
  if (discountMinor > 0) ctx.require('fees.concession')
  const paidAt = attendanceDate(input.paidOn ?? toDateInput(new Date()))

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

  const collectorId = input.collectedById ?? ctx.user.userId
  const collector = await ctx.db.user.findFirst({
    where: {
      id: collectorId,
      deletedAt: null,
      status: 'ACTIVE',
      OR: [
        { id: ctx.user.userId },
        { roles: { some: { role: { key: ROLE.ACCOUNTANT } } } },
      ],
    },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!collector) {
    throw conflict('Choose an active accountant from this school')
  }

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
        discountedMinor: 0,
        invoices: existing.allocations.map((a) => ({
          number: a.invoice.number,
          appliedMinor: a.amountMinor,
          balanceMinor: a.invoice.balanceMinor,
        })),
      }
    }
  }

  const result = await ctx.db.$transaction(async (tx) => {
    // Serialize every counter touching this student's open invoices. Without
    // row locks two cashiers can both calculate from the same stale balance.
    await tx.$queryRaw`
      SELECT "id"
      FROM "FeeInvoice"
      WHERE "tenantId" = ${ctx.tenant.id}
        AND "studentId" = ${input.studentId}
        AND "balanceMinor" > 0
        AND "status" NOT IN ('CANCELLED', 'DRAFT')
      ORDER BY "dueOn", "id"
      FOR UPDATE`
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
      select: {
        id: true,
        number: true,
        balanceMinor: true,
        totalMinor: true,
        paidMinor: true,
        dueOn: true,
        lateFeeMinor: true,
        discountMinor: true,
        subtotalMinor: true,
        taxMinor: true,
        lines: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            amountMinor: true,
            discountMinor: true,
            taxPercent: true,
          },
        },
      },
    })

    let discountedMinor = 0
    const discountReason = input.discountReason?.trim()
    if (discountMinor > 0) {
      let remainingDiscount = discountMinor
      for (const invoice of outstanding) {
        if (remainingDiscount <= 0) break
        const waivable = Math.max(0, invoice.totalMinor - invoice.paidMinor)
        if (waivable <= 0) continue

        const take = Math.min(remainingDiscount, waivable)
        let applied = 0

        if (invoice.lines.length === 0) {
          applied = take
          const totals = {
            subtotalMinor: invoice.subtotalMinor,
            discountMinor: invoice.discountMinor + applied,
            taxMinor: invoice.taxMinor,
            lateFeeMinor: invoice.lateFeeMinor,
            totalMinor: invoice.totalMinor - applied,
          }
          const balanceMinor = totals.totalMinor - invoice.paidMinor
          await tx.feeInvoice.update({
            where: { id: invoice.id },
            data: {
              discountMinor: totals.discountMinor,
              totalMinor: totals.totalMinor,
              balanceMinor,
              status: deriveInvoiceStatus({
                totalMinor: totals.totalMinor,
                paidMinor: invoice.paidMinor,
                dueOn: invoice.dueOn,
              }),
            },
          })
          invoice.balanceMinor = balanceMinor
          invoice.totalMinor = totals.totalMinor
        } else {
          let lineBudget = take
          const nextLines = invoice.lines.map((line) => {
            const room = Math.max(0, line.amountMinor - line.discountMinor)
            const add = Math.min(room, lineBudget)
            lineBudget -= add
            return {
              id: line.id,
              amountMinor: line.amountMinor,
              discountMinor: line.discountMinor + add,
              taxPercent: line.taxPercent,
            }
          })

          // Prefer reducing invoice total without creating a refundable credit:
          // never let the new total fall below money already paid.
          applied = take - lineBudget
          let totals = computeInvoiceTotals(nextLines, invoice.lateFeeMinor)
          while (applied > 0 && totals.totalMinor < invoice.paidMinor) {
            applied -= 1
            let shrinkLeft = 1
            for (let i = nextLines.length - 1; i >= 0 && shrinkLeft > 0; i--) {
              const line = nextLines[i]!
              const original = invoice.lines[i]!.discountMinor
              if (line.discountMinor > original) {
                line.discountMinor -= 1
                shrinkLeft -= 1
              }
            }
            totals = computeInvoiceTotals(nextLines, invoice.lateFeeMinor)
          }
          if (applied <= 0) continue

          for (let i = 0; i < nextLines.length; i++) {
            const line = nextLines[i]!
            if (line.discountMinor === invoice.lines[i]!.discountMinor) continue
            await tx.feeInvoiceLine.update({
              where: { id: line.id },
              data: { discountMinor: line.discountMinor },
            })
          }

          const balanceMinor = totals.totalMinor - invoice.paidMinor
          await tx.feeInvoice.update({
            where: { id: invoice.id },
            data: {
              subtotalMinor: totals.subtotalMinor,
              discountMinor: totals.discountMinor,
              taxMinor: totals.taxMinor,
              totalMinor: totals.totalMinor,
              balanceMinor,
              status: deriveInvoiceStatus({
                totalMinor: totals.totalMinor,
                paidMinor: invoice.paidMinor,
                dueOn: invoice.dueOn,
              }),
            },
          })
          invoice.balanceMinor = balanceMinor
          invoice.totalMinor = totals.totalMinor
        }

        discountedMinor += applied
        remainingDiscount -= applied
      }

      if (discountedMinor <= 0) {
        throw conflict('No open invoice balance is available to discount')
      }
      if (remainingDiscount > 0) {
        throw conflict(
          `Only ₹${(discountedMinor / 100).toFixed(2)} can be discounted against the current dues`,
        )
      }
    }

    const { allocations, unallocatedMinor } =
      input.amount > 0
        ? allocatePayment(
            input.amount,
            outstanding.map((i) => ({ id: i.id, balanceMinor: i.balanceMinor })),
          )
        : { allocations: [] as { id: string; amountMinor: number }[], unallocatedMinor: 0 }

    const paymentNotes = [
      discountedMinor > 0
        ? `Counter discount ₹${(discountedMinor / 100).toFixed(2)}${discountReason ? `: ${discountReason}` : ''}`
        : null,
      input.notes?.trim() || null,
    ]
      .filter(Boolean)
      .join('\n')

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
        billBookNo: input.billBookNo,
        notes: paymentNotes || null,
        idempotencyKey: input.idempotencyKey,
        paidAt,
        collectedById: collector.id,
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
      sessionLabel: financialYearLabel(paidAt),
    })

    await tx.feeReceipt.create({
      data: { tenantId: ctx.tenant.id, number: receiptNumber, paymentId: payment.id },
    })

    if (discountedMinor > 0) {
      // One audit row per collection keeps the ledger readable; invoice links
      // are already reflected in the lowered invoice totals above.
      await tx.feeAdjustment.create({
        data: {
          tenantId: ctx.tenant.id,
          studentId: input.studentId,
          type: 'CREDIT',
          amountMinor: discountedMinor,
          reason: `Counter discount on receipt ${receiptNumber}: ${discountReason}`,
          createdById: ctx.user.userId,
        },
      })
    }

    if (unallocatedMinor > 0) {
      await tx.studentFeeCredit.create({
        data: {
          tenantId: ctx.tenant.id,
          studentId: input.studentId,
          type: 'CREDIT',
          amountMinor: unallocatedMinor,
          paymentId: payment.id,
          reference: receiptNumber,
          notes: 'Advance payment available for future fees',
          createdById: ctx.user.userId,
        },
      })
    }

    return {
      paymentId: payment.id,
      receiptNumber,
      allocatedMinor: input.amount - unallocatedMinor,
      unallocatedMinor,
      discountedMinor,
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
    summary: `Collected ₹${input.amount / 100} from ${student.firstName} ${student.lastName} (${student.admissionNo}) by ${input.mode.toLowerCase()}, receipt ${result.receiptNumber}${result.discountedMinor > 0 ? `, discounted ₹${result.discountedMinor / 100}` : ''}${input.billBookNo ? `, bill book ${input.billBookNo}` : ''}${result.unallocatedMinor > 0 ? `, ₹${result.unallocatedMinor / 100} held as advance` : ''}`,
    after: {
      amountMinor: input.amount,
      discountMinor: result.discountedMinor,
      discountReason: input.discountReason ?? null,
      mode: input.mode,
      receipt: result.receiptNumber,
      billBookNo: input.billBookNo ?? null,
      paidOn: toDateInput(paidAt),
      collectedById: collector.id,
      collectedBy: `${collector.firstName} ${collector.lastName}`,
    },
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
        where: isPortalOnlyRole(ctx.user.roleKeys)
          ? { parent: { userId: ctx.user.userId } }
          : { isPrimary: true },
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
    await tx.$queryRaw`SELECT "id" FROM "FeePayment" WHERE "id" = ${params.paymentId} FOR UPDATE`
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
      params.verifiedAmountMinor === undefined
      || params.verifiedAmountMinor !== payment.amountMinor
    ) {
      await tx.feePayment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          failureReason: params.verifiedAmountMinor === undefined
            ? 'Gateway verification did not include an amount'
            : `Amount mismatch: gateway reported ${params.verifiedAmountMinor}, order was ${payment.amountMinor}`,
          providerPaymentId: params.providerPaymentId,
          providerResponse: params.raw as never,
        },
      })
      return {
        status: 'FAILED',
        reason: params.verifiedAmountMinor === undefined
          ? 'Gateway did not verify the amount'
          : 'Amount did not match the order',
      }
    }

    const selectedInvoiceIds = payment.notes?.startsWith('invoices:')
      ? payment.notes.slice('invoices:'.length).split(',').filter(Boolean)
      : []
    await tx.$queryRaw`
      SELECT "id"
      FROM "FeeInvoice"
      WHERE "tenantId" = ${payment.tenantId}
        AND "studentId" = ${payment.studentId}
        AND "balanceMinor" > 0
        AND "status" NOT IN ('CANCELLED', 'DRAFT')
      ORDER BY "dueOn", "id"
      FOR UPDATE`
    const outstanding = await tx.feeInvoice.findMany({
      where: {
        tenantId: payment.tenantId,
        studentId: payment.studentId,
        balanceMinor: { gt: 0 },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        ...(selectedInvoiceIds.length > 0 ? { id: { in: selectedInvoiceIds } } : {}),
      },
      orderBy: { dueOn: 'asc' },
      select: { id: true, number: true, balanceMinor: true, totalMinor: true, paidMinor: true, dueOn: true },
    })

    const { allocations, unallocatedMinor } = allocatePayment(
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

    if (unallocatedMinor > 0) {
      await tx.studentFeeCredit.create({
        data: {
          tenantId: payment.tenantId,
          studentId: payment.studentId,
          type: 'CREDIT',
          amountMinor: unallocatedMinor,
          paymentId: payment.id,
          reference: receiptNumber,
          notes: 'Online advance available for future fees',
        },
      })
    }

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

  // A fully processed event is final. An event left with processedAt=null is
  // an inbox item whose prior settlement was interrupted and may be retried.
  const existing = externalId
    ? await prisma.paymentEvent.findUnique({
        where: { provider_externalId: { provider: provider.name, externalId } },
      })
    : null

  if (existing?.processedAt) return { handled: false, reason: 'Duplicate event' }

  const paymentId = String(body?.reference ?? '')
  const payment = paymentId
    ? await prisma.feePayment.findUnique({
        where: { id: paymentId },
        select: { id: true, tenantId: true },
      })
    : null

  const event = existing ?? await prisma.paymentEvent.create({
    data: {
      tenantId: payment?.tenantId ?? null,
      paymentId: payment?.id ?? null,
      provider: provider.name,
      eventType: String(body?.event ?? 'payment.update'),
      externalId: externalId || null,
      signatureValid: verification.verified,
      payload: (body ?? { raw: rawBody }) as never,
      processedAt: null,
    },
  })

  if (!verification.verified) {
    await prisma.paymentEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } })
    console.warn('[payments] rejected a webhook with an invalid signature', { externalId })
    return { handled: false, reason: 'Invalid signature' }
  }
  if (!payment) {
    await prisma.paymentEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } })
    return { handled: false, reason: 'Unknown payment reference' }
  }

  if (verification.status !== 'SUCCESS') {
    // Failure callbacks are monotonic: they may close an open attempt but can
    // never downgrade settled/refunded/reversed money.
    await prisma.feePayment.updateMany({
      where: { id: payment.id, status: { in: ['INITIATED', 'PENDING'] } },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: 'Gateway reported failure',
        providerResponse: (body ?? {}) as never,
      },
    })
    await prisma.paymentEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } })
    return { handled: true, reason: 'Recorded a failed payment' }
  }

  const outcome = await settleOnlinePayment({
    paymentId: payment.id,
    providerPaymentId: verification.providerPaymentId ?? externalId,
    verifiedAmountMinor: verification.amountMinor,
    raw: body,
  })
  await prisma.paymentEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } })

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
  const paymentKind = await ctx.db.feePayment.findFirst({
    where: { id: input.paymentId },
    select: { provider: true },
  })
  if (!paymentKind) throw notFound('Payment')
  if (paymentKind.provider !== 'manual') return refundOnlinePayment(ctx, input)
  const result = await ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "FeePayment" WHERE "id" = ${input.paymentId} AND "tenantId" = ${ctx.tenant.id} FOR UPDATE`
    const payment = await tx.feePayment.findFirst({
      where: { id: input.paymentId },
      include: {
        refunds: { include: { allocations: true } },
        allocations: { include: { invoice: true } },
        creditEntries: true,
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
      },
    })
    if (!payment) throw notFound('Payment')
    if (payment.provider !== 'manual') {
      throw conflict('Online payments must be refunded through the payment gateway reconciliation flow')
    }
    if (payment.status !== 'SUCCESS' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw conflict(`A ${payment.status.toLowerCase()} payment cannot be refunded`)
    }
    const alreadyRefunded = sumMinor(
      payment.refunds.filter((refund) => refund.status !== 'FAILED').map((refund) => refund.amountMinor),
    )
    const advanceAvailable = sumMinor(payment.creditEntries.map((entry) =>
      entry.type === 'CREDIT' || entry.type === 'ADJUSTMENT'
        ? entry.amountMinor
        : -entry.amountMinor))
    const refundedByInvoice = new Map<string, number>()
    for (const prior of payment.refunds.filter((refund) => refund.status !== 'FAILED')) {
      for (const allocation of prior.allocations) {
        refundedByInvoice.set(
          allocation.invoiceId,
          (refundedByInvoice.get(allocation.invoiceId) ?? 0) + allocation.amountMinor,
        )
      }
    }
    const allocationAvailable = sumMinor(payment.allocations.map((allocation) =>
      Math.max(0, allocation.amountMinor - (refundedByInvoice.get(allocation.invoiceId) ?? 0))))
    const available = allocationAvailable + Math.max(0, advanceAvailable)
    if (input.amount > available) {
      throw new ApiException(
        400,
        'BAD_REQUEST',
        available === 0
          ? 'No refundable balance remains on this payment'
          : `Only ₹${available / 100} is currently refundable`,
      )
    }
    const refund = await tx.feeRefund.create({
      data: {
        tenantId: ctx.tenant.id,
        paymentId: payment.id,
        amountMinor: input.amount,
        reason: input.reason,
        status: 'PENDING',
        approvedById: ctx.user.userId,
      },
    })
    let remaining = input.amount

    // Unwind the allocations in reverse, so the most recently settled invoice
    // is the first to reopen.
    for (const allocation of [...payment.allocations].reverse()) {
      if (remaining <= 0) break

      const allocationRemaining = Math.max(
        0,
        allocation.amountMinor - (refundedByInvoice.get(allocation.invoiceId) ?? 0),
      )
      const take = Math.min(allocationRemaining, remaining)
      if (take <= 0) continue
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

      await tx.feeRefundAllocation.create({
        data: {
          tenantId: ctx.tenant.id,
          refundId: refund.id,
          invoiceId: allocation.invoiceId,
          amountMinor: take,
        },
      })

      remaining -= take
    }

    if (remaining > 0) {
      await tx.studentFeeCredit.create({
        data: {
          tenantId: ctx.tenant.id,
          studentId: payment.studentId,
          type: 'REFUND',
          amountMinor: remaining,
          paymentId: payment.id,
          notes: input.reason,
          createdById: ctx.user.userId,
        },
      })
      remaining = 0
    }

    const totalRefunded = alreadyRefunded + input.amount

    await tx.feePayment.update({
      where: { id: payment.id },
      data: {
        status: totalRefunded >= payment.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      },
    })

    const completed = await tx.feeRefund.update({
      where: { id: refund.id },
      data: { status: 'SUCCESS', completedAt: new Date() },
    })
    return { refund: completed, payment, alreadyRefunded }
  }, { isolationLevel: 'Serializable' })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_payment.refund',
    module: 'fees',
    entityType: 'FeePayment',
    entityId: result.payment.id,
    summary: `Refunded ₹${input.amount / 100} to ${result.payment.student.firstName} ${result.payment.student.lastName} (${result.payment.student.admissionNo}): ${input.reason}`,
    before: { status: result.payment.status, refundedMinor: result.alreadyRefunded },
    after: { refundedMinor: result.alreadyRefunded + input.amount },
  })

  return result.refund
}

async function refundOnlinePayment(ctx: AppContext, input: z.infer<typeof refundSchema>) {
  const reserved = await ctx.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "FeePayment" WHERE "id" = ${input.paymentId} AND "tenantId" = ${ctx.tenant.id} FOR UPDATE`
    const payment = await tx.feePayment.findFirst({
      where: { id: input.paymentId },
      include: {
        refunds: { include: { allocations: true } },
        allocations: { include: { invoice: true } },
        creditEntries: true,
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
      },
    })
    if (!payment) throw notFound('Payment')
    if (!payment.providerPaymentId) throw conflict('The gateway payment reference is missing')
    if (payment.status !== 'SUCCESS' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw conflict(`A ${payment.status.toLowerCase()} payment cannot be refunded`)
    }
    const advanceAvailable = sumMinor(payment.creditEntries.map((entry) =>
      entry.type === 'CREDIT' || entry.type === 'ADJUSTMENT' ? entry.amountMinor : -entry.amountMinor))
    const pendingReserved = sumMinor(
      payment.refunds.filter((refund) => refund.status === 'PENDING').map((refund) => refund.amountMinor),
    )
    const refundedByInvoice = new Map<string, number>()
    for (const prior of payment.refunds.filter((refund) => refund.status === 'SUCCESS')) {
      for (const allocation of prior.allocations) {
        refundedByInvoice.set(
          allocation.invoiceId,
          (refundedByInvoice.get(allocation.invoiceId) ?? 0) + allocation.amountMinor,
        )
      }
    }
    const allocationAvailable = sumMinor(payment.allocations.map((allocation) =>
      Math.max(0, allocation.amountMinor - (refundedByInvoice.get(allocation.invoiceId) ?? 0))))
    const available = Math.max(
      0,
      allocationAvailable
        + Math.max(0, advanceAvailable)
        - pendingReserved,
    )
    if (input.amount > available) {
      throw new ApiException(400, 'BAD_REQUEST', `Only ₹${available / 100} is currently refundable`)
    }
    const refund = await tx.feeRefund.create({
      data: {
        tenantId: ctx.tenant.id,
        paymentId: payment.id,
        amountMinor: input.amount,
        reason: input.reason,
        status: 'PENDING',
        provider: payment.provider,
        approvedById: ctx.user.userId,
      },
    })
    return { payment, refund }
  }, { isolationLevel: 'Serializable' })

  const providerResult = await paymentProvider().refund(
    reserved.payment.providerPaymentId!,
    input.amount,
    reserved.refund.id,
  )
  if (!providerResult.ok) {
    await ctx.db.feeRefund.update({
      where: { id: reserved.refund.id },
      data: { status: 'FAILED', providerRefundId: providerResult.providerMessageId },
    })
    throw new ApiException(502, 'GATEWAY_REFUND_FAILED', providerResult.error ?? 'The gateway rejected the refund')
  }

  // Persist the provider acknowledgement before touching local balances. If
  // finalization is interrupted, the reconciliation job can safely resume it.
  await ctx.db.feeRefund.update({
    where: { id: reserved.refund.id },
    data: { providerRefundId: providerResult.providerMessageId },
  })
  const refund = await finalizePendingOnlineRefund(
    reserved.refund.id,
    providerResult.providerMessageId,
    ctx.user.userId,
  )

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_payment.refund_online',
    module: 'fees',
    entityType: 'FeePayment',
    entityId: reserved.payment.id,
    summary: `Gateway refund of ₹${input.amount / 100} completed for ${reserved.payment.student.firstName} ${reserved.payment.student.lastName} (${reserved.payment.student.admissionNo})`,
  })
  return refund
}

async function finalizePendingOnlineRefund(
  refundId: string,
  providerRefundId: string | undefined,
  actorId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const refundRow = await tx.feeRefund.findUnique({ where: { id: refundId } })
    if (!refundRow) throw new Error(`Refund ${refundId} not found`)
    if (refundRow.status === 'SUCCESS') return refundRow
    if (refundRow.status !== 'PENDING') throw new Error(`Refund ${refundId} is ${refundRow.status}`)
    await tx.$queryRaw`SELECT "id" FROM "FeePayment" WHERE "id" = ${refundRow.paymentId} FOR UPDATE`
    const payment = await tx.feePayment.findUniqueOrThrow({
      where: { id: refundRow.paymentId },
      include: {
        refunds: { include: { allocations: true } },
        allocations: { include: { invoice: true } },
        creditEntries: true,
      },
    })
    const refundedByInvoice = new Map<string, number>()
    for (const prior of payment.refunds.filter((refund) =>
      refund.status === 'SUCCESS' && refund.id !== refundRow.id)) {
      for (const allocation of prior.allocations) {
        refundedByInvoice.set(
          allocation.invoiceId,
          (refundedByInvoice.get(allocation.invoiceId) ?? 0) + allocation.amountMinor,
        )
      }
    }
    let remaining = refundRow.amountMinor
    for (const allocation of [...payment.allocations].reverse()) {
      if (remaining <= 0) break
      const allocationRemaining = Math.max(
        0,
        allocation.amountMinor - (refundedByInvoice.get(allocation.invoiceId) ?? 0),
      )
      const take = Math.min(allocationRemaining, remaining)
      if (take <= 0) continue
      const paidMinor = Math.max(0, allocation.invoice.paidMinor - take)
      await tx.feeInvoice.update({
        where: { id: allocation.invoiceId },
        data: {
          paidMinor,
          balanceMinor: allocation.invoice.totalMinor - paidMinor,
          status: deriveInvoiceStatus({
            totalMinor: allocation.invoice.totalMinor,
            paidMinor,
            dueOn: allocation.invoice.dueOn,
          }),
        },
      })
      await tx.feeRefundAllocation.create({
        data: {
          tenantId: refundRow.tenantId,
          refundId: refundRow.id,
          invoiceId: allocation.invoiceId,
          amountMinor: take,
        },
      })
      remaining -= take
    }
    if (remaining > 0) {
      await tx.studentFeeCredit.create({
        data: {
          tenantId: refundRow.tenantId,
          studentId: payment.studentId,
          type: 'REFUND',
          amountMinor: remaining,
          paymentId: payment.id,
          notes: refundRow.reason,
          createdById: actorId,
        },
      })
    }
    const totalRefunded = sumMinor(
      payment.refunds
        .filter((item) => item.status !== 'FAILED' && item.id !== refundRow.id)
        .map((item) => item.amountMinor),
    ) + refundRow.amountMinor
    await tx.feePayment.update({
      where: { id: payment.id },
      data: { status: totalRefunded >= payment.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    })
    return tx.feeRefund.update({
      where: { id: refundRow.id },
      data: {
        status: 'SUCCESS',
        providerRefundId,
        completedAt: new Date(),
      },
    })
  }, { isolationLevel: 'Serializable' })
}

/** Retries/finalizes provider refunds with the original refund ID as idempotency key. */
export async function reconcilePendingOnlineRefunds(limit = 50) {
  const pending = await prisma.feeRefund.findMany({
    where: { status: 'PENDING', provider: { not: null } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: { payment: { select: { providerPaymentId: true } } },
  })
  let completed = 0
  let failed = 0
  for (const refund of pending) {
    if (!refund.payment.providerPaymentId) {
      failed++
      continue
    }
    const providerResult = await paymentProvider().refund(
      refund.payment.providerPaymentId,
      refund.amountMinor,
      refund.id,
    )
    if (!providerResult.ok) {
      failed++
      continue
    }
    await prisma.feeRefund.update({
      where: { id: refund.id },
      data: { providerRefundId: providerResult.providerMessageId },
    })
    await finalizePendingOnlineRefund(refund.id, providerResult.providerMessageId)
    completed++
  }
  return { pending: pending.length, completed, failed }
}

export const reversePaymentSchema = z.object({
  paymentId: z.string().min(1),
  reason: z.string().trim().min(5, 'Give a reason for the reversal').max(300),
})

/**
 * Reverses a posted counter transaction without deleting or rewriting its
 * allocations. The original receipt remains visible and offsetting ledger
 * entries reopen the invoices.
 */
export async function reversePayment(ctx: AppContext, input: z.infer<typeof reversePaymentSchema>) {
  ctx.require('fees.reverse')
  const payment = await ctx.db.feePayment.findFirst({
    where: { id: input.paymentId },
    include: {
      allocations: { include: { invoice: true } },
      creditEntries: true,
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
    },
  })
  if (!payment) throw notFound('Payment')
  if (payment.status !== 'SUCCESS') throw conflict(`A ${payment.status.toLowerCase()} payment cannot be reversed`)
  if (payment.provider !== 'manual') {
    throw conflict('Online payments must be refunded through the payment gateway reconciliation flow')
  }

  await ctx.db.$transaction(async (tx) => {
    const claimed = await tx.feePayment.updateMany({
      where: { id: payment.id, status: 'SUCCESS', provider: 'manual' },
      data: { status: 'REVERSED', failureReason: input.reason },
    })
    if (claimed.count !== 1) throw conflict('This payment was already changed by another user')
    const locked = await tx.feePayment.findFirstOrThrow({
      where: { id: payment.id },
      include: {
        allocations: { include: { invoice: true } },
        creditEntries: true,
      },
    })
    if (locked.creditEntries.some((entry) => entry.type === 'APPLIED')) {
      throw conflict('This advance has already been applied to a later invoice; reverse that allocation first')
    }
    for (const allocation of locked.allocations) {
      const paidMinor = Math.max(0, allocation.invoice.paidMinor - allocation.amountMinor)
      await tx.feeInvoice.update({
        where: { id: allocation.invoiceId },
        data: {
          paidMinor,
          balanceMinor: allocation.invoice.totalMinor - paidMinor,
          status: deriveInvoiceStatus({
            totalMinor: allocation.invoice.totalMinor,
            paidMinor,
            dueOn: allocation.invoice.dueOn,
          }),
        },
      })
      await tx.feeAdjustment.create({
        data: {
          tenantId: ctx.tenant.id,
          studentId: payment.studentId,
          invoiceId: allocation.invoiceId,
          type: 'REVERSAL',
          amountMinor: allocation.amountMinor,
          reason: `Payment ${payment.id} reversed: ${input.reason}`,
          createdById: ctx.user.userId,
        },
      })
    }

    const advanceMinor = sumMinor(locked.creditEntries.map((entry) =>
      entry.type === 'CREDIT' || entry.type === 'ADJUSTMENT'
        ? entry.amountMinor
        : -entry.amountMinor))
    if (advanceMinor > 0) {
      await tx.studentFeeCredit.create({
        data: {
          tenantId: ctx.tenant.id,
          studentId: payment.studentId,
          type: 'REVERSAL',
          amountMinor: advanceMinor,
          paymentId: payment.id,
          notes: input.reason,
          createdById: ctx.user.userId,
        },
      })
    }

  }, { isolationLevel: 'Serializable' })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_payment.reverse',
    module: 'fees',
    entityType: 'FeePayment',
    entityId: payment.id,
    summary: `Reversed payment for ${payment.student.firstName} ${payment.student.lastName} (${payment.student.admissionNo}): ${input.reason}`,
    before: { status: payment.status },
    after: { status: 'REVERSED' },
  })
  return { paymentId: payment.id, studentId: payment.studentId }
}

export const editPaymentSchema = z.object({
  paymentId: z.string().min(1),
  mode: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'CARD', 'UPI', 'NET_BANKING']),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid payment date'),
  reference: z.string().trim().max(60).optional().or(z.literal('')),
  billBookNo: z.string().trim().max(40).optional().or(z.literal('')),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
})

/**
 * Corrects receipt details that do not change money movement.
 * Amount / allocation mistakes still require cancel (reverse) then recollect.
 */
export async function editPayment(ctx: AppContext, input: z.infer<typeof editPaymentSchema>) {
  ctx.require('fees.collect')

  const payment = await ctx.db.feePayment.findFirst({
    where: { id: input.paymentId },
    include: {
      receipt: { select: { number: true } },
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
    },
  })
  if (!payment) throw notFound('Payment')
  if (payment.status !== 'SUCCESS') {
    throw conflict(`A ${payment.status.toLowerCase().replaceAll('_', ' ')} receipt cannot be edited`)
  }
  if (payment.provider !== 'manual') {
    throw conflict('Online receipts cannot be edited here')
  }

  const paidAt = attendanceDate(input.paidOn)
  const reference = input.reference?.trim() || null
  const billBookNo = input.billBookNo?.trim() || null
  const notes = input.notes?.trim() || null

  const updated = await ctx.db.feePayment.update({
    where: { id: payment.id },
    data: {
      mode: input.mode,
      paidAt,
      reference,
      billBookNo,
      notes,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'fee_payment.edit',
    module: 'fees',
    entityType: 'FeePayment',
    entityId: payment.id,
    summary: `Edited receipt ${payment.receipt?.number ?? payment.id} for ${payment.student.firstName} ${payment.student.lastName}`,
    before: {
      mode: payment.mode,
      paidAt: payment.paidAt,
      reference: payment.reference,
      billBookNo: payment.billBookNo,
      notes: payment.notes,
    },
    after: {
      mode: updated.mode,
      paidAt: updated.paidAt,
      reference: updated.reference,
      billBookNo: updated.billBookNo,
      notes: updated.notes,
    },
  })

  return { paymentId: payment.id, studentId: payment.studentId }
}

/* ------------------------------------------------------------ payment list */

export const paymentFilterSchema = z.object({
  status: z
    .enum(['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'REVERSED'])
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
            { billBookNo: { contains: query.q, mode: 'insensitive' } },
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
        billBookNo: true,
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
      billBookNo: p.billBookNo,
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
          id: true,
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
            ...(isPortalOnlyRole(ctx.user.roleKeys)
              ? { where: { parent: { userId: ctx.user.userId } } }
              : {}),
            orderBy: { isPrimary: 'desc' },
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
              totalMinor: true,
              paidMinor: true,
              balanceMinor: true,
              status: true,
              lines: { select: { label: true, amountMinor: true, discountMinor: true } },
            },
          },
        },
      },
    },
  })

  if (!payment) throw notFound('Payment')

  const [collectedBy, outstandingAgg, creditEntries] = await Promise.all([
    payment.collectedById
      ? ctx.db.user.findFirst({
          where: { id: payment.collectedById, deletedAt: null },
          select: { firstName: true, lastName: true },
        })
      : Promise.resolve(null),
    ctx.db.feeInvoice.aggregate({
      where: {
        studentId: payment.studentId,
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        balanceMinor: { gt: 0 },
      },
      _sum: { balanceMinor: true },
    }),
    ctx.db.studentFeeCredit.findMany({
      where: { studentId: payment.studentId },
      select: { type: true, amountMinor: true },
    }),
  ])

  const outstandingMinor = outstandingAgg._sum.balanceMinor ?? 0
  const advanceMinor = Math.max(
    0,
    sumMinor(
      creditEntries.map((entry) =>
        entry.type === 'CREDIT' || entry.type === 'ADJUSTMENT'
          ? entry.amountMinor
          : -entry.amountMinor,
      ),
    ),
  )

  return {
    ...payment,
    collectedBy,
    outstandingMinor,
    advanceMinor,
  }
}
