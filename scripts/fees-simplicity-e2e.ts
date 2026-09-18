/**
 * Local end-to-end proof:
 * draft plan -> installment preview -> publish/assign -> ₹5,000 cash partial
 * -> receipt -> verified ₹7,000 online settlement -> zero balance.
 *
 * Usage: npx tsx scripts/fees-simplicity-e2e.ts --tenant=demo
 */
import { PrismaClient } from '@prisma/client'
import type { AppContext } from '../src/server/context'
import { tenantDb } from '../src/server/db/tenant-client'
import {
  generateCustomInvoices,
  previewFeePlan,
  publishAndAssignFeePlan,
  saveFeePlanDraft,
} from '../src/server/modules/finance/simplicity'
import { collectPayment, refundPayment, settleOnlinePayment } from '../src/server/modules/finance/payments'
import { runScheduledMonthlyFeeInvoices } from '../src/server/modules/finance/jobs'

const prisma = new PrismaClient()
const slug = process.argv.find((arg) => arg.startsWith('--tenant='))?.slice(9) ?? 'demo'

function context(tenantId: string, userId: string, currency: string): AppContext {
  return {
    tenant: { id: tenantId, slug, name: 'Fee E2E', timezone: 'Asia/Kolkata', currency } as AppContext['tenant'],
    user: {
      userId,
      firstName: 'Fee',
      lastName: 'E2E',
      email: 'fees-e2e@local.test',
      permissions: new Set([
        'fees.view', 'fees.structure', 'fees.structure_publish', 'fees.collect',
        'fees.report', 'fees.reminder', 'fees.settings', 'fees.owner_analytics',
      ]),
    } as AppContext['user'],
    db: tenantDb(tenantId),
    can: () => true,
    require: () => undefined,
  } as unknown as AppContext
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug } })
  if (!tenant) throw new Error(`Tenant ${slug} not found; seed the local database first`)
  const [session, enrollment, user] = await Promise.all([
    prisma.academicSession.findFirst({ where: { tenantId: tenant.id, isCurrent: true } }),
    prisma.enrollment.findFirst({
      where: { tenantId: tenant.id, isCurrent: true },
      select: { classLevelId: true, sectionId: true },
    }),
    prisma.user.findFirst({ where: { tenantId: tenant.id, deletedAt: null }, select: { id: true } }),
  ])
  if (!session || !enrollment || !user) throw new Error('Seeded session, class and user are required')

  const run = Date.now().toString(36).toUpperCase()
  const admissionNo = `FEE-E2E-${run}`
  const ctx = context(tenant.id, user.id, tenant.currency)
  let studentId = ''
  let structureId = ''
  let scheduleStructureId = ''
  const feeHeadIds: string[] = []

  try {
    const student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo,
        firstName: 'Aarav',
        lastName: 'Fee Test',
        status: 'ACTIVE',
        enrollments: {
          create: {
            tenantId: tenant.id,
            sessionId: session.id,
            classLevelId: enrollment.classLevelId,
            sectionId: enrollment.sectionId,
            isCurrent: true,
          },
        },
      },
    })
    studentId = student.id
    const head = await prisma.feeHead.create({
      data: {
        tenantId: tenant.id,
        code: `E${run.slice(-7)}`,
        name: `E2E Current Installment ${run}`,
        frequency: 'ANNUAL',
      },
    })
    feeHeadIds.push(head.id)
    const tuition = await prisma.feeHead.create({
      data: { tenantId: tenant.id, code: `T${run.slice(-7)}`, name: `E2E Tuition ${run}`, frequency: 'MONTHLY' },
    })
    const exam = await prisma.feeHead.create({
      data: { tenantId: tenant.id, code: `X${run.slice(-7)}`, name: `E2E Exam ${run}`, frequency: 'HALF_YEARLY' },
    })
    feeHeadIds.push(tuition.id, exam.id)

    const requestedPlan = await previewFeePlan(ctx, {
      sessionId: session.id,
      classLevelId: enrollment.classLevelId,
      name: `E2E Requested Plan ${run}`,
      dueDay: 10,
      items: [
        { feeHeadId: tuition.id, amount: 6_000, frequency: 'MONTHLY', isOptional: false },
        { feeHeadId: head.id, amount: 12_000, frequency: 'ANNUAL', isOptional: false },
        { feeHeadId: exam.id, amount: 2_000, frequency: 'HALF_YEARLY', isOptional: false },
      ],
    })
    if (requestedPlan.annualMinor !== 8_800_000 || requestedPlan.installments.length !== 12) {
      throw new Error('Monthly/annual/half-yearly installment calculation failed')
    }

    const plan = {
      sessionId: session.id,
      classLevelId: enrollment.classLevelId,
      name: `E2E Grade Plan ${run}`,
      dueDay: 10,
      items: [{ feeHeadId: head.id, amount: 12_000, frequency: 'ANNUAL' as const, isOptional: false }],
    }
    const preview = await previewFeePlan(ctx, plan)
    if (preview.annualMinor !== 1_200_000 || preview.installments.length !== 1) {
      throw new Error(`Installment calculation failed: ${JSON.stringify(preview)}`)
    }
    const saved = await saveFeePlanDraft(ctx, plan)
    structureId = saved.structure.id
    const published = await publishAndAssignFeePlan(ctx, {
      structureId,
      assignment: 'SELECTED',
      studentIds: [student.id],
    })
    if (published.assigned !== 1 || published.invoices !== 0) throw new Error('Publish/assign failed')

    const installment = await prisma.feeInstallment.findFirstOrThrow({
      where: { tenantId: tenant.id, structureId },
      include: { lines: true },
    })
    const generated = await generateCustomInvoices(ctx, {
      structureId,
      studentIds: [student.id],
      installmentIds: [installment.id],
      feeHeadIds: [head.id],
      autoGenerateFrom: null,
      dryRun: false,
    })
    if (generated.created !== 1) throw new Error('Custom monthly invoice generation failed')

    const monthlyPlan = await saveFeePlanDraft(ctx, {
      sessionId: session.id,
      classLevelId: enrollment.classLevelId,
      name: `E2E Monthly Schedule ${run}`,
      dueDay: 10,
      items: [{ feeHeadId: tuition.id, amount: 100, frequency: 'MONTHLY', isOptional: false }],
    })
    scheduleStructureId = monthlyPlan.structure.id
    await publishAndAssignFeePlan(ctx, {
      structureId: scheduleStructureId,
      assignment: 'SELECTED',
      studentIds: [student.id],
    })
    const monthlyInstallments = await prisma.feeInstallment.findMany({
      where: { tenantId: tenant.id, structureId: scheduleStructureId },
      orderBy: { dueOn: 'asc' },
    })
    const firstSix = monthlyInstallments.slice(0, 6)
    const seventh = monthlyInstallments[6]
    if (firstSix.length !== 6 || !seventh) throw new Error('Monthly schedule was not created')
    const autoMonth = seventh.dueOn.toISOString().slice(0, 7)
    const backfill = await generateCustomInvoices(ctx, {
      structureId: scheduleStructureId,
      studentIds: [student.id],
      installmentIds: firstSix.map((item) => item.id),
      feeHeadIds: [tuition.id],
      autoGenerateFrom: autoMonth,
      dryRun: false,
    })
    if (backfill.created !== 6) throw new Error('April–September style backfill failed')
    const scheduled = await runScheduledMonthlyFeeInvoices(
      new Date(Date.UTC(seventh.dueOn.getUTCFullYear(), seventh.dueOn.getUTCMonth(), 1)),
    )
    const scheduleInvoices = await prisma.feeInvoice.findMany({
      where: { tenantId: tenant.id, studentId: student.id, structureId: scheduleStructureId },
    })
    if (
      scheduled.created < 1
      || scheduleInvoices.length !== 7
      || scheduleInvoices.reduce((sum, item) => sum + item.totalMinor, 0) !== 70_000
    ) {
      throw new Error('First-of-month automatic invoice generation failed')
    }

    const invoice = await prisma.feeInvoice.findFirstOrThrow({
      where: { tenantId: tenant.id, studentId: student.id, structureId },
    })
    const cash = await collectPayment(ctx, {
      studentId: student.id,
      amount: 500_000,
      mode: 'CASH',
      invoiceIds: [invoice.id],
      idempotencyKey: `fees-e2e-cash-${run}`,
    })
    const afterCash = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
    if (afterCash.balanceMinor !== 700_000 || !cash.receiptNumber) {
      throw new Error(`Partial cash payment or receipt failed: ${JSON.stringify({
        expectedBalance: 700_000,
        actualBalance: afterCash.balanceMinor,
        receipt: cash.receiptNumber,
        allocated: cash.allocatedMinor,
        advance: cash.unallocatedMinor,
      })}`)
    }

    const online = await prisma.feePayment.create({
      data: {
        tenantId: tenant.id,
        studentId: student.id,
        amountMinor: 700_000,
        currency: tenant.currency,
        mode: 'ONLINE',
        status: 'INITIATED',
        provider: 'e2e-verified',
      },
    })
    const settlement = await settleOnlinePayment({
      paymentId: online.id,
      providerPaymentId: `verified-${run}`,
      verifiedAmountMinor: 700_000,
      raw: { verified: true, e2e: true },
    })
    const final = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
    if (settlement.status !== 'SUCCESS' || final.balanceMinor !== 0 || final.status !== 'PAID') {
      throw new Error('Verified online settlement failed')
    }
    const duplicate = await settleOnlinePayment({
      paymentId: online.id,
      providerPaymentId: `verified-${run}`,
      verifiedAmountMinor: 700_000,
      raw: { verified: true, replay: true },
    })
    if (duplicate.status !== 'IGNORED') throw new Error('Duplicate settlement was not ignored')
    await refundPayment(ctx, {
      paymentId: online.id,
      amount: 100_000,
      reason: 'E2E verified gateway refund',
    })
    const afterOnlineRefund = await prisma.feeInvoice.findUniqueOrThrow({ where: { id: invoice.id } })
    if (afterOnlineRefund.balanceMinor !== 100_000) throw new Error('Online refund did not restore invoice balance')
    await collectPayment(ctx, {
      studentId: student.id,
      amount: 100_000,
      mode: 'CASH',
      invoiceIds: [invoice.id],
      idempotencyKey: `fees-e2e-refund-settle-${run}`,
    })

    const advance = await collectPayment(ctx, {
      studentId: student.id,
      amount: 300_000,
      mode: 'CASH',
      idempotencyKey: `fees-e2e-advance-${run}`,
    })
    await refundPayment(ctx, {
      paymentId: advance.paymentId,
      amount: 300_000,
      reason: 'E2E advance refund verification',
    })
    const creditEntries = await prisma.studentFeeCredit.findMany({
      where: { tenantId: tenant.id, studentId: student.id, paymentId: advance.paymentId },
    })
    const creditBalance = creditEntries.reduce((balance, entry) =>
      balance + (entry.type === 'CREDIT' || entry.type === 'ADJUSTMENT' ? entry.amountMinor : -entry.amountMinor), 0)
    if (creditBalance !== 0) throw new Error(`Refunded advance remains spendable: ${creditBalance}`)

    const concurrentInvoice = await prisma.feeInvoice.create({
      data: {
        tenantId: tenant.id,
        number: `INV-E2E-CONCURRENT-${run}`,
        studentId: student.id,
        sessionId: session.id,
        title: 'Concurrent collection proof',
        issuedOn: new Date(),
        dueOn: new Date(),
        status: 'ISSUED',
        subtotalMinor: 100_000,
        totalMinor: 100_000,
        balanceMinor: 100_000,
        lines: {
          create: {
            tenantId: tenant.id,
            feeHeadId: head.id,
            label: 'Concurrent collection proof',
            amountMinor: 100_000,
          },
        },
      },
    })
    const concurrent = await Promise.all([
      collectPayment(ctx, {
        studentId: student.id,
        amount: 70_000,
        mode: 'CASH',
        invoiceIds: [concurrentInvoice.id],
        idempotencyKey: `fees-e2e-concurrent-a-${run}`,
      }),
      collectPayment(ctx, {
        studentId: student.id,
        amount: 70_000,
        mode: 'CASH',
        invoiceIds: [concurrentInvoice.id],
        idempotencyKey: `fees-e2e-concurrent-b-${run}`,
      }),
    ])
    const [concurrentFinal, concurrentAllocated] = await Promise.all([
      prisma.feeInvoice.findUniqueOrThrow({ where: { id: concurrentInvoice.id } }),
      prisma.feePaymentAllocation.aggregate({
        where: { invoiceId: concurrentInvoice.id },
        _sum: { amountMinor: true },
      }),
    ])
    if (
      concurrentFinal.paidMinor !== 100_000
      || concurrentFinal.balanceMinor !== 0
      || concurrentAllocated._sum.amountMinor !== 100_000
      || concurrent[0].receiptNumber === concurrent[1].receiptNumber
    ) {
      throw new Error('Concurrent collection or receipt serialization failed')
    }

    console.log(JSON.stringify({
      plan: 'drafted and published',
      student: admissionNo,
      invoice: invoice.number,
      cashReceipt: cash.receiptNumber,
      cashPaid: 5_000,
      onlinePaid: 7_000,
      finalBalance: 0,
      duplicateGatewaySettlement: 'ignored',
      onlineRefund: 'provider verified and ledger restored',
      refundedAdvanceBalance: creditBalance,
      concurrentCollection: 'invoice and receipt locks verified',
      monthlyBackfill: 'six selected months only',
      automaticMonthlyInvoice: 'seventh month generated once',
    }, null, 2))
  } finally {
    if (studentId) {
      const payments = await prisma.feePayment.findMany({ where: { studentId }, select: { id: true } })
      const invoices = await prisma.feeInvoice.findMany({ where: { studentId }, select: { id: true } })
      const paymentIds = payments.map((payment) => payment.id)
      const invoiceIds = invoices.map((invoice) => invoice.id)
      await prisma.studentFeeCredit.deleteMany({ where: { studentId } })
      await prisma.feeAdjustment.deleteMany({ where: { studentId } })
      await prisma.feeRefundAllocation.deleteMany({
        where: { refund: { paymentId: { in: paymentIds } } },
      })
      await prisma.feeRefund.deleteMany({ where: { paymentId: { in: paymentIds } } })
      await prisma.feeReceipt.deleteMany({ where: { paymentId: { in: paymentIds } } })
      await prisma.feePaymentAllocation.deleteMany({
        where: { OR: [{ paymentId: { in: paymentIds } }, { invoiceId: { in: invoiceIds } }] },
      })
      await prisma.paymentEvent.updateMany({
        where: { paymentId: { in: paymentIds } },
        data: { paymentId: null },
      })
      await prisma.feePayment.deleteMany({ where: { id: { in: paymentIds } } })
      await prisma.feeInvoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } })
      await prisma.feeInvoice.deleteMany({ where: { id: { in: invoiceIds } } })
      await prisma.studentFeeAssignment.deleteMany({ where: { studentId } })
      await prisma.student.delete({ where: { id: studentId } }).catch(() => undefined)
    }
    if (structureId) await prisma.feeStructure.delete({ where: { id: structureId } }).catch(() => undefined)
    if (scheduleStructureId) {
      await prisma.feeStructure.delete({ where: { id: scheduleStructureId } }).catch(() => undefined)
    }
    for (const id of feeHeadIds) {
      await prisma.feeHead.delete({ where: { id } }).catch(() => undefined)
    }
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
