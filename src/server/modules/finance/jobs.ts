import { addDays, differenceInCalendarDays, subDays } from 'date-fns'
import { Prisma } from '@prisma/client'
import type { NotificationChannelValue } from '@/server/notifications'
import { notifyTenant } from '@/server/notifications'
import { prisma } from '@/server/db/prisma'
import { attendanceDate } from '@/lib/dates'
import { applyConcession, deriveInvoiceStatus, lateFeeFor } from '@/lib/money'
import { financialYearLabel, nextDocumentNumber } from '@/server/numbering'

/**
 * Generates only the current month's selected-plan occurrences. Running this
 * daily is safe and also catches a missed first-of-month run; source keys make
 * every student/installment/head charge exactly-once.
 */
export async function runScheduledMonthlyFeeInvoices(now = new Date()) {
  const today = attendanceDate(now)
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
  const assignments = await prisma.studentFeeAssignment.findMany({
    where: {
      status: 'ACTIVE',
      endedAt: null,
      autoGenerateFrom: { not: null, lte: monthStart },
      student: { deletedAt: null, status: 'ACTIVE' },
    },
    include: {
      student: { select: { firstName: true, lastName: true } },
      structure: {
        include: {
          installments: {
            where: { dueOn: { gte: monthStart, lt: nextMonth } },
            include: { lines: { include: { feeHead: true } } },
          },
        },
      },
    },
  })
  let created = 0
  let skipped = 0
  for (const assignment of assignments) {
    const concessions = await prisma.feeConcession.findMany({
      where: { tenantId: assignment.tenantId, studentId: assignment.studentId },
    })
    for (const installment of assignment.structure.installments) {
      for (const line of installment.lines) {
        if (
          assignment.autoFeeHeadIds.length > 0
          && !assignment.autoFeeHeadIds.includes(line.feeHeadId)
        ) {
          continue
        }
        const sourceKey = `fee-line:${line.id}:student:${assignment.studentId}`
        const duplicate = await prisma.feeInvoice.findFirst({
          where: { tenantId: assignment.tenantId, sourceKey },
          select: { id: true },
        })
        if (duplicate) {
          skipped++
          continue
        }
        let remaining = line.amountMinor
        let discountMinor = 0
        for (const concession of concessions.filter((item) =>
          (!item.feeHeadId || item.feeHeadId === line.feeHeadId)
          && (!item.validFrom || item.validFrom <= installment.dueOn)
          && (!item.validTo || item.validTo >= installment.dueOn))) {
          const applied = applyConcession(remaining, concession.kind, concession.value)
          remaining = applied.net
          discountMinor += applied.discount
        }
        try {
          const didCreate = await prisma.$transaction(async (tx) => {
            const inside = await tx.feeInvoice.findFirst({
              where: { tenantId: assignment.tenantId, sourceKey },
              select: { id: true },
            })
            if (inside) return false
            const number = await nextDocumentNumber(tx, {
              tenantId: assignment.tenantId,
              kind: 'INVOICE',
              sessionLabel: financialYearLabel(installment.dueOn),
            })
            const label = installment.dueOn.toLocaleDateString('en-IN', {
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            })
            await tx.feeInvoice.create({
              data: {
                tenantId: assignment.tenantId,
                number,
                studentId: assignment.studentId,
                sessionId: assignment.sessionId,
                structureId: assignment.structureId,
                sourceKey,
                title: `${line.feeHead.name} — ${label}`,
                issuedOn: monthStart,
                dueOn: installment.dueOn,
                status: deriveInvoiceStatus({
                  totalMinor: remaining,
                  paidMinor: 0,
                  dueOn: installment.dueOn,
                }),
                subtotalMinor: line.amountMinor,
                discountMinor,
                totalMinor: remaining,
                balanceMinor: remaining,
                lines: {
                  create: {
                    tenantId: assignment.tenantId,
                    feeHeadId: line.feeHeadId,
                    label: line.label,
                    amountMinor: line.amountMinor,
                    discountMinor,
                  },
                },
              },
            })
            return true
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
          if (didCreate) created++
          else skipped++
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            skipped++
            continue
          }
          throw error
        }
      }
    }
  }
  if (created > 0) {
    const byTenant = new Map<string, number>()
    for (const assignment of assignments) {
      byTenant.set(assignment.tenantId, (byTenant.get(assignment.tenantId) ?? 0) + 1)
    }
    await prisma.auditLog.createMany({
      data: [...byTenant].map(([tenantId]) => ({
        tenantId,
        actorLabel: 'Scheduled finance job',
        action: 'fee_invoice.monthly_generate',
        module: 'fees',
        summary: `Monthly invoice run created charges for ${monthStart.toISOString().slice(0, 7)}`,
      })),
    })
  }
  return { month: monthStart.toISOString().slice(0, 7), assignments: assignments.length, created, skipped }
}

/**
 * Runs enabled fee reminder rules for every tenant. The rule and invoice IDs in
 * FeeReminderLog enforce the maximum-send policy without relying on memory.
 */
export async function runAutomatedFeeReminders() {
  const today = attendanceDate(new Date())
  const rules = await prisma.feeReminderRule.findMany({ where: { isActive: true } })
  let sent = 0
  let skipped = 0

  for (const rule of rules) {
    const dueOn = rule.offsetType === 'BEFORE_DUE'
      ? addDays(today, rule.offsetDays)
      : rule.offsetType === 'AFTER_DUE'
        ? subDays(today, rule.offsetDays)
        : today
    const invoices = await prisma.feeInvoice.findMany({
      where: {
        tenantId: rule.tenantId,
        dueOn,
        balanceMinor: { gt: 0 },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      select: {
        id: true,
        studentId: true,
        balanceMinor: true,
        student: {
          select: {
            firstName: true,
            guardians: { select: { parent: { select: { userId: true } } } },
          },
        },
      },
    })

    for (const invoice of invoices) {
      const previous = await prisma.feeReminderLog.count({
        where: { tenantId: rule.tenantId, ruleId: rule.id, invoiceId: invoice.id },
      })
      if (previous >= rule.maxSends) {
        skipped++
        continue
      }
      try {
        await prisma.feeReminderLog.create({
          data: {
            tenantId: rule.tenantId,
            studentId: invoice.studentId,
            invoiceId: invoice.id,
            ruleId: rule.id,
            slot: previous,
            channels: rule.channels as never,
            amountMinor: invoice.balanceMinor,
          },
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          skipped++
          continue
        }
        throw error
      }
      const userIds = invoice.student.guardians.flatMap((guardian) =>
        guardian.parent.userId ? [guardian.parent.userId] : [])
      await notifyTenant(rule.tenantId, {
        userIds,
        eventKey: 'fee.due',
        title: 'Fee payment reminder',
        body: `A fee payment of ₹${(invoice.balanceMinor / 100).toLocaleString('en-IN')} for ${invoice.student.firstName} is ${rule.offsetType === 'AFTER_DUE' ? 'overdue' : 'due soon'}. Please open MyCampusView to review and pay.`,
        linkUrl: '/finance',
        channels: rule.channels as NotificationChannelValue[],
      })
      sent++
    }
  }
  return { rules: rules.length, sent, skipped }
}

/**
 * Creates this month's transport charge from the existing active
 * TransportAssignment and stop rate. Ending an assignment prevents future
 * charges; historical invoices are never rewritten.
 */
export async function syncTransportFeeInvoices() {
  const today = attendanceDate(new Date())
  const dueOn = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 10))
  const assignments = await prisma.transportAssignment.findMany({
    where: {
      isActive: true,
      startedOn: { lte: today },
      OR: [{ endedOn: null }, { endedOn: { gte: today } }],
    },
    select: { tenantId: true, studentId: true, stopId: true },
  })
  let created = 0
  let skipped = 0
  for (const assignment of assignments) {
    const [session, rate] = await Promise.all([
      prisma.academicSession.findFirst({
        where: { tenantId: assignment.tenantId, isCurrent: true },
        select: { id: true },
      }),
      prisma.transportFeeRate.findFirst({
        where: {
          tenantId: assignment.tenantId,
          stopId: assignment.stopId,
          effectiveFrom: { lte: today },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        },
        orderBy: { effectiveFrom: 'desc' },
        include: { feeHead: { select: { name: true } } },
      }),
    ])
    if (!session || !rate) {
      skipped++
      continue
    }
    const title = `Transport fee — ${dueOn.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`
    const sourceKey = `transport:session:${session.id}:student:${assignment.studentId}:${dueOn.toISOString().slice(0, 7)}`
    const duplicate = await prisma.feeInvoice.findFirst({
      where: { tenantId: assignment.tenantId, sourceKey },
      select: { id: true },
    })
    if (duplicate) {
      skipped++
      continue
    }
    await prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, {
        tenantId: assignment.tenantId,
        kind: 'INVOICE',
        sessionLabel: financialYearLabel(dueOn),
      })
      await tx.feeInvoice.create({
        data: {
          tenantId: assignment.tenantId,
          number,
          studentId: assignment.studentId,
          sessionId: session.id,
          sourceKey,
          title,
          issuedOn: today,
          dueOn,
          status: deriveInvoiceStatus({ totalMinor: rate.amountMinor, paidMinor: 0, dueOn }),
          subtotalMinor: rate.amountMinor,
          totalMinor: rate.amountMinor,
          balanceMinor: rate.amountMinor,
          lines: {
            create: {
              tenantId: assignment.tenantId,
              feeHeadId: rate.feeHeadId,
              label: rate.feeHead.name,
              amountMinor: rate.amountMinor,
            },
          },
        },
      })
    })
    created++
  }
  return { assignments: assignments.length, created, skipped }
}

export async function runLateFeeRules() {
  const today = attendanceDate(new Date())
  const rules = await prisma.feePenaltyRule.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })
  const rulesByTenant = new Map<string, typeof rules>()
  for (const rule of rules) rulesByTenant.set(rule.tenantId, [...(rulesByTenant.get(rule.tenantId) ?? []), rule])
  let updated = 0
  let addedMinor = 0
  let ambiguousTenants = 0
  for (const [tenantId, tenantRules] of rulesByTenant) {
    if (tenantRules.length !== 1) {
      ambiguousTenants++
      continue
    }
    const rule = tenantRules[0]!
    const invoices = await prisma.feeInvoice.findMany({
      where: { tenantId, balanceMinor: { gt: 0 }, dueOn: { lt: today }, status: { not: 'CANCELLED' } },
    })
    let tenantUpdated = 0
    let tenantAdded = 0
    for (const invoice of invoices) {
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "FeeInvoice" WHERE "id" = ${invoice.id} AND "tenantId" = ${tenantId} FOR UPDATE`
        const current = await tx.feeInvoice.findUnique({ where: { id: invoice.id } })
        if (!current || current.balanceMinor <= 0 || current.status === 'CANCELLED') return null
        const base = Math.max(0, current.totalMinor - current.lateFeeMinor - current.paidMinor)
        const fee = lateFeeFor(base, differenceInCalendarDays(today, current.dueOn), {
          graceDays: rule.graceDays,
          kind: rule.kind,
          value: rule.value,
          perDay: rule.perDay,
          maxMinor: rule.maxMinor,
        })
        if (fee === current.lateFeeMinor) return null
        const totalMinor = current.subtotalMinor - current.discountMinor + current.taxMinor + fee
        await tx.feeInvoice.update({
          where: { id: current.id },
          data: {
            lateFeeMinor: fee,
            totalMinor,
            balanceMinor: totalMinor - current.paidMinor,
            status: deriveInvoiceStatus({ totalMinor, paidMinor: current.paidMinor, dueOn: current.dueOn }),
          },
        })
        return fee - current.lateFeeMinor
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      if (outcome === null) continue
      tenantUpdated++
      tenantAdded += outcome
    }
    if (tenantUpdated > 0) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          actorLabel: 'Scheduled finance job',
          action: 'fee.late_fee_run',
          module: 'fees',
          summary: `Applied late fees to ${tenantUpdated} invoices, adding ₹${tenantAdded / 100}`,
        },
      })
    }
    updated += tenantUpdated
    addedMinor += tenantAdded
  }
  return { tenants: rulesByTenant.size, ambiguousTenants, updated, addedMinor }
}
