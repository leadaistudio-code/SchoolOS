import type {
  AttendanceMethod,
  InstitutionType,
  LeakageBand,
  RoiAssumptions,
  RoiInputs,
  Scenario,
} from './types'

/**
 * Every assumption the calculator makes, named and in one file.
 *
 * These are **default estimates**, not industry benchmarks. MyCampusView has
 * no validated multi-school dataset behind them, and calling them benchmarks
 * would be the first lie in a document whose entire value is that it does not
 * contain any. They are stated on screen, editable, and this file is the only
 * place they exist — when real anonymised customer data does arrive, it
 * replaces the numbers here and nothing else changes.
 *
 * The direction of every default is conservative. Where a range was arguable
 * the lower end was taken, because a school owner who finds the estimate
 * pessimistic becomes a customer, and one who finds it inflated does not.
 */

export const SCENARIO_LABEL: Record<Scenario, string> = {
  CONSERVATIVE: 'Conservative',
  EXPECTED: 'Expected',
  OPTIMISTIC: 'Optimistic',
}

export const SCENARIO_BLURB: Record<Scenario, string> = {
  CONSERVATIVE: 'Low adoption, partial rollout, staff still keeping some habits.',
  EXPECTED: 'A normal rollout with the modules in daily use.',
  OPTIMISTIC: 'Full adoption across every team. Still bounded by what the software can do.',
}

/**
 * How much of the current attendance effort goes away, by how it is done now.
 *
 * A school already on an ERP saves far less than one on paper — most of the
 * work has already been removed, and pretending otherwise is where these
 * calculators usually lose the room. The biometric row is lowest of all: the
 * marking is already automatic and what remains is exception handling, which
 * no system eliminates.
 */
const ATTENDANCE_EFFICIENCY: Record<Scenario, Record<AttendanceMethod, number>> = {
  CONSERVATIVE: {
    PAPER: 0.5,
    EXCEL: 0.45,
    SEPARATE_SOFTWARE: 0.2,
    EXISTING_ERP: 0.1,
    BIOMETRIC: 0.05,
  },
  EXPECTED: {
    PAPER: 0.62,
    EXCEL: 0.55,
    SEPARATE_SOFTWARE: 0.3,
    EXISTING_ERP: 0.2,
    BIOMETRIC: 0.12,
  },
  OPTIMISTIC: {
    PAPER: 0.75,
    EXCEL: 0.7,
    SEPARATE_SOFTWARE: 0.4,
    EXISTING_ERP: 0.3,
    BIOMETRIC: 0.2,
  },
}

export const ASSUMPTIONS: Record<Scenario, RoiAssumptions> = {
  CONSERVATIVE: {
    scenario: 'CONSERVATIVE',
    attendanceEfficiency: ATTENDANCE_EFFICIENCY.CONSERVATIVE,
    crmAdminEfficiency: 0.25,
    feeAdminEfficiency: 0.35,
    reportingEfficiency: 0.5,
    questionPaperEfficiency: 0.35,
    communicationEfficiency: 0.25,
    leadRecoveryRate: 0.05,
    unknownLeakage: 0.08,
    feeAccelerationRate: 0.01,
  },
  EXPECTED: {
    scenario: 'EXPECTED',
    attendanceEfficiency: ATTENDANCE_EFFICIENCY.EXPECTED,
    crmAdminEfficiency: 0.4,
    feeAdminEfficiency: 0.5,
    reportingEfficiency: 0.7,
    questionPaperEfficiency: 0.5,
    communicationEfficiency: 0.4,
    leadRecoveryRate: 0.08,
    unknownLeakage: 0.12,
    feeAccelerationRate: 0.03,
  },
  OPTIMISTIC: {
    scenario: 'OPTIMISTIC',
    attendanceEfficiency: ATTENDANCE_EFFICIENCY.OPTIMISTIC,
    crmAdminEfficiency: 0.55,
    feeAdminEfficiency: 0.65,
    reportingEfficiency: 0.8,
    questionPaperEfficiency: 0.65,
    communicationEfficiency: 0.55,
    leadRecoveryRate: 0.15,
    unknownLeakage: 0.18,
    feeAccelerationRate: 0.05,
  },
}

/** What each assumption means, for the panel that exposes them. */
export const ASSUMPTION_NOTES: { key: keyof RoiAssumptions | 'attendanceEfficiency'; label: string; note: string }[] = [
  {
    key: 'attendanceEfficiency',
    label: 'Attendance effort removed',
    note: 'Depends on how attendance is taken today. A school already on an ERP saves far less than one on paper, because most of the work has already gone.',
  },
  {
    key: 'crmAdminEfficiency',
    label: 'Admissions admin removed',
    note: 'Time counsellors spend building call lists, updating spreadsheets and chasing WhatsApp threads, which a shared pipeline with reminders removes.',
  },
  {
    key: 'feeAdminEfficiency',
    label: 'Fee-chasing admin removed',
    note: 'Time spent assembling outstanding lists by hand. The conversation with the parent still has to happen; finding out who to call does not.',
  },
  {
    key: 'reportingEfficiency',
    label: 'Report preparation removed',
    note: 'Reports that a live dashboard or a question to the assistant answers directly, instead of somebody compiling them.',
  },
  {
    key: 'questionPaperEfficiency',
    label: 'Question-paper time removed',
    note: 'Drawing from a question bank with a blueprint rather than starting each paper from a blank page. Setting and reviewing the paper still takes judgement.',
  },
  {
    key: 'communicationEfficiency',
    label: 'Parent-communication admin removed',
    note: 'Bulk announcements, reminders and feedback collection that currently happen one call at a time.',
  },
  {
    key: 'leadRecoveryRate',
    label: 'At-risk enquiries recovered',
    note: 'Of the enquiries that currently go cold, the share that converts once follow-up is systematic. Deliberately small — most cold leads stay cold.',
  },
  {
    key: 'unknownLeakage',
    label: 'Assumed follow-up leakage',
    note: 'Used only when the school does not know its own leakage. If you know it, enter it — this default is a placeholder, not a finding.',
  },
  {
    key: 'feeAccelerationRate',
    label: 'Overdue fees collected sooner',
    note: 'A share of the outstanding book collected earlier because chasing is systematic. This is money the school is already owed — it arrives sooner, it is not new revenue.',
  },
]

export const INSTITUTION_LABEL: Record<InstitutionType, string> = {
  PRESCHOOL: 'Preschool',
  K12: 'K-12 School',
  COACHING: 'Coaching / Training Institute',
  COLLEGE: 'College',
  UNIVERSITY: 'University',
  OTHER: 'Other Educational Institution',
}

export const ATTENDANCE_METHOD_LABEL: Record<AttendanceMethod, string> = {
  PAPER: 'Paper register',
  EXCEL: 'Excel',
  SEPARATE_SOFTWARE: 'Separate attendance software',
  EXISTING_ERP: 'Our existing ERP',
  BIOMETRIC: 'Biometric / integrated device',
}

export const LEAKAGE_LABEL: Record<LeakageBand, string> = {
  LT5: 'Under 5%',
  B5_10: '5–10%',
  B10_20: '10–20%',
  B20_30: '20–30%',
  GT30: 'Over 30%',
  UNKNOWN: "Don't know",
}

/**
 * A band becomes the midpoint of its range.
 *
 * The top band is read as 35% rather than as its floor of 30%: a school that
 * says "over 30%" is describing a problem, and taking the floor would flatter
 * the current process rather than the software.
 */
export function leakageRate(band: LeakageBand, assumptions: RoiAssumptions): number {
  switch (band) {
    case 'LT5':
      return 0.03
    case 'B5_10':
      return 0.075
    case 'B10_20':
      return 0.15
    case 'B20_30':
      return 0.25
    case 'GT30':
      return 0.35
    case 'UNKNOWN':
      return assumptions.unknownLeakage
  }
}

/** The tool categories offered, matching what MyCampusView itself covers. */
export const TOOL_CATALOGUE: { key: string; label: string; note: string }[] = [
  { key: 'crm', label: 'Admissions CRM', note: 'Lead tracking, follow-ups, pipeline' },
  { key: 'communication', label: 'Communication platform', note: 'Announcements, circulars' },
  { key: 'messaging', label: 'WhatsApp / SMS tool', note: 'Bulk messaging credits and software' },
  { key: 'attendance', label: 'Attendance software', note: 'Separate from the main ERP' },
  { key: 'exam', label: 'Exam / question-paper tool', note: 'Paper setting, marks, report cards' },
  { key: 'analytics', label: 'Analytics / reporting', note: 'Dashboards, MIS' },
  { key: 'library', label: 'Library software', note: 'Catalogue, issue and return' },
  { key: 'transport', label: 'Transport / tracking', note: 'Routes, stops, vehicle tracking' },
  { key: 'hr', label: 'HR / payroll', note: 'Staff records, salary, payslips' },
  { key: 'other', label: 'Other tools', note: 'Anything else the school pays for monthly' },
]

/**
 * A starting point, not an answer.
 *
 * Every one of these is visible and editable on the first screen. They exist
 * so a salesperson can open the calculator in a meeting and have something on
 * the screen to correct, which is a far better conversation than an empty form.
 */
export function defaultInputs(): RoiInputs {
  return {
    profile: {
      institutionType: 'K12',
      students: 1200,
      teachers: 45,
      adminStaff: 8,
      admissionStaff: 3,
      teacherSalary: 32000,
      adminSalary: 24000,
      counsellorSalary: 28000,
    },
    working: {
      daysPerMonth: 26,
      hoursPerDay: 8,
      schoolDaysPerMonth: 22,
    },
    technology: {
      currentErpCost: 0,
      currentErpBilling: 'ANNUAL',
      tools: TOOL_CATALOGUE.map((t) => ({ key: t.key, label: t.label, monthlyCost: 0 })),
      replacedShare: 0.7,
    },
    attendance: {
      method: 'EXCEL',
      minutesPerDay: 5,
      dailyUsers: 40,
    },
    admissions: {
      enquiriesPerMonth: 300,
      admissionsPerMonth: 90,
      annualFeePerStudent: 60000,
      leakageBand: 'UNKNOWN',
      staffHoursPerDay: 2,
    },
    fees: {
      monthlyFeesDue: 0,
      overdueAmount: 0,
      staffHoursPerMonth: 20,
    },
    reporting: {
      reportsPerMonth: 12,
      minutesPerReport: 90,
    },
    questionPapers: {
      papersPerTeacherPerMonth: 2,
      minutesPerPaper: 90,
    },
    communication: {
      staffHoursPerWeek: 8,
    },
    platform: {
      monthlySubscription: 0,
      implementationCost: 0,
      addOnsMonthly: 0,
    },
    includeRevenueInRoi: false,
  }
}
