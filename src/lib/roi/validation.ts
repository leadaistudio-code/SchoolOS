import { z } from 'zod'

/**
 * Input bounds.
 *
 * Two jobs, and only two. Stop arithmetic that produces nonsense — negative
 * salaries, zero working days, a conversion rate above 100% — and stop nothing
 * else. The ceilings are set where a genuine institution could never reach
 * them: a university with 200,000 students passes, a typo of 20 million does
 * not.
 *
 * Bounds are not opinions about whether a school's numbers are sensible. A
 * school that spends nothing on software today, or is quoted a subscription of
 * zero, is a legitimate case the calculator must answer rather than reject.
 */

const money = (max: number, label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .finite(`${label} must be a number`)
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} looks too large — check the figure`)

const count = (max: number, label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .finite(`${label} must be a number`)
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(max, `${label} looks too large — check the figure`)

const share = (label: string) =>
  z.coerce.number().finite().min(0, `${label} cannot be negative`).max(1, `${label} cannot exceed 100%`)

export const roiInputsSchema = z
  .object({
    profile: z.object({
      institutionType: z.enum(['PRESCHOOL', 'K12', 'COACHING', 'COLLEGE', 'UNIVERSITY', 'OTHER']),
      // Generous enough for a large university, tight enough to catch a slip.
      students: count(500_000, 'Number of students'),
      teachers: count(50_000, 'Number of teachers'),
      adminStaff: count(50_000, 'Administrative staff'),
      admissionStaff: count(50_000, 'Admission staff'),
      teacherSalary: money(10_000_000, 'Teacher salary'),
      adminSalary: money(10_000_000, 'Admin salary'),
      counsellorSalary: money(10_000_000, 'Counsellor salary'),
    }),

    working: z.object({
      // A month cannot have more than 31 working days, and zero would divide
      // by nothing when computing an hourly cost.
      daysPerMonth: z.coerce.number().int().min(1, 'At least one working day').max(31, 'A month has at most 31 days'),
      hoursPerDay: z.coerce.number().min(1, 'At least one hour').max(16, 'More than 16 hours a day is not a working pattern'),
      schoolDaysPerMonth: z.coerce.number().int().min(1, 'At least one school day').max(31, 'A month has at most 31 days'),
    }),

    technology: z.object({
      currentErpCost: money(100_000_000, 'Current ERP cost'),
      currentErpBilling: z.enum(['MONTHLY', 'ANNUAL']),
      tools: z
        .array(
          z.object({
            key: z.string().min(1).max(40),
            label: z.string().min(1).max(80),
            monthlyCost: money(10_000_000, 'Tool cost'),
          }),
        )
        .max(20),
      replacedShare: share('Share of tools replaced'),
    }),

    attendance: z.object({
      method: z.enum(['PAPER', 'EXCEL', 'SEPARATE_SOFTWARE', 'EXISTING_ERP', 'BIOMETRIC']),
      minutesPerDay: z.coerce.number().min(0).max(480, 'More than a full working day per class is not plausible'),
      dailyUsers: count(20_000, 'Classes taking attendance'),
    }),

    admissions: z.object({
      enquiriesPerMonth: count(200_000, 'Monthly enquiries'),
      admissionsPerMonth: count(200_000, 'Monthly admissions'),
      annualFeePerStudent: money(10_000_000, 'Annual fee'),
      leakageBand: z.enum(['LT5', 'B5_10', 'B10_20', 'B20_30', 'GT30', 'UNKNOWN']),
      staffHoursPerDay: z.coerce.number().min(0).max(16, 'Cannot exceed a working day'),
    }),

    fees: z.object({
      monthlyFeesDue: money(10_000_000_000, 'Monthly fees due'),
      overdueAmount: money(10_000_000_000, 'Overdue amount'),
      staffHoursPerMonth: z.coerce.number().min(0).max(2000, 'More than this exceeds a full-time role'),
    }),

    reporting: z.object({
      reportsPerMonth: count(1000, 'Reports per month'),
      minutesPerReport: z.coerce.number().min(0).max(4800, 'More than ten working days per report is not plausible'),
    }),

    questionPapers: z.object({
      papersPerTeacherPerMonth: z.coerce.number().min(0).max(100, 'More than 100 papers a month per teacher is not plausible'),
      minutesPerPaper: z.coerce.number().min(0).max(2400, 'More than five working days per paper is not plausible'),
    }),

    communication: z.object({
      staffHoursPerWeek: z.coerce.number().min(0).max(500, 'More than this exceeds a full team'),
    }),

    platform: z.object({
      monthlySubscription: money(10_000_000, 'Monthly subscription'),
      implementationCost: money(50_000_000, 'Implementation cost'),
      addOnsMonthly: money(10_000_000, 'Add-ons'),
    }),

    includeRevenueInRoi: z.boolean(),
  })
  .superRefine((value, ctx) => {
    // Not fatal — the engine caps the rate — but the school should be told,
    // because it almost always means walk-ins are counted as admissions and
    // never entered as enquiries.
    if (
      value.admissions.enquiriesPerMonth > 0 &&
      value.admissions.admissionsPerMonth > value.admissions.enquiriesPerMonth
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['admissions', 'admissionsPerMonth'],
        message: 'Admissions cannot exceed enquiries — are walk-ins being counted as admissions only?',
      })
    }
  })

export type ValidatedRoiInputs = z.infer<typeof roiInputsSchema>

/** Field-path → message, for rendering errors next to their inputs. */
export function roiFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (!out[path]) out[path] = issue.message
  }
  return out
}
