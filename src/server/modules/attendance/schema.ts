import { z } from 'zod'

export const ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'HALF_DAY',
  'LEAVE',
  'HOLIDAY',
] as const

export const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES)
export type AttendanceStatusValue = z.infer<typeof attendanceStatusSchema>

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')

/**
 * One bulk save for a whole section on one date.
 *
 * The whole roll is submitted together and written in a single transaction: a
 * half-marked register is worse than an unmarked one, because it reads as
 * though the missing students were simply not absent.
 */
export const markAttendanceSchema = z.object({
  sectionId: z.string().min(1, 'Select a section'),
  onDate: isoDate,
  entries: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: attendanceStatusSchema,
        minutesLate: z.coerce.number().int().min(0).max(600).optional(),
        remarks: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, 'Nothing to save')
    .max(200, 'Too many students in one request'),
})

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>

export const attendanceRegisterQuerySchema = z.object({
  sectionId: z.string().optional(),
  onDate: isoDate.optional(),
})

export const attendanceReportQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  classLevelId: z.string().optional(),
  sectionId: z.string().optional(),
  studentId: z.string().optional(),
})

export type AttendanceReportQuery = z.infer<typeof attendanceReportQuerySchema>

export const STATUS_LABEL: Record<AttendanceStatusValue, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LATE: 'Late',
  HALF_DAY: 'Half day',
  LEAVE: 'Leave',
  HOLIDAY: 'Holiday',
}

/** Statuses a teacher may pick in the register; HOLIDAY is set school-wide. */
export const MARKABLE_STATUSES: AttendanceStatusValue[] = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'HALF_DAY',
  'LEAVE',
]
