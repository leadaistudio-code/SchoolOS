import { leakageRate } from './assumptions'
import { formatInr, round0, round1, round2 } from './format'
import type { RoiAssumptions, RoiInputs, RoiResult, TraceLine } from './types'

/**
 * The ROI engine.
 *
 * Pure: same inputs and assumptions, same numbers, every time. No dates, no
 * randomness, no I/O, nothing imported from React or Prisma — which is what
 * makes it testable and what stops financial arithmetic from drifting into
 * JSX where nobody can check it.
 *
 * Three rules run through the whole file:
 *
 *  1. **Every figure carries its category.** Spend removed, hours returned and
 *     revenue that might arrive are three different claims. They are computed
 *     separately, displayed separately, and only the first two reach the
 *     headline ROI unless the user deliberately says otherwise.
 *  2. **Every figure carries its arithmetic.** Each line records the formula
 *     with the school's own numbers in it, so "how did you get ₹8,400?" has an
 *     answer on screen rather than in a spreadsheet somebody has to go and find.
 *  3. **Nothing is ever fully eliminated.** No efficiency factor is 1. Software
 *     removes effort; it does not remove work.
 */

const WEEKS_PER_MONTH = 4.33

/** Guards every division. Bad input produces zero, never NaN or Infinity. */
function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0
  const result = numerator / denominator
  return Number.isFinite(result) ? result : 0
}

/** Clamps anything that arrived as a stray string, NaN or negative. */
function clean(value: number, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

/**
 * What one hour of a person's time costs the school.
 *
 * Gross salary over contracted hours — deliberately not loaded with PF,
 * gratuity or overheads. Those are real costs, but including them inflates
 * every productivity figure by a fifth on an assumption the school has not
 * agreed to, and this calculator has to survive somebody checking it.
 */
export function hourlyCost(monthlySalary: number, daysPerMonth: number, hoursPerDay: number): number {
  return safeDivide(clean(monthlySalary), clean(daysPerMonth, { min: 1 }) * clean(hoursPerDay, { min: 1 }))
}

/** Current technology spend, normalised to rupees a month. */
export function monthlyTechnologySpend(inputs: RoiInputs): number {
  const erp =
    inputs.technology.currentErpBilling === 'ANNUAL'
      ? safeDivide(clean(inputs.technology.currentErpCost), 12)
      : clean(inputs.technology.currentErpCost)

  const tools = inputs.technology.tools.reduce((sum, tool) => sum + clean(tool.monthlyCost), 0)
  return erp + tools
}

export function calculateRoi(inputs: RoiInputs, assumptions: RoiAssumptions): RoiResult {
  const notes: string[] = []
  const lines: TraceLine[] = []

  const daysPerMonth = clean(inputs.working.daysPerMonth, { min: 1, max: 31 })
  const hoursPerDay = clean(inputs.working.hoursPerDay, { min: 1, max: 16 })
  const schoolDays = clean(inputs.working.schoolDaysPerMonth, { min: 1, max: 31 })

  const hourly = {
    teacher: hourlyCost(inputs.profile.teacherSalary, daysPerMonth, hoursPerDay),
    admin: hourlyCost(inputs.profile.adminSalary, daysPerMonth, hoursPerDay),
    counsellor: hourlyCost(inputs.profile.counsellorSalary, daysPerMonth, hoursPerDay),
  }

  const rate = (n: number) => `${round0(n * 100)}%`

  /* ---------------------------------------------------------------------- */
  /* 1. Attendance — Attendance module                                       */
  /* ---------------------------------------------------------------------- */

  const attendanceUsers = clean(inputs.attendance.dailyUsers)
  const attendanceMinutes = clean(inputs.attendance.minutesPerDay)
  const attendanceCurrentHours = safeDivide(attendanceMinutes * attendanceUsers * schoolDays, 60)
  const attendanceFactor = assumptions.attendanceEfficiency[inputs.attendance.method] ?? 0
  const attendanceHours = attendanceCurrentHours * attendanceFactor
  const attendanceValue = attendanceHours * hourly.teacher

  if (attendanceHours > 0) {
    lines.push({
      id: 'attendance',
      label: 'Attendance administration',
      category: 'PRODUCTIVITY',
      module: 'Attendance',
      hours: attendanceHours,
      amount: attendanceValue,
      formula: `${attendanceMinutes} min × ${attendanceUsers} classes × ${schoolDays} school days ÷ 60 = ${round1(attendanceCurrentHours)} hrs/month, × ${rate(attendanceFactor)} removed = ${round1(attendanceHours)} hrs × ${formatInr(hourly.teacher)}/hr`,
      basis: 'Marking, correcting and consolidating the register. Priced at the teacher hourly rate because class teachers take it.',
    })
  }

  /* ---------------------------------------------------------------------- */
  /* 2. Admissions counsellor admin — Admissions CRM                         */
  /* ---------------------------------------------------------------------- */

  const counsellors = clean(inputs.profile.admissionStaff)
  const admissionsCurrentHours = clean(inputs.admissions.staffHoursPerDay) * daysPerMonth * counsellors
  const admissionsHours = admissionsCurrentHours * assumptions.crmAdminEfficiency
  const admissionsValue = admissionsHours * hourly.counsellor

  if (admissionsHours > 0) {
    lines.push({
      id: 'admissions-admin',
      label: 'Admissions follow-up admin',
      category: 'PRODUCTIVITY',
      module: 'Admissions CRM',
      hours: admissionsHours,
      amount: admissionsValue,
      formula: `${clean(inputs.admissions.staffHoursPerDay)} hrs/day × ${daysPerMonth} days × ${counsellors} counsellors = ${round1(admissionsCurrentHours)} hrs/month, × ${rate(assumptions.crmAdminEfficiency)} removed = ${round1(admissionsHours)} hrs × ${formatInr(hourly.counsellor)}/hr`,
      basis: 'Building call lists, updating spreadsheets and reconstructing who was last contacted. The calls themselves still happen.',
    })
  }

  /* ---------------------------------------------------------------------- */
  /* 3. Fee chasing admin — Fees                                             */
  /* ---------------------------------------------------------------------- */

  const feeCurrentHours = clean(inputs.fees.staffHoursPerMonth)
  const feeHours = feeCurrentHours * assumptions.feeAdminEfficiency
  const feeValue = feeHours * hourly.admin

  if (feeHours > 0) {
    lines.push({
      id: 'fee-admin',
      label: 'Outstanding-fee administration',
      category: 'PRODUCTIVITY',
      module: 'Fees',
      hours: feeHours,
      amount: feeValue,
      formula: `${round1(feeCurrentHours)} hrs/month × ${rate(assumptions.feeAdminEfficiency)} removed = ${round1(feeHours)} hrs × ${formatInr(hourly.admin)}/hr`,
      basis: 'Assembling outstanding lists and reconciling receipts. Finding out who to call is automated; the call is not.',
    })
  }

  /* ---------------------------------------------------------------------- */
  /* 4. Management reporting — Reports + Assistant                           */
  /* ---------------------------------------------------------------------- */

  const reports = clean(inputs.reporting.reportsPerMonth)
  const reportMinutes = clean(inputs.reporting.minutesPerReport)
  const reportingCurrentHours = safeDivide(reports * reportMinutes, 60)
  const reportingHours = reportingCurrentHours * assumptions.reportingEfficiency
  const reportingValue = reportingHours * hourly.admin

  if (reportingHours > 0) {
    lines.push({
      id: 'reporting',
      label: 'Management reporting',
      category: 'PRODUCTIVITY',
      module: 'Reports + Assistant',
      hours: reportingHours,
      amount: reportingValue,
      formula: `${reports} reports × ${reportMinutes} min ÷ 60 = ${round1(reportingCurrentHours)} hrs/month, × ${rate(assumptions.reportingEfficiency)} removed = ${round1(reportingHours)} hrs × ${formatInr(hourly.admin)}/hr`,
      basis: 'Reports a live dashboard already answers, or that management can ask the assistant directly instead of requesting from a team.',
    })
  }

  /* ---------------------------------------------------------------------- */
  /* 5. Question papers — Assessments + Question bank                        */
  /* ---------------------------------------------------------------------- */

  const teachers = clean(inputs.profile.teachers)
  const papers = clean(inputs.questionPapers.papersPerTeacherPerMonth)
  const paperMinutes = clean(inputs.questionPapers.minutesPerPaper)
  const paperCurrentHours = safeDivide(teachers * papers * paperMinutes, 60)
  const paperHours = paperCurrentHours * assumptions.questionPaperEfficiency
  const paperValue = paperHours * hourly.teacher

  if (paperHours > 0) {
    lines.push({
      id: 'question-papers',
      label: 'Question-paper preparation',
      category: 'PRODUCTIVITY',
      module: 'Assessments + Question bank',
      hours: paperHours,
      amount: paperValue,
      formula: `${teachers} teachers × ${papers} papers × ${paperMinutes} min ÷ 60 = ${round1(paperCurrentHours)} hrs/month, × ${rate(assumptions.questionPaperEfficiency)} removed = ${round1(paperHours)} hrs × ${formatInr(hourly.teacher)}/hr`,
      basis: 'Assembling a paper from a question bank against a blueprint rather than from a blank page. Teacher productivity value — hours returned to teaching, not salary removed.',
    })
  }

  /* ---------------------------------------------------------------------- */
  /* 6. Parent communication — Communication + Feedback                      */
  /* ---------------------------------------------------------------------- */

  const commCurrentHours = clean(inputs.communication.staffHoursPerWeek) * WEEKS_PER_MONTH
  const commHours = commCurrentHours * assumptions.communicationEfficiency
  const commValue = commHours * hourly.admin

  if (commHours > 0) {
    lines.push({
      id: 'communication',
      label: 'Parent communication & feedback',
      category: 'PRODUCTIVITY',
      module: 'Communication + Feedback',
      hours: commHours,
      amount: commValue,
      formula: `${clean(inputs.communication.staffHoursPerWeek)} hrs/week × ${WEEKS_PER_MONTH} = ${round1(commCurrentHours)} hrs/month, × ${rate(assumptions.communicationEfficiency)} removed = ${round1(commHours)} hrs × ${formatInr(hourly.admin)}/hr`,
      basis: 'Announcements, reminders and feedback collection sent once to a group instead of one call at a time.',
    })
  }

  /* ---------------------------------------------------------------------- */
  /* 7. Software consolidation — the only hard saving                        */
  /* ---------------------------------------------------------------------- */

  const techSpend = monthlyTechnologySpend(inputs)
  const replacedShare = clean(inputs.technology.replacedShare, { min: 0, max: 1 })
  const softwareSaving = techSpend * replacedShare

  if (softwareSaving > 0) {
    lines.push({
      id: 'software',
      label: 'Software replaced',
      category: 'HARD',
      module: 'Platform consolidation',
      amount: softwareSaving,
      formula: `${formatInr(techSpend)}/month current spend × ${rate(replacedShare)} replaced = ${formatInr(softwareSaving)}`,
      basis: 'Subscriptions the school stops paying. The only figure here that is cash rather than time.',
    })
  } else if (techSpend === 0) {
    notes.push(
      'No current software spend was entered, so no hard cost saving is claimed. The ROI shown rests entirely on time returned.',
    )
  }

  /* ---------------------------------------------------------------------- */
  /* Revenue scenario — kept out of the headline unless asked for            */
  /* ---------------------------------------------------------------------- */

  const enquiries = clean(inputs.admissions.enquiriesPerMonth)
  const admissionsWon = clean(inputs.admissions.admissionsPerMonth)
  const annualFee = clean(inputs.admissions.annualFeePerStudent)

  const currentConversionRate = enquiries > 0 ? Math.min(1, safeDivide(admissionsWon, enquiries)) : null
  if (admissionsWon > enquiries && enquiries > 0) {
    notes.push(
      'Admissions exceed enquiries, so the conversion rate is capped at 100%. Check whether walk-ins are being counted as admissions but not as enquiries.',
    )
  }

  const leakage = leakageRate(inputs.admissions.leakageBand, assumptions)
  const leadsAtRisk = enquiries * leakage
  const recoverableAdmissions = leadsAtRisk * assumptions.leadRecoveryRate
  const annualEnrolmentValue = recoverableAdmissions * annualFee
  // An annual fee is not monthly cash. Spreading it over twelve months is the
  // only honest way to sit it beside a monthly subscription.
  const monthlyEquivalent = safeDivide(annualEnrolmentValue, 12)

  if (inputs.admissions.leakageBand === 'UNKNOWN' && enquiries > 0) {
    notes.push(
      `Follow-up leakage was not known, so ${rate(assumptions.unknownLeakage)} was assumed. This is a default estimate, not a measurement of your school.`,
    )
  }

  const feeAcceleration = clean(inputs.fees.overdueAmount) * assumptions.feeAccelerationRate

  const revenueOpportunity = monthlyEquivalent + feeAcceleration

  if (annualEnrolmentValue > 0) {
    lines.push({
      id: 'admissions-revenue',
      label: 'Admission revenue protected',
      category: 'REVENUE',
      module: 'Admissions CRM',
      amount: monthlyEquivalent,
      formula: `${round0(enquiries)} enquiries × ${rate(leakage)} leaking = ${round1(leadsAtRisk)} at risk, × ${rate(assumptions.leadRecoveryRate)} recovered = ${round2(recoverableAdmissions)} admissions × ${formatInr(annualFee)} = ${formatInr(annualEnrolmentValue)}/year ÷ 12`,
      basis: 'A scenario, not a forecast. Assumes only that a small share of enquiries currently going cold would convert with systematic follow-up.',
    })
  }

  if (feeAcceleration > 0) {
    lines.push({
      id: 'fee-acceleration',
      label: 'Overdue fees collected sooner',
      category: 'REVENUE',
      module: 'Fees',
      amount: feeAcceleration,
      formula: `${formatInr(clean(inputs.fees.overdueAmount))} overdue × ${rate(assumptions.feeAccelerationRate)} collected earlier`,
      basis: 'Cash-flow timing, not new income. The school is already owed this money — it arrives sooner, and some of it would have arrived anyway.',
    })
  }

  /* ---------------------------------------------------------------------- */
  /* Platform cost                                                           */
  /* ---------------------------------------------------------------------- */

  const monthlyPlatformCost =
    clean(inputs.platform.monthlySubscription) + clean(inputs.platform.addOnsMonthly)
  const implementation = clean(inputs.platform.implementationCost)

  if (monthlyPlatformCost > 0) {
    lines.push({
      id: 'platform-cost',
      label: 'MyCampusView subscription',
      category: 'COST',
      module: 'Platform',
      amount: -monthlyPlatformCost,
      formula: `${formatInr(clean(inputs.platform.monthlySubscription))} subscription + ${formatInr(clean(inputs.platform.addOnsMonthly))} add-ons`,
      basis: 'What the school pays every month.',
    })
  }

  /* ---------------------------------------------------------------------- */
  /* Totals                                                                  */
  /* ---------------------------------------------------------------------- */

  const productivityLines = lines.filter((l) => l.category === 'PRODUCTIVITY')
  const monthlyProductivityValue = productivityLines.reduce((sum, l) => sum + l.amount, 0)
  const monthlyHardSavings = lines
    .filter((l) => l.category === 'HARD')
    .reduce((sum, l) => sum + l.amount, 0)

  const monthlyOperationalValue = monthlyHardSavings + monthlyProductivityValue
  const hoursSavedPerMonth = productivityLines.reduce((sum, l) => sum + (l.hours ?? 0), 0)

  const netMonthlyBenefit = monthlyOperationalValue - monthlyPlatformCost
  const annualNetBenefit = netMonthlyBenefit * 12
  const firstYearNetBenefit = annualNetBenefit - implementation

  // No subscription means there is nothing to divide by — an infinite return
  // is not a number to show a school owner.
  const roiPercent =
    monthlyPlatformCost > 0 ? (netMonthlyBenefit / monthlyPlatformCost) * 100 : null

  // Payback only means something when there is an up-front cost to pay back
  // and a positive monthly benefit to pay it back with.
  const paybackMonths =
    implementation > 0 && netMonthlyBenefit > 0 ? implementation / netMonthlyBenefit : null

  if (monthlyPlatformCost === 0) {
    notes.push(
      'No MyCampusView subscription was entered, so ROI percentage and payback cannot be calculated. Enter the quoted price to complete the picture.',
    )
  }
  if (netMonthlyBenefit <= 0 && monthlyPlatformCost > 0) {
    notes.push(
      'On these inputs the platform costs more than the operational value it returns. That is a real result, not an error — the inputs are worth revisiting before the revenue scenario is considered.',
    )
  }

  const withRevenueNet = netMonthlyBenefit + revenueOpportunity
  const withRevenue = {
    netMonthlyBenefit: withRevenueNet,
    annualNetBenefit: withRevenueNet * 12,
    roiPercent: monthlyPlatformCost > 0 ? (withRevenueNet / monthlyPlatformCost) * 100 : null,
    paybackMonths: implementation > 0 && withRevenueNet > 0 ? implementation / withRevenueNet : null,
  }

  const hoursByArea = productivityLines
    .map((l) => ({ label: l.label, hours: round1(l.hours ?? 0) }))
    .filter((a) => a.hours > 0)
    .sort((a, b) => b.hours - a.hours)

  return {
    scenario: assumptions.scenario,
    hourly,
    lines,
    hoursSavedPerMonth,
    hoursByArea,
    monthlyHardSavings,
    monthlyProductivityValue,
    monthlyOperationalValue,
    monthlyPlatformCost,
    netMonthlyBenefit,
    annualNetBenefit,
    firstYearNetBenefit,
    roiPercent,
    paybackMonths,
    revenue: {
      currentConversionRate,
      leakageRate: leakage,
      leadsAtRisk,
      recoverableAdmissions,
      annualEnrolmentValue,
      monthlyEquivalent,
      feeAcceleration,
      monthlyOpportunity: revenueOpportunity,
    },
    withRevenue,
    workingDaysReturned: safeDivide(hoursSavedPerMonth, hoursPerDay),
    hoursSavedPerYear: hoursSavedPerMonth * 12,
    notes,
  }
}

/**
 * The headline figures, honouring the revenue toggle.
 *
 * One place decides what "the ROI" means, so the cards, the summary sentence
 * and any saved record can never disagree about whether the revenue scenario
 * was counted.
 */
export function headline(result: RoiResult, includeRevenue: boolean) {
  return includeRevenue
    ? {
        net: result.withRevenue.netMonthlyBenefit,
        annual: result.withRevenue.annualNetBenefit,
        roiPercent: result.withRevenue.roiPercent,
        paybackMonths: result.withRevenue.paybackMonths,
        includesRevenue: true,
      }
    : {
        net: result.netMonthlyBenefit,
        annual: result.annualNetBenefit,
        roiPercent: result.roiPercent,
        paybackMonths: result.paybackMonths,
        includesRevenue: false,
      }
}
