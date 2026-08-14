import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { attendanceDate } from '@/lib/dates'

/** Rupees on the form, paise in the database — parsed once, here. */
const majorToMinor = z.coerce
  .number()
  .min(0, 'Cannot be negative')
  .max(100_000_000)
  .transform((n) => Math.round(n * 100))

export const salaryStructureSchema = z.object({
  staffId: z.string().min(1),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date'),
  basic: majorToMinor,
  hra: majorToMinor.default(0),
  allowances: majorToMinor.default(0),
  deductions: majorToMinor.default(0),
  notes: z.string().trim().max(500).optional(),
})

export const payslipGenerateSchema = z.object({
  staffId: z.string().min(1),
  periodYear: z.coerce.number().int().min(2000).max(2100),
  periodMonth: z.coerce.number().int().min(1).max(12),
  bonus: majorToMinor.default(0),
  notes: z.string().trim().max(500).optional(),
})

export const payslipStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['DRAFT', 'PUBLISHED', 'PAID']),
})

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? String(month)
}

/**
 * Salary revisions for one person, newest first.
 *
 * Revisions are rows rather than edits, so a payslip raised in March can
 * still be explained by the structure that was in force in March even after
 * an April increment.
 */
export async function salaryHistory(ctx: AppContext, staffId: string) {
  ctx.require('staff.payroll')
  return ctx.db.staffSalaryStructure.findMany({
    where: { staffId },
    orderBy: { effectiveFrom: 'desc' },
  })
}

/** The structure in force on a given day, or null before the first one. */
export async function salaryOn(ctx: AppContext, staffId: string, on: Date) {
  return ctx.db.staffSalaryStructure.findFirst({
    where: { staffId, effectiveFrom: { lte: on } },
    orderBy: { effectiveFrom: 'desc' },
  })
}

export async function setSalaryStructure(
  ctx: AppContext,
  input: z.infer<typeof salaryStructureSchema>,
) {
  ctx.require('staff.payroll_manage')

  const staff = await ctx.db.staff.findFirst({
    where: { id: input.staffId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!staff) throw notFound('Staff member')

  const effectiveFrom = attendanceDate(input.effectiveFrom)
  const clash = await ctx.db.staffSalaryStructure.findFirst({
    where: { staffId: input.staffId, effectiveFrom },
  })
  if (clash) {
    throw conflict('A revision already starts on that date. Choose another effective date.')
  }

  const grossMinor = input.basic + input.hra + input.allowances
  const created = await ctx.db.staffSalaryStructure.create({
    data: {
      tenantId: ctx.tenant.id,
      staffId: input.staffId,
      effectiveFrom,
      basicMinor: input.basic,
      hraMinor: input.hra,
      allowancesMinor: input.allowances,
      deductionsMinor: input.deductions,
      grossMinor,
      netMinor: grossMinor - input.deductions,
      notes: input.notes,
      createdById: ctx.user.userId,
    },
  })

  // The single figure on the personnel record follows the latest revision, so
  // the profile and the payroll screen cannot disagree.
  const latest = await ctx.db.staffSalaryStructure.findFirst({
    where: { staffId: input.staffId },
    orderBy: { effectiveFrom: 'desc' },
    select: { grossMinor: true },
  })
  await ctx.db.staff.update({
    where: { id: input.staffId },
    data: { salaryMinor: latest?.grossMinor ?? grossMinor },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff.salary.set',
    module: 'staff',
    entityType: 'StaffSalaryStructure',
    entityId: created.id,
    summary: `Set salary for ${staff.firstName} ${staff.lastName} from ${input.effectiveFrom}`,
    after: created,
  })
  return created
}

export async function listPayslips(
  ctx: AppContext,
  filter: { staffId?: string; periodYear?: number; periodMonth?: number } = {},
) {
  ctx.require('staff.payroll')
  return ctx.db.staffPayslip.findMany({
    where: {
      ...(filter.staffId ? { staffId: filter.staffId } : {}),
      ...(filter.periodYear ? { periodYear: filter.periodYear } : {}),
      ...(filter.periodMonth ? { periodMonth: filter.periodMonth } : {}),
    },
    orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { createdAt: 'desc' }],
    take: 300,
    include: {
      staff: {
        select: { id: true, firstName: true, lastName: true, employeeCode: true, department: true },
      },
    },
  })
}

/**
 * Raises one month's payslip.
 *
 * Loss of pay is worked out from the staff register rather than assumed:
 * absences that were never marked cost nobody anything, which is the honest
 * behaviour when a school has not kept the register. Days actually marked
 * form the denominator, and the numbers are frozen into the row — a register
 * corrected in June must not silently restate a March payslip.
 */
export async function generatePayslip(
  ctx: AppContext,
  input: z.infer<typeof payslipGenerateSchema>,
) {
  ctx.require('staff.payroll_manage')

  const staff = await ctx.db.staff.findFirst({
    where: { id: input.staffId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!staff) throw notFound('Staff member')

  const existing = await ctx.db.staffPayslip.findFirst({
    where: {
      staffId: input.staffId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
    },
  })
  if (existing) {
    throw conflict(
      `${monthName(input.periodMonth)} ${input.periodYear} has already been generated for this person`,
    )
  }

  const periodStart = new Date(Date.UTC(input.periodYear, input.periodMonth - 1, 1))
  const periodEnd = new Date(Date.UTC(input.periodYear, input.periodMonth, 0))

  const structure = await salaryOn(ctx, input.staffId, periodEnd)
  if (!structure) {
    throw new ApiException(
      409,
      'NO_SALARY_STRUCTURE',
      'Set a salary for this person before generating a payslip',
    )
  }

  const marks = await ctx.db.staffAttendance.groupBy({
    by: ['status'],
    where: { staffId: input.staffId, onDate: { gte: periodStart, lte: periodEnd } },
    _count: { _all: true },
  })
  const count = (status: string) => marks.find((m) => m.status === status)?._count._all ?? 0

  const present = count('PRESENT') + count('LATE')
  const half = count('HALF_DAY')
  const leave = count('LEAVE')
  const absent = count('ABSENT')
  const workingDays = present + half + leave + absent

  // Approved leave is paid; a half-day is half. Only an unexplained absence
  // costs money.
  const paidDays = present + half * 0.5 + leave
  const lopDays = workingDays > 0 ? workingDays - paidDays : 0
  const perDay = workingDays > 0 ? structure.grossMinor / workingDays : 0
  const lopMinor = Math.round(perDay * lopDays)

  const grossMinor = structure.grossMinor + input.bonus
  const netMinor = grossMinor - structure.deductionsMinor - lopMinor

  const created = await ctx.db.staffPayslip.create({
    data: {
      tenantId: ctx.tenant.id,
      staffId: input.staffId,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      workingDays,
      paidDays: Math.round(paidDays),
      basicMinor: structure.basicMinor,
      hraMinor: structure.hraMinor,
      allowancesMinor: structure.allowancesMinor,
      bonusMinor: input.bonus,
      deductionsMinor: structure.deductionsMinor,
      lopMinor,
      grossMinor,
      netMinor,
      notes: input.notes,
      generatedById: ctx.user.userId,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff.payslip.generate',
    module: 'staff',
    entityType: 'StaffPayslip',
    entityId: created.id,
    summary: `Payslip for ${staff.firstName} ${staff.lastName}, ${monthName(input.periodMonth)} ${input.periodYear}`,
    after: created,
  })
  return created
}

/** Draft → published → paid. Paid stamps the date the money went out. */
export async function setPayslipStatus(
  ctx: AppContext,
  input: z.infer<typeof payslipStatusSchema>,
) {
  ctx.require('staff.payroll_manage')

  const payslip = await ctx.db.staffPayslip.findFirst({ where: { id: input.id } })
  if (!payslip) throw notFound('Payslip')

  const updated = await ctx.db.staffPayslip.update({
    where: { id: input.id },
    data: {
      status: input.status,
      paidAt: input.status === 'PAID' ? (payslip.paidAt ?? new Date()) : null,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff.payslip.status',
    module: 'staff',
    entityType: 'StaffPayslip',
    entityId: input.id,
    summary: `Payslip marked ${input.status.toLowerCase()}`,
    before: { status: payslip.status },
    after: { status: updated.status },
  })
  return updated
}

/** Deletes a draft payslip. Published and paid rows stay on the record. */
export async function deletePayslip(ctx: AppContext, id: string) {
  ctx.require('staff.payroll_manage')

  const payslip = await ctx.db.staffPayslip.findFirst({ where: { id } })
  if (!payslip) throw notFound('Payslip')
  if (payslip.status !== 'DRAFT') {
    throw conflict('Only a draft payslip can be deleted. Published ones stay on the record.')
  }

  await ctx.db.staffPayslip.delete({ where: { id } })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff.payslip.delete',
    module: 'staff',
    entityType: 'StaffPayslip',
    entityId: id,
    summary: `Deleted draft payslip for ${monthName(payslip.periodMonth)} ${payslip.periodYear}`,
    before: payslip,
  })
}

/** The payroll month at a glance: how much is drafted, published and paid. */
export async function payrollSummary(ctx: AppContext, year: number, month: number) {
  ctx.require('staff.payroll')

  const [rows, headcount, onSalary] = await Promise.all([
    ctx.db.staffPayslip.groupBy({
      by: ['status'],
      where: { periodYear: year, periodMonth: month },
      _sum: { netMinor: true },
      _count: { _all: true },
    }),
    ctx.db.staff.count({ where: { deletedAt: null, leftOn: null } }),
    ctx.db.staffSalaryStructure
      .findMany({ distinct: ['staffId'], select: { staffId: true } })
      .then((r) => r.length),
  ])

  const at = (status: string) => rows.find((r) => r.status === status)
  const total = rows.reduce((sum, r) => sum + (r._sum.netMinor ?? 0), 0)

  return {
    headcount,
    onSalary,
    withoutSalary: Math.max(0, headcount - onSalary),
    generated: rows.reduce((sum, r) => sum + r._count._all, 0),
    draftMinor: at('DRAFT')?._sum.netMinor ?? 0,
    publishedMinor: at('PUBLISHED')?._sum.netMinor ?? 0,
    paidMinor: at('PAID')?._sum.netMinor ?? 0,
    totalMinor: total,
    paidCount: at('PAID')?._count._all ?? 0,
  }
}
