/**
 * Cancel unpaid future-month fee invoices that were generated upfront
 * (e.g. Computer Fee Oct–Mar billed in September). Leaves current/past months alone.
 *
 * Usage:
 *   npx tsx scripts/_cancel-future-fee-invoices.ts           # dry-run
 *   npx tsx scripts/_cancel-future-fee-invoices.ts --apply
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const today = new Date()
  const nextMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))

  const future = await db.feeInvoice.findMany({
    where: {
      status: { not: 'CANCELLED' },
      dueOn: { gte: nextMonthStart },
      paidMinor: 0,
      balanceMinor: { gt: 0 },
    },
    select: {
      id: true,
      number: true,
      title: true,
      dueOn: true,
      totalMinor: true,
      tenantId: true,
      student: { select: { admissionNo: true, firstName: true, lastName: true } },
      lines: { select: { feeHead: { select: { name: true } } } },
    },
    orderBy: [{ dueOn: 'asc' }, { number: 'asc' }],
  })

  const byHead: Record<string, number> = {}
  for (const inv of future) {
    const head = inv.lines[0]?.feeHead.name ?? inv.title
    byHead[head] = (byHead[head] || 0) + 1
  }

  console.log({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    cutoff: nextMonthStart.toISOString().slice(0, 10),
    invoices: future.length,
    byHead,
    sample: future.slice(0, 12).map((inv) => ({
      number: inv.number,
      admissionNo: inv.student.admissionNo,
      name: `${inv.student.firstName} ${inv.student.lastName}`,
      due: inv.dueOn.toISOString().slice(0, 10),
      title: inv.title,
      amount: inv.totalMinor / 100,
    })),
  })

  if (!apply) {
    console.log('Re-run with --apply to cancel these unpaid future invoices.')
    return
  }

  if (future.length === 0) {
    console.log('Nothing to cancel.')
    return
  }

  const result = await db.feeInvoice.updateMany({
    where: { id: { in: future.map((inv) => inv.id) } },
    data: {
      status: 'CANCELLED',
      // Keep total/balance consistent with FeeInvoice_valid_balance
      // (balanceMinor = totalMinor - paidMinor). Outstanding lists exclude CANCELLED.
    },
  })
  console.log({ cancelled: result.count })

  // Ensure assignments that had these heads keep automatic monthly generation
  // from next month for the affected students/structures.
  const affected = await db.feeInvoice.findMany({
    where: { id: { in: future.map((inv) => inv.id) } },
    select: { studentId: true, structureId: true, sessionId: true, tenantId: true },
  })
  const keys = new Map<string, { tenantId: string; studentId: string; sessionId: string; structureId: string }>()
  for (const row of affected) {
    if (!row.structureId) continue
    keys.set(`${row.studentId}:${row.structureId}`, {
      tenantId: row.tenantId,
      studentId: row.studentId,
      sessionId: row.sessionId,
      structureId: row.structureId,
    })
  }
  let scheduled = 0
  for (const row of keys.values()) {
    const updated = await db.studentFeeAssignment.updateMany({
      where: {
        tenantId: row.tenantId,
        studentId: row.studentId,
        sessionId: row.sessionId,
        structureId: row.structureId,
        status: 'ACTIVE',
      },
      data: {
        autoGenerateFrom: nextMonthStart,
      },
    })
    scheduled += updated.count
  }
  console.log({ assignmentsUpdatedForAuto: scheduled })
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
