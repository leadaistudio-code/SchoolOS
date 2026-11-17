import type { AppContext } from '@/server/context'
import { accessibleStudentIds } from '@/server/scope'
import { withBadDebtStudent } from './student-status'

export type BadDebtRow = {
  studentId: string
  studentName: string
  admissionNo: string
  className: string | null
  balanceMinor: number
  invoiceCount: number
  droppedAt: Date | null
}

/** Unpaid balances for students marked dropped out (WITHDRAWN). */
export async function listBadDebts(ctx: AppContext): Promise<{
  rows: BadDebtRow[]
  totalMinor: number
  studentCount: number
}> {
  ctx.require('fees.accounts')
  const allowed = await accessibleStudentIds(ctx)
  const openWhere = {
    balanceMinor: { gt: 0 as const },
    status: { notIn: ['CANCELLED' as const, 'DRAFT' as const] },
    ...(allowed === null ? {} : { studentId: { in: allowed } }),
    student: withBadDebtStudent(),
  }

  const groups = await ctx.db.feeInvoice.groupBy({
    by: ['studentId'],
    where: openWhere,
    _sum: { balanceMinor: true },
    _count: { _all: true },
    orderBy: { _sum: { balanceMinor: 'desc' } },
  })

  if (groups.length === 0) return { rows: [], totalMinor: 0, studentCount: 0 }

  const students = await ctx.db.student.findMany({
    where: { id: { in: groups.map((g) => g.studentId) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      updatedAt: true,
      enrollments: {
        orderBy: { leftOn: 'desc' },
        take: 1,
        select: {
          classLevel: { select: { name: true } },
          section: { select: { name: true } },
          leftOn: true,
        },
      },
    },
  })
  const byId = new Map(students.map((s) => [s.id, s]))

  const rows = groups.flatMap((g) => {
    const s = byId.get(g.studentId)
    if (!s) return []
    const enr = s.enrollments[0]
    return [{
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`.trim(),
      admissionNo: s.admissionNo,
      className: enr ? `${enr.classLevel.name}${enr.section ? ` ${enr.section.name}` : ''}` : null,
      balanceMinor: g._sum.balanceMinor ?? 0,
      invoiceCount: g._count._all,
      droppedAt: enr?.leftOn ?? s.updatedAt,
    }]
  })

  return {
    rows,
    totalMinor: rows.reduce((sum, r) => sum + r.balanceMinor, 0),
    studentCount: rows.length,
  }
}
