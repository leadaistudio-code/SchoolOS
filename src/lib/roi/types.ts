/**
 * ROI calculator — the shapes.
 *
 * Deliberately free of any import: the engine is pure arithmetic over these
 * types, the UI renders them, and the tests exercise them without a browser or
 * a database anywhere in the picture.
 *
 * The central idea in this model is that a rupee is never just a rupee. Money
 * that a school stops spending, money that represents time given back, and
 * money that *might* arrive if follow-ups improve are three different claims
 * with three different levels of confidence, and mixing them is what makes
 * most vendor ROI calculators worthless in a real meeting. Every figure
 * produced here carries its category with it.
 */

export type InstitutionType =
  | 'PRESCHOOL'
  | 'K12'
  | 'COACHING'
  | 'COLLEGE'
  | 'UNIVERSITY'
  | 'OTHER'

export type AttendanceMethod =
  | 'PAPER'
  | 'EXCEL'
  | 'SEPARATE_SOFTWARE'
  | 'EXISTING_ERP'
  | 'BIOMETRIC'

export type LeakageBand = 'LT5' | 'B5_10' | 'B10_20' | 'B20_30' | 'GT30' | 'UNKNOWN'

export type Scenario = 'CONSERVATIVE' | 'EXPECTED' | 'OPTIMISTIC'

/**
 * What a line of value actually is.
 *
 * `HARD` is money that leaves the bank account today and would not tomorrow.
 * `PRODUCTIVITY` is hours returned, priced at what those hours cost — real
 * value, but it does not show up as cash unless the school chooses to act on
 * it. `REVENUE` is a scenario: money that might be earned or collected sooner.
 * They are never summed into a single headline without saying which is which.
 */
export type ValueCategory = 'HARD' | 'PRODUCTIVITY' | 'REVENUE' | 'COST'

/**
 * One traceable figure.
 *
 * `formula` is rendered with the school's own numbers substituted in, so a
 * sceptical owner asking "where did ₹8,400 come from?" gets the arithmetic
 * rather than a reassurance. Nothing reaches the screen that cannot produce
 * one of these.
 */
export type TraceLine = {
  id: string
  label: string
  category: ValueCategory
  /** Which MyCampusView module produces this, for the audit trail. */
  module: string
  /** Hours per month, where the line represents time. */
  hours?: number
  /** Rupees per month. */
  amount: number
  /** The arithmetic, with real values substituted. */
  formula: string
  /** Why this is a defensible thing to count. */
  basis: string
}

export type ToolCost = {
  key: string
  label: string
  monthlyCost: number
}

export type RoiInputs = {
  profile: {
    institutionType: InstitutionType
    students: number
    teachers: number
    adminStaff: number
    admissionStaff: number
    /** ₹ per month. */
    teacherSalary: number
    adminSalary: number
    counsellorSalary: number
  }

  /** Working-day model used to turn a salary into an hourly cost. */
  working: {
    daysPerMonth: number
    hoursPerDay: number
    /** Instructional days — attendance is only taken on these. */
    schoolDaysPerMonth: number
  }

  technology: {
    /** As entered, before normalising to a monthly figure. */
    currentErpCost: number
    currentErpBilling: 'MONTHLY' | 'ANNUAL'
    tools: ToolCost[]
    /**
     * Share of current spend the school believes MyCampusView actually
     * replaces. Never assumed to be everything: a school may keep its
     * accounting package or its biometric hardware contract.
     */
    replacedShare: number
  }

  attendance: {
    method: AttendanceMethod
    /** Minutes per day, per class or per staff member. */
    minutesPerDay: number
    /** Classes or staff taking attendance each day. */
    dailyUsers: number
  }

  admissions: {
    enquiriesPerMonth: number
    admissionsPerMonth: number
    annualFeePerStudent: number
    leakageBand: LeakageBand
    /** Hours per counsellor per day chasing leads by hand. */
    staffHoursPerDay: number
  }

  fees: {
    monthlyFeesDue: number
    overdueAmount: number
    /** Staff hours a month spent building outstanding lists and chasing. */
    staffHoursPerMonth: number
  }

  reporting: {
    reportsPerMonth: number
    minutesPerReport: number
  }

  questionPapers: {
    papersPerTeacherPerMonth: number
    minutesPerPaper: number
  }

  communication: {
    /** Staff hours a week on calls, reminders and feedback collection. */
    staffHoursPerWeek: number
  }

  platform: {
    monthlySubscription: number
    implementationCost: number
    addOnsMonthly: number
  }

  /**
   * Whether the revenue scenario counts towards the headline ROI.
   *
   * Off by default, and that is the single most important default in this
   * file: the credible number is the one built only from spend removed and
   * hours returned.
   */
  includeRevenueInRoi: boolean
}

/**
 * Every efficiency factor, in one place.
 *
 * Each is a share between 0 and 1 of the current effort that goes away. None
 * is 1: no software removes a task entirely, and a calculator that claims it
 * does is not one anybody should present to a school owner.
 */
export type RoiAssumptions = {
  scenario: Scenario
  attendanceEfficiency: Record<AttendanceMethod, number>
  crmAdminEfficiency: number
  feeAdminEfficiency: number
  reportingEfficiency: number
  questionPaperEfficiency: number
  communicationEfficiency: number
  /** Share of at-risk enquiries that better follow-up actually converts. */
  leadRecoveryRate: number
  /** Follow-up leakage used when the school says it does not know. */
  unknownLeakage: number
  /** Share of the overdue book collected sooner because chasing is systematic. */
  feeAccelerationRate: number
}

export type RoiResult = {
  scenario: Scenario

  /** Derived from the salary and working-day inputs. */
  hourly: {
    teacher: number
    admin: number
    counsellor: number
  }

  lines: TraceLine[]

  hoursSavedPerMonth: number
  /** Hours per module, for the breakdown chart. */
  hoursByArea: { label: string; hours: number }[]

  monthlyHardSavings: number
  monthlyProductivityValue: number
  /** Hard + productivity. The defensible total. */
  monthlyOperationalValue: number

  monthlyPlatformCost: number

  /** Operational value less platform cost. The headline. */
  netMonthlyBenefit: number
  annualNetBenefit: number
  firstYearNetBenefit: number
  roiPercent: number | null
  paybackMonths: number | null

  revenue: {
    currentConversionRate: number | null
    leakageRate: number
    leadsAtRisk: number
    recoverableAdmissions: number
    annualEnrolmentValue: number
    monthlyEquivalent: number
    feeAcceleration: number
    /** Monthly equivalent + fee acceleration. */
    monthlyOpportunity: number
  }

  /** The same figures again, with the revenue scenario folded in. */
  withRevenue: {
    netMonthlyBenefit: number
    annualNetBenefit: number
    roiPercent: number | null
    paybackMonths: number | null
  }

  /** Working days a month the saved hours amount to. */
  workingDaysReturned: number
  hoursSavedPerYear: number

  /** Anything that could not be computed, and why. */
  notes: string[]
}
