import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { defaultInputs } from '@/lib/roi/assumptions'
import type { RoiInputs } from '@/lib/roi/types'

/**
 * ROI calculator — the part that touches the school's own data.
 *
 * The single thing that separates this from the dozens of generic ROI
 * calculators on the internet: the school does not have to guess its own
 * numbers. Student count, teaching staff, enquiry volume, last month's
 * admissions, the outstanding fee book and the actual subscription price are
 * all already in this database, so the form opens pre-filled with facts and
 * the conversation starts at "is this right?" rather than "how many students
 * do you have?".
 *
 * Every seeded figure stays editable. A school running a partial rollout will
 * have counts that understate reality, and the person in the room has to be
 * able to correct them.
 */

export type RoiSeed = {
  inputs: RoiInputs
  /** Which fields came from the database, so the UI can say so. */
  seeded: string[]
  /** What could not be read, and why. */
  gaps: string[]
}

/** Rupees from minor units, guarding against a null price. */
function toRupees(minor: number | null | undefined): number {
  if (!minor || !Number.isFinite(minor)) return 0
  return Math.round(minor / 100)
}

export async function buildRoiSeed(ctx: AppContext): Promise<RoiSeed> {
  ctx.require('roi.view')

  const inputs = defaultInputs()
  const seeded: string[] = []
  const gaps: string[] = []

  const session = await ctx.db.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  })

  // A calendar month back from today. Enquiry and admission volume are only
  // meaningful as a rate, and last month is the most recent complete-ish one.
  const monthAgo = new Date()
  monthAgo.setMonth(monthAgo.getMonth() - 1)

  const [
    students,
    teachers,
    adminStaff,
    sections,
    enquiries,
    conversions,
    overdue,
    invoicedThisMonth,
    subscription,
  ] = await Promise.all([
    ctx.db.student.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    ctx.db.staff.count({ where: { deletedAt: null, leftOn: null, staffType: 'TEACHING' } }),
    ctx.db.staff.count({ where: { deletedAt: null, leftOn: null, staffType: { not: 'TEACHING' } } }),
    session
      ? ctx.db.section.count({
          where: { deletedAt: null, classLevel: { sessionId: session.id, deletedAt: null } },
        })
      : Promise.resolve(0),
    ctx.db.admissionLead.count({ where: { createdAt: { gte: monthAgo } } }),
    ctx.db.admissionLead.count({
      where: { createdAt: { gte: monthAgo }, convertedStudentId: { not: null } },
    }),
    ctx.db.feeInvoice.aggregate({
      where: {
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        balanceMinor: { gt: 0 },
        dueOn: { lt: new Date() },
      },
      _sum: { balanceMinor: true },
    }),
    ctx.db.feeInvoice.aggregate({
      where: { status: { notIn: ['DRAFT', 'CANCELLED'] }, issuedOn: { gte: monthAgo } },
      _sum: { totalMinor: true },
    }),
    ctx.db.subscription.findFirst({
      select: { cycle: true, plan: { select: { name: true, priceMinor: true, cycle: true } } },
    }),
  ])

  if (students > 0) {
    inputs.profile.students = students
    seeded.push('Students on roll')
  } else {
    gaps.push('No active students on record, so the student count is a default.')
  }

  if (teachers > 0) {
    inputs.profile.teachers = teachers
    seeded.push('Teaching staff')
  }
  if (adminStaff > 0) {
    // Non-teaching staff cover both the office and admissions. Splitting them
    // is a guess, so the whole figure goes to admin and the counsellor count
    // is left for the school to state — inventing a split would be inventing
    // the number this calculator most depends on being right.
    inputs.profile.adminStaff = adminStaff
    seeded.push('Non-teaching staff')
    gaps.push(
      'Admission counsellors are not distinguished from other non-teaching staff in the records, so that count is left for you to set.',
    )
  }

  if (sections > 0) {
    inputs.attendance.dailyUsers = sections
    seeded.push('Sections taking attendance')
  }

  if (enquiries > 0) {
    inputs.admissions.enquiriesPerMonth = enquiries
    inputs.admissions.admissionsPerMonth = Math.min(conversions, enquiries)
    seeded.push('Enquiries and conversions in the last month')
  } else {
    gaps.push(
      'No admission enquiries were logged in the last month, so enquiry volume and conversion are defaults rather than your figures.',
    )
  }

  const overdueRupees = toRupees(overdue._sum.balanceMinor)
  if (overdueRupees > 0) {
    inputs.fees.overdueAmount = overdueRupees
    seeded.push('Outstanding fee book')
  }

  const invoicedRupees = toRupees(invoicedThisMonth._sum.totalMinor)
  if (invoicedRupees > 0) {
    inputs.fees.monthlyFeesDue = invoicedRupees
    seeded.push('Fees invoiced in the last month')
  }

  // The real quoted price, converted to a monthly figure so it sits beside
  // monthly savings. An annual plan divided by twelve is the comparison a
  // school owner is actually making.
  if (subscription?.plan) {
    const price = toRupees(subscription.plan.priceMinor)
    const cycle = subscription.cycle ?? subscription.plan.cycle
    if (price > 0) {
      inputs.platform.monthlySubscription =
        cycle === 'YEARLY' ? Math.round(price / 12) : price
      seeded.push(`MyCampusView plan (${subscription.plan.name})`)
    }
  } else {
    gaps.push('No subscription is recorded for this school, so the platform price is yours to enter.')
  }

  // Annual fee per student is genuinely not derivable: fee structures vary by
  // class, and dividing the invoiced total by head count would produce a
  // figure that looks authoritative and is wrong.
  gaps.push('Average annual fee per student varies by class, so it is not read from fee structures.')

  return { inputs, seeded, gaps }
}

/**
 * Saves a completed calculation.
 *
 * Kept for the reason a sales team actually needs it: being able to reopen
 * what was shown in a meeting three weeks ago and defend it, unchanged, when
 * the school comes back with questions. The inputs and the assumptions are
 * stored alongside the results precisely so an old record can be re-derived
 * rather than merely re-read.
 */
export async function saveRoiCalculation(
  ctx: AppContext,
  data: {
    schoolName: string
    contactName?: string
    email?: string
    phone?: string
    studentCount: number
    scenario: string
    includeRevenue: boolean
    inputs: unknown
    assumptions: unknown
    results: unknown
    netMonthlyBenefit: number
    roiPercent: number | null
  },
) {
  ctx.require('roi.view')

  const saved = await ctx.db.roiCalculation.create({
    data: {
      tenantId: ctx.tenant.id,
      schoolName: data.schoolName,
      contactName: data.contactName ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      studentCount: data.studentCount,
      scenario: data.scenario,
      includeRevenue: data.includeRevenue,
      inputs: data.inputs as object,
      assumptions: data.assumptions as object,
      results: data.results as object,
      netMonthlyBenefit: data.netMonthlyBenefit,
      roiPercent: data.roiPercent,
      createdById: ctx.user.userId,
    },
    select: { id: true, createdAt: true },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'roi.save',
    module: 'roi',
    entityType: 'RoiCalculation',
    entityId: saved.id,
    summary: `Saved an ROI calculation for ${data.schoolName}`,
  })

  return saved
}

export async function listRoiCalculations(ctx: AppContext, limit = 20) {
  ctx.require('roi.view')

  return ctx.db.roiCalculation.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      schoolName: true,
      contactName: true,
      studentCount: true,
      scenario: true,
      includeRevenue: true,
      netMonthlyBenefit: true,
      roiPercent: true,
      createdAt: true,
    },
  })
}
