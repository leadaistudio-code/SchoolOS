import type { BadgeTone } from '@/components/ui/badge'

export type RegisterOption = { value: string; label: string; tone: BadgeTone }

export const CLASS_TEST_STATUSES = ['COMPLETED', 'ABSENT', 'NOT_APPLICABLE'] as const
export type ClassTestStatusValue = (typeof CLASS_TEST_STATUSES)[number]

export const CLASS_TEST_OPTIONS: RegisterOption[] = [
  { value: 'COMPLETED', label: 'Completed', tone: 'success' },
  { value: 'ABSENT', label: 'Absent', tone: 'danger' },
  { value: 'NOT_APPLICABLE', label: 'Not applicable', tone: 'neutral' },
]

/** Marks only make sense for a student who sat the test. */
export const CLASS_TEST_MARKABLE: readonly string[] = ['COMPLETED']

export const HOMEWORK_MARKS = [
  'COMPLETED',
  'PARTIAL',
  'NOT_COMPLETED',
  'ABSENT',
  'NOT_APPLICABLE',
  'NO_NOTEBOOK',
  'LATE_WORK',
] as const
export type HomeworkMarkValue = (typeof HOMEWORK_MARKS)[number]

export const HOMEWORK_OPTIONS: RegisterOption[] = [
  { value: 'COMPLETED', label: 'Completed', tone: 'success' },
  { value: 'PARTIAL', label: 'Partially completed', tone: 'warning' },
  { value: 'NOT_COMPLETED', label: 'Not completed', tone: 'danger' },
  { value: 'ABSENT', label: 'Absent', tone: 'danger' },
  { value: 'NOT_APPLICABLE', label: 'Not applicable', tone: 'neutral' },
  { value: 'NO_NOTEBOOK', label: 'Did not bring notebook', tone: 'warning' },
  { value: 'LATE_WORK', label: 'Late work', tone: 'info' },
]

/** Marks that count as the homework having been done (stored as REVIEWED). */
export const HOMEWORK_DONE_MARKS: readonly HomeworkMarkValue[] = ['COMPLETED', 'PARTIAL', 'LATE_WORK']

export function passFail(marks: number | null | undefined, passingMarks: number | null | undefined): 'PASS' | 'FAIL' | null {
  if (marks == null || passingMarks == null) return null
  return marks >= passingMarks ? 'PASS' : 'FAIL'
}
