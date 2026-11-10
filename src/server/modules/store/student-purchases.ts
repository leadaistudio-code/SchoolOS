import { z } from 'zod'
import type { Prisma, StoreCategory } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { accessibleStudentIds } from '@/server/scope'
import type { ViewSession } from '@/server/view-session'
import { itemLabel } from '@/lib/store/options'

/**
 * Which students bought what at the school store, class by class, and who has
 * not yet bought a given item (e.g. the practical book or the uniform).
 *
 * An "item" here is an item name across all its variants, so "Shirt" covers
 * every size. Voided bills do not count as bought.
 */

const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined))
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal('').transform(() => undefined))

export const studentPurchaseSchema = z.object({
  view: z.enum(['bought', 'missing']).default('bought'),
  classLevelId: optional(40),
  sectionId: optional(40),
  category: z
    .enum(['BOOKS', 'STATIONERY', 'UNIFORM', 'SHOES', 'BAGS', 'ACCESSORIES', 'SPORTS', 'OTHER'])
    .optional()
    .or(z.literal('').transform(() => undefined)),
  item: optional(200),
  q: optional(100),
  from: optionalDate,
  to: optionalDate,
})

export type StudentPurchaseFilter = z.infer<typeof studentPurchaseSchema>

type Enrolled = {
  studentId: string
  name: string
  admissionNo: string
  classLevelId: string
  className: string
  classOrder: number
  sectionName: string
  rollNumber: number | null
  parentPhone: string | null
  /** False for alumni, transferred, withdrawn or suspended students: not chased for purchases. */
  active: boolean
}

export type BoughtRow = {
  lineId: string
  saleId: string
  billNumber: string
  soldAt: Date
  studentId: string
  name: string
  admissionNo: string
  className: string
  sectionName: string
  item: string
  category: StoreCategory
  quantity: number
  amountMinor: number
}

export type MissingRow = Enrolled

export type ClassCoverage = {
  classLevelId: string
  className: string
  students: number
  bought: number
  missing: number
}

const byClassThenName = (a: Enrolled, b: Enrolled) =>
  a.classOrder - b.classOrder ||
  a.className.localeCompare(b.className) ||
  a.sectionName.localeCompare(b.sectionName) ||
  (a.rollNumber ?? Infinity) - (b.rollNumber ?? Infinity) ||
  a.name.localeCompare(b.name)

async function enrolledStudents(ctx: AppContext, session: ViewSession, filter: StudentPurchaseFilter): Promise<Enrolled[]> {
  const allowed = await accessibleStudentIds(ctx)
  const q = filter.q
  const rows = await ctx.db.enrollment.findMany({
    where: {
      sessionId: session.id,
      ...(filter.classLevelId ? { classLevelId: filter.classLevelId } : {}),
      ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
      ...(allowed === null ? {} : { studentId: { in: allowed } }),
      student: {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { admissionNo: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    },
    select: {
      studentId: true,
      rollNumber: true,
      classLevel: { select: { id: true, name: true, numeric: true } },
      section: { select: { name: true } },
      student: {
        select: {
          firstName: true,
          lastName: true,
          admissionNo: true,
          status: true,
          guardians: { orderBy: { isPrimary: 'desc' }, take: 1, select: { parent: { select: { phone: true } } } },
        },
      },
    },
  })
  return rows.map((r) => ({
    studentId: r.studentId,
    name: `${r.student.firstName} ${r.student.lastName}`.trim(),
    admissionNo: r.student.admissionNo,
    classLevelId: r.classLevel.id,
    className: r.classLevel.name,
    classOrder: r.classLevel.numeric,
    sectionName: r.section?.name ?? '',
    rollNumber: r.rollNumber,
    parentPhone: r.student.guardians[0]?.parent.phone ?? null,
    active: r.student.status === 'ACTIVE',
  }))
}

function periodOf(session: ViewSession, filter: StudentPurchaseFilter) {
  const from = filter.from ?? session.startsOn
  const to = filter.to ?? session.endsOn
  return {
    from,
    to,
    gte: new Date(`${from}T00:00:00+05:30`),
    lt: new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000),
  }
}

/** Item names (all variants together) that were ever sold or are on sale, for the filter. */
export async function purchaseItemOptions(ctx: AppContext) {
  const items = await ctx.db.storeItem.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: { name: true, category: true },
  })
  const seen = new Map<string, StoreCategory>()
  for (const i of items) if (!seen.has(i.name)) seen.set(i.name, i.category)
  return [...seen.entries()].map(([name, category]) => ({ name, category }))
}

export async function studentPurchaseReport(ctx: AppContext, session: ViewSession, filter: StudentPurchaseFilter) {
  const period = periodOf(session, filter)
  const enrolled = await enrolledStudents(ctx, session, filter)
  const byStudent = new Map(enrolled.map((e) => [e.studentId, e]))
  const restrictToClass = !!(filter.classLevelId || filter.sectionId || filter.q)

  const itemWhere: Prisma.StoreItemWhereInput = {
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.item ? { name: filter.item } : {}),
  }
  const lines = await ctx.db.storeSaleLine.findMany({
    where: {
      item: itemWhere,
      sale: {
        status: 'COMPLETED',
        soldAt: { gte: period.gte, lt: period.lt },
        studentId: restrictToClass ? { in: [...byStudent.keys()] } : { not: null },
      },
    },
    orderBy: { sale: { soldAt: 'desc' } },
    select: {
      id: true,
      quantity: true,
      amountMinor: true,
      item: { select: { name: true, variant: true, category: true } },
      sale: {
        select: {
          id: true,
          number: true,
          soldAt: true,
          studentId: true,
          customerName: true,
          student: { select: { firstName: true, lastName: true, admissionNo: true } },
        },
      },
    },
  })

  const bought: BoughtRow[] = lines.map((l) => {
    const e = l.sale.studentId ? byStudent.get(l.sale.studentId) : undefined
    const s = l.sale.student
    return {
      lineId: l.id,
      saleId: l.sale.id,
      billNumber: l.sale.number,
      soldAt: l.sale.soldAt,
      studentId: l.sale.studentId!,
      name: e?.name ?? (s ? `${s.firstName} ${s.lastName}`.trim() : l.sale.customerName ?? ''),
      admissionNo: e?.admissionNo ?? s?.admissionNo ?? '',
      className: e?.className ?? '',
      sectionName: e?.sectionName ?? '',
      item: itemLabel(l.item),
      category: l.item.category,
      quantity: l.quantity,
      amountMinor: l.amountMinor,
    }
  })

  const buyers = new Set(bought.map((b) => b.studentId))
  const canCheckMissing = !!(filter.item || filter.category)
  const active = enrolled.filter((e) => e.active)
  const missing: MissingRow[] = canCheckMissing
    ? active.filter((e) => !buyers.has(e.studentId)).sort(byClassThenName)
    : []

  const coverage = new Map<string, ClassCoverage & { order: number }>()
  if (canCheckMissing) {
    for (const e of active) {
      const c = coverage.get(e.classLevelId) ?? {
        classLevelId: e.classLevelId,
        className: e.className,
        order: e.classOrder,
        students: 0,
        bought: 0,
        missing: 0,
      }
      c.students += 1
      if (buyers.has(e.studentId)) c.bought += 1
      else c.missing += 1
      coverage.set(e.classLevelId, c)
    }
  }

  return {
    from: period.from,
    to: period.to,
    canCheckMissing,
    bought,
    missing,
    totals: {
      students: active.length,
      buyers: active.filter((e) => buyers.has(e.studentId)).length,
      missing: missing.length,
      quantity: bought.reduce((s, b) => s + b.quantity, 0),
      amountMinor: bought.reduce((s, b) => s + b.amountMinor, 0),
    },
    coverage: [...coverage.values()]
      .sort((a, b) => a.order - b.order || a.className.localeCompare(b.className))
      .map(({ order: _order, ...c }) => c),
  }
}
