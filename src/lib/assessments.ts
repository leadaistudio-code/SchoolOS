/**
 * Assessment vocabulary.
 *
 * Pure data, in `lib` for the same reason the question vocabulary is: the
 * builder runs in the browser and needs these labels, and importing them from
 * the service would pull Prisma into the client bundle.
 */

/**
 * The test types every school starts with.
 *
 * Seeded per tenant on first read rather than by a migration, and marked
 * `isSystem` so a school can rename or deactivate one but not leave itself with
 * an empty list. Marks and minutes are suggestions that prefill the form — a
 * unit test is usually 40 marks in an hour, and a teacher who disagrees just
 * types over it.
 */
export const DEFAULT_ASSESSMENT_TYPES: {
  key: string
  name: string
  marks?: number
  minutes?: number
}[] = [
  { key: 'DAILY', name: 'Daily test', marks: 10, minutes: 15 },
  { key: 'PRACTICE', name: 'Practice test', marks: 20, minutes: 30 },
  { key: 'WEEKLY', name: 'Weekly test', marks: 20, minutes: 30 },
  { key: 'FORTNIGHTLY', name: 'Fortnightly test', marks: 25, minutes: 45 },
  { key: 'MONTHLY', name: 'Monthly test', marks: 40, minutes: 60 },
  { key: 'UNIT_TEST', name: 'Unit test', marks: 40, minutes: 60 },
  { key: 'CHAPTER_TEST', name: 'Chapter test', marks: 25, minutes: 45 },
  { key: 'MID_TERM', name: 'Mid-term examination', marks: 80, minutes: 180 },
  { key: 'QUARTERLY', name: 'Quarterly examination', marks: 80, minutes: 180 },
  { key: 'HALF_YEARLY', name: 'Half-yearly examination', marks: 80, minutes: 180 },
  { key: 'PRE_BOARD', name: 'Pre-board', marks: 80, minutes: 180 },
  { key: 'FINAL', name: 'Final examination', marks: 80, minutes: 180 },
  { key: 'MOCK', name: 'Mock test', marks: 80, minutes: 180 },
  { key: 'CUSTOM', name: 'Custom assessment' },
]

export const ASSESSMENT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved',
  ASSIGNED: 'Assigned',
  CLOSED: 'Closed',
}

export const ASSESSMENT_STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'warning',
  APPROVED: 'success',
  ASSIGNED: 'info',
  CLOSED: 'neutral',
}
