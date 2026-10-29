import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { forbidden } from '@/server/api/response'
import { accessibleStudentIds } from '@/server/scope'
import { attendanceDate } from '@/lib/dates'
import { schoolToday } from '@/lib/periods'

export const outstandingQuerySchema = z.object({
  session: z.string().trim().max(40).optional(),
  /** due: instalments due on or before today; billed: every issued invoice. */
  basis: z.enum(['due', 'billed']).optional().default('due'),
  classLevelId: z.string().trim().max(40).optional(),
  q: z.string().trim().max(120).optional(),
})

export type OutstandingSession = { id: string; name: string; startsOn: Date; isCurrent: boolean }

export type OutstandingRow = {
  studentId: string
  name: string
  admissionNo: string | null
  classLevel: string
  className: string
  status: string
  /** Outstanding per session id. */
  bySession: Record<string, number>
  currentMinor: number
  pastMinor: number
  totalMinor: number
}

/**
 * Fee outstanding split by the academic session each invoice belongs to.
 * The chosen session is "current year"; every earlier session is "past years".
 * Later sessions are left out so a past-year view is not mixed with next year's billing.
 */
export async function outstandingBySession(ctx: AppContext, raw: unknown) {
  if (!ctx.can('accounts.view') && !ctx.can('fees.accounts')) throw forbidden()
  const query = outstandingQuerySchema.parse(raw ?? {})
  const sessions: OutstandingSession[] = await ctx.db.academicSession.findMany({
    orderBy: { startsOn: 'asc' },
    select: { id: true, name: true, startsOn: true, isCurrent: true },
  })
  const selected =
    sessions.find((s) => s.id === query.session) ?? sessions.find((s) => s.isCurrent) ?? sessions[sessions.length - 1] ?? null
  const today = schoolToday()
  const empty = {
    sessions, selected, basis: query.basis, today, columns: [] as OutstandingSession[],
    rows: [] as OutstandingRow[], classes: [] as { name: string; students: number; currentMinor: number; pastMinor: number; totalMinor: number }[],
    totals: { currentMinor: 0, pastMinor: 0, totalMinor: 0, students: 0, bySession: {} as Record<string, number> },
    classOptions: [] as { id: string; name: string }[],
  }
  if (!selected) return empty

  const inScope = sessions.filter((s) => s.startsOn <= selected.startsOn)
  const allowed = await accessibleStudentIds(ctx)
  if (allowed !== null && allowed.length === 0) return { ...empty, columns: inScope }

  const studentWhere: Prisma.StudentWhereInput = {
    deletedAt: null,
    ...(allowed === null ? {} : { id: { in: allowed } }),
    ...(query.classLevelId ? { enrollments: { some: { isCurrent: true, classLevelId: query.classLevelId } } } : {}),
    ...(query.q
      ? {
          OR: [
            { firstName: { contains: query.q, mode: 'insensitive' } },
            { lastName: { contains: query.q, mode: 'insensitive' } },
            { admissionNo: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const grouped = await ctx.db.feeInvoice.groupBy({
    by: ['studentId', 'sessionId'],
    where: {
      sessionId: { in: inScope.map((s) => s.id) },
      status: { notIn: ['CANCELLED', 'DRAFT'] },
      balanceMinor: { gt: 0 },
      ...(query.basis === 'due' ? { dueOn: { lte: attendanceDate(today) } } : {}),
      student: studentWhere,
    },
    _sum: { balanceMinor: true },
  })

  const byStudent = new Map<string, Record<string, number>>()
  for (const g of grouped) {
    const amount = g._sum.balanceMinor ?? 0
    if (amount <= 0) continue
    const rec = byStudent.get(g.studentId) ?? {}
    rec[g.sessionId] = (rec[g.sessionId] ?? 0) + amount
    byStudent.set(g.studentId, rec)
  }

  const [students, classOptions] = await Promise.all([
    byStudent.size
      ? ctx.db.student.findMany({
          where: { id: { in: [...byStudent.keys()] } },
          select: {
            id: true, firstName: true, lastName: true, admissionNo: true, status: true,
            enrollments: {
              where: { isCurrent: true },
              take: 1,
              select: { classLevel: { select: { name: true, numeric: true } }, section: { select: { name: true } } },
            },
          },
        })
      : Promise.resolve([]),
    ctx.db.classLevel.findMany({
      where: { sessionId: selected.id, deletedAt: null },
      orderBy: { numeric: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  const classOrder = new Map<string, number>()
  const rows: OutstandingRow[] = students.map((s) => {
    const bySession = byStudent.get(s.id)!
    const currentMinor = bySession[selected.id] ?? 0
    const totalMinor = Object.values(bySession).reduce((t, v) => t + v, 0)
    const e = s.enrollments[0]
    const classLevel = e ? e.classLevel.name : 'No current class'
    if (e) classOrder.set(e.classLevel.name, e.classLevel.numeric)
    return {
      studentId: s.id,
      name: `${s.firstName} ${s.lastName ?? ''}`.trim(),
      admissionNo: s.admissionNo,
      classLevel,
      className: e?.section ? `${classLevel} ${e.section.name}` : classLevel,
      status: s.status,
      bySession,
      currentMinor,
      pastMinor: totalMinor - currentMinor,
      totalMinor,
    }
  })
  rows.sort((a, b) => b.totalMinor - a.totalMinor || a.name.localeCompare(b.name))

  const classMap = new Map<string, { name: string; students: number; currentMinor: number; pastMinor: number; totalMinor: number }>()
  for (const r of rows) {
    const key = r.classLevel
    const c = classMap.get(key) ?? { name: key, students: 0, currentMinor: 0, pastMinor: 0, totalMinor: 0 }
    c.students += 1
    c.currentMinor += r.currentMinor
    c.pastMinor += r.pastMinor
    c.totalMinor += r.totalMinor
    classMap.set(key, c)
  }
  const classes = [...classMap.values()].sort(
    (a, b) => (classOrder.get(a.name) ?? 999) - (classOrder.get(b.name) ?? 999) || a.name.localeCompare(b.name),
  )

  const bySessionTotal: Record<string, number> = {}
  for (const r of rows) for (const [k, v] of Object.entries(r.bySession)) bySessionTotal[k] = (bySessionTotal[k] ?? 0) + v

  return {
    sessions,
    selected,
    basis: query.basis,
    today,
    /** Session columns oldest first; sessions with nothing outstanding are dropped, except the chosen one. */
    columns: inScope.filter((s) => s.id === selected.id || (bySessionTotal[s.id] ?? 0) > 0),
    rows,
    classes,
    totals: {
      currentMinor: rows.reduce((t, r) => t + r.currentMinor, 0),
      pastMinor: rows.reduce((t, r) => t + r.pastMinor, 0),
      totalMinor: rows.reduce((t, r) => t + r.totalMinor, 0),
      students: rows.length,
      bySession: bySessionTotal,
    },
    classOptions,
  }
}
