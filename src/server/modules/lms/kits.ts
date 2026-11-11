import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { istClock } from '@/lib/ist-clock'
import { assertLms, actorOf, auditLms } from './access'
import { requireLearner } from './learning'

/**
 * Robotics kits the school lends to students: how many it holds, who has one,
 * when it is due back and what state it came back in. A kit reported lost
 * leaves the school's stock.
 */

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined))
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date')
  .optional()
  .or(z.literal('').transform(() => undefined))

export const kitSchema = z.object({
  name: z.string().trim().min(2, 'Name the kit').max(120),
  code: optionalText(40),
  description: optionalText(2000),
  courseId: z.string().max(40).optional().or(z.literal('').transform(() => undefined)),
  quantity: z.coerce.number().int().min(0, 'Cannot be negative').max(10000),
})

export const issueSchema = z.object({
  studentId: z.string().min(1, 'Pick a student').max(40),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  dueOn: isoDate,
  note: optionalText(500),
})

export const KIT_CONDITIONS = ['GOOD', 'DAMAGED', 'PARTS_MISSING', 'LOST'] as const
export const returnSchema = z
  .object({
    condition: z.enum(KIT_CONDITIONS),
    note: optionalText(500),
  })
  .refine((v) => v.condition === 'GOOD' || v.note, { message: 'Note what is damaged, missing or how it was lost', path: ['note'] })

function require(ctx: AppContext, permission: string) {
  ctx.require(permission)
  return assertLms(ctx)
}

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
/** dueOn is a calendar date; it is overdue from the day after, in India. */
export function isOverdue(dueOn: Date | null, todayIso = istClock().iso) {
  return !!dueOn && dueOn.toISOString().slice(0, 10) < todayIso
}

async function outByKit(ctx: AppContext, kitIds: string[]) {
  const rows = await ctx.db.lmsKitLoan.groupBy({
    by: ['kitId'],
    where: { kitId: { in: kitIds }, returnedAt: null },
    _sum: { quantity: true },
  })
  return new Map(rows.map((r) => [r.kitId, r._sum.quantity ?? 0]))
}

async function checkCourse(ctx: AppContext, courseId?: string) {
  if (!courseId) return null
  const course = await ctx.db.lmsCourse.findFirst({
    where: { id: courseId, deletedAt: null, OR: [{ tenantId: null, status: 'PUBLISHED' }, { tenantId: ctx.tenant.id }] },
    select: { id: true },
  })
  if (!course) throw notFound('Course')
  return course.id
}

export async function listKits(ctx: AppContext) {
  await require(ctx, 'lms.view')
  const kits = await ctx.db.lmsKit.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' },
    include: { course: { select: { id: true, title: true } } },
  })
  const today = istClock().iso
  const [out, overdue] = await Promise.all([
    outByKit(ctx, kits.map((k) => k.id)),
    ctx.db.lmsKitLoan.groupBy({
      by: ['kitId'],
      where: { kitId: { in: kits.map((k) => k.id) }, returnedAt: null, dueOn: { lt: dateOnly(today) } },
      _sum: { quantity: true },
    }),
  ])
  const late = new Map(overdue.map((r) => [r.kitId, r._sum.quantity ?? 0]))
  return kits.map((k) => {
    const issued = out.get(k.id) ?? 0
    return { ...k, issued, available: Math.max(0, k.quantity - issued), overdue: late.get(k.id) ?? 0 }
  })
}

async function studentLabels(ctx: AppContext, studentIds: string[]) {
  const rows = await ctx.db.student.findMany({
    where: { id: { in: [...new Set(studentIds)] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      enrollments: { where: { isCurrent: true }, take: 1, select: { classLevel: { select: { name: true } }, section: { select: { name: true } } } },
    },
  })
  return new Map(
    rows.map((s) => {
      const p = s.enrollments[0]
      return [
        s.id,
        {
          name: `${s.firstName} ${s.lastName}`.trim(),
          admissionNo: s.admissionNo,
          className: p ? `${p.classLevel.name}${p.section ? ` – ${p.section.name}` : ''}` : '',
        },
      ] as const
    }),
  )
}

type LoanRow = Awaited<ReturnType<AppContext['db']['lmsKitLoan']['findMany']>>[number]

async function withStudents<T extends LoanRow>(ctx: AppContext, loans: T[]) {
  const labels = await studentLabels(ctx, loans.map((l) => l.studentId))
  const today = istClock().iso
  return loans.map((l) => ({
    ...l,
    student: labels.get(l.studentId) ?? { name: 'Student', admissionNo: '', className: '' },
    overdue: !l.returnedAt && isOverdue(l.dueOn, today),
  }))
}

export async function getKit(ctx: AppContext, id: string) {
  await require(ctx, 'lms.view')
  const kit = await ctx.db.lmsKit.findFirst({ where: { id, archivedAt: null }, include: { course: { select: { id: true, title: true } } } })
  if (!kit) throw notFound('Kit')
  const [open, returned] = await Promise.all([
    ctx.db.lmsKitLoan.findMany({ where: { kitId: id, returnedAt: null }, orderBy: [{ dueOn: 'asc' }, { issuedAt: 'asc' }] }),
    ctx.db.lmsKitLoan.findMany({ where: { kitId: id, returnedAt: { not: null } }, orderBy: { returnedAt: 'desc' }, take: 100 }),
  ])
  const issued = open.reduce((s, l) => s + l.quantity, 0)
  return {
    kit: { ...kit, issued, available: Math.max(0, kit.quantity - issued) },
    open: await withStudents(ctx, open),
    returned: await withStudents(ctx, returned),
  }
}

/** Every kit currently with a student, overdue first. */
export async function openLoans(ctx: AppContext, onlyOverdue = false) {
  await require(ctx, 'lms.view')
  const today = istClock().iso
  const loans = await ctx.db.lmsKitLoan.findMany({
    where: { returnedAt: null, kit: { archivedAt: null }, ...(onlyOverdue ? { dueOn: { lt: dateOnly(today) } } : {}) },
    orderBy: [{ dueOn: 'asc' }, { issuedAt: 'asc' }],
    include: { kit: { select: { id: true, name: true, code: true } } },
    take: 500,
  })
  const rows = await withStudents(ctx, loans)
  return rows.sort((a, b) => Number(b.overdue) - Number(a.overdue))
}

export async function createKit(ctx: AppContext, input: z.input<typeof kitSchema>) {
  await require(ctx, 'lms.manage')
  const data = kitSchema.parse(input)
  if (data.quantity < 1) throw badRequest('Add at least one kit')
  const actor = actorOf(ctx)
  const kit = await ctx.db.lmsKit.create({
    data: {
      tenantId: ctx.tenant.id,
      name: data.name,
      code: data.code ?? null,
      description: data.description ?? null,
      courseId: await checkCourse(ctx, data.courseId),
      quantity: data.quantity,
      createdById: actor.id,
      createdByLabel: actor.label,
    },
  })
  await auditLms(ctx, 'lms.kit.create', 'LmsKit', kit.id, `Added ${kit.quantity} × ${kit.name}`)
  return kit
}

export async function updateKit(ctx: AppContext, id: string, input: z.input<typeof kitSchema>) {
  await require(ctx, 'lms.manage')
  const kit = await ctx.db.lmsKit.findFirst({ where: { id, archivedAt: null } })
  if (!kit) throw notFound('Kit')
  const data = kitSchema.parse(input)
  const issued = (await outByKit(ctx, [id])).get(id) ?? 0
  if (data.quantity < issued) throw badRequest(`${issued} of these kits are with students; the stock cannot be lower than that`)
  const updated = await ctx.db.lmsKit.update({
    where: { id },
    data: {
      name: data.name,
      code: data.code ?? null,
      description: data.description ?? null,
      courseId: await checkCourse(ctx, data.courseId),
      quantity: data.quantity,
    },
  })
  if (data.quantity !== kit.quantity) {
    await auditLms(ctx, 'lms.kit.stock', 'LmsKit', id, `Stock of ${kit.name} changed from ${kit.quantity} to ${data.quantity}`)
  }
  return updated
}

export async function archiveKit(ctx: AppContext, id: string) {
  await require(ctx, 'lms.manage')
  const kit = await ctx.db.lmsKit.findFirst({ where: { id, archivedAt: null } })
  if (!kit) throw notFound('Kit')
  if ((await outByKit(ctx, [id])).get(id)) throw conflict('Collect every kit back before removing it')
  await ctx.db.lmsKit.update({ where: { id }, data: { archivedAt: new Date() } })
  await auditLms(ctx, 'lms.kit.archive', 'LmsKit', id, `Removed ${kit.name}`)
  return kit
}

/** Current students of one class, for the issue form. */
export async function studentsInClass(ctx: AppContext, classLevelId: string) {
  await require(ctx, 'lms.teach')
  const rows = await ctx.db.enrollment.findMany({
    where: { classLevelId, isCurrent: true, student: { deletedAt: null, status: 'ACTIVE' } },
    select: { studentId: true, section: { select: { name: true } }, student: { select: { firstName: true, lastName: true, admissionNo: true } } },
  })
  return rows
    .map((r) => ({
      id: r.studentId,
      label: `${r.student.firstName} ${r.student.lastName}`.trim(),
      hint: [r.section?.name, r.student.admissionNo].filter(Boolean).join(' · '),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export async function issueKit(ctx: AppContext, kitId: string, input: z.input<typeof issueSchema>) {
  await require(ctx, 'lms.teach')
  const data = issueSchema.parse(input)
  if (data.dueOn && data.dueOn < istClock().iso) throw badRequest('The due date has already passed')
  const student = await ctx.db.student.findFirst({
    where: { id: data.studentId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!student) throw notFound('Student')
  const actor = actorOf(ctx)

  const loan = await ctx.db.$transaction(async (tx) => {
    // Locks the kit row so two people issuing the last kit cannot both succeed.
    const locked = await tx.$queryRawUnsafe<{ quantity: number }[]>(
      'SELECT "quantity" FROM "LmsKit" WHERE "id" = $1 AND "tenantId" = $2 AND "archivedAt" IS NULL FOR UPDATE',
      kitId,
      ctx.tenant.id,
    )
    const kit = locked[0]
    if (!kit) throw notFound('Kit')
    const out = await tx.lmsKitLoan.aggregate({ where: { tenantId: ctx.tenant.id, kitId, returnedAt: null }, _sum: { quantity: true } })
    const available = kit.quantity - (out._sum.quantity ?? 0)
    if (data.quantity > available) {
      throw badRequest(available > 0 ? `Only ${available} left to issue` : 'None left to issue; collect some back first')
    }
    return tx.lmsKitLoan.create({
      data: {
        tenantId: ctx.tenant.id,
        kitId,
        studentId: student.id,
        quantity: data.quantity,
        dueOn: data.dueOn ? dateOnly(data.dueOn) : null,
        note: data.note ?? null,
        issuedById: actor.id,
        issuedByLabel: actor.label,
      },
      include: { kit: { select: { name: true } } },
    })
  })
  await auditLms(ctx, 'lms.kit.issue', 'LmsKitLoan', loan.id, `Issued ${loan.quantity} × ${loan.kit.name} to ${student.firstName} ${student.lastName}`)
  return loan
}

export async function returnKit(ctx: AppContext, loanId: string, input: z.input<typeof returnSchema>) {
  await require(ctx, 'lms.teach')
  const data = returnSchema.parse(input)
  const loan = await ctx.db.lmsKitLoan.findFirst({ where: { id: loanId, returnedAt: null }, include: { kit: { select: { id: true, name: true, quantity: true } } } })
  if (!loan) throw notFound('Kit loan')
  await ctx.db.lmsKitLoan.update({
    where: { id: loanId },
    data: { returnedAt: new Date(), returnCondition: data.condition, returnNote: data.note ?? null, returnedByLabel: actorOf(ctx).label },
  })
  if (data.condition === 'LOST') {
    await ctx.db.lmsKit.update({ where: { id: loan.kitId }, data: { quantity: { decrement: Math.min(loan.quantity, loan.kit.quantity) } } })
  }
  await auditLms(
    ctx,
    'lms.kit.return',
    'LmsKitLoan',
    loanId,
    data.condition === 'LOST' ? `${loan.quantity} × ${loan.kit.name} reported lost` : `${loan.quantity} × ${loan.kit.name} returned (${data.condition.toLowerCase().replace('_', ' ')})`,
  )
  return loan
}

/** Kits a student has at home right now. */
export async function myKits(ctx: AppContext) {
  const learner = await requireLearner(ctx)
  const loans = await ctx.db.lmsKitLoan.findMany({
    where: { studentId: learner.id, returnedAt: null },
    orderBy: { issuedAt: 'desc' },
    include: { kit: { select: { name: true, code: true } } },
  })
  const today = istClock().iso
  return loans.map((l) => ({ ...l, overdue: isOverdue(l.dueOn, today) }))
}