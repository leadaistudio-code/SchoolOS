/**
 * Differentiating capabilities shown on the marketing site.
 *
 * Every claim here is checked against the application before it ships:
 *   Ask Me      → src/server/assistant/tools.ts + src/lib/speech-languages.ts
 *   Feedback    → FeedbackAudience / TeacherStudentFeedback in prisma/schema
 *   Health score → STUDENT_METRICS / STAFF_METRICS in src/lib/score.ts
 *
 * Do not add a language, tool or metric here that is not in those sources.
 */

import { SPEECH_LANGUAGES } from '@/lib/speech-languages'
import { STUDENT_METRICS } from '@/lib/score'

export const CAPABILITY_SECTION = {
  eyebrow: 'What sets it apart',
  title: 'Three things a school uses every week, not once at setup.',
  lead: 'Ask Me answers from live records. Feedback runs both ways. The health score is built from attendance, marks, homework and fees already in the system — not from a survey nobody fills in.',
} as const

/** Voice questions Ask Me can actually answer today. */
export const ASK_ME_PROMPTS = [
  { spoken: 'How many fee invoices are still unpaid?', tool: 'fees_outstanding' },
  { spoken: 'Which sections have not marked attendance today?', tool: 'unmarked_registers' },
  { spoken: 'Give me today’s school overview.', tool: 'school_overview' },
  { spoken: 'Find students named Sharma in Class 9.', tool: 'find_students' },
] as const

/** Human labels for the tools the model may call. Kept in sync with tools.ts. */
export const ASK_ME_TOOLS = [
  { name: 'School overview', detail: 'Students, staff, today’s attendance and fee totals' },
  { name: 'Unmarked registers', detail: 'Sections that have not marked today' },
  { name: 'Attendance report', detail: 'By class and date range' },
  { name: 'Fees outstanding', detail: 'Balances still owed, by class' },
  { name: 'Fees collected', detail: 'Payments in a date range' },
  { name: 'Fee invoices', detail: 'Find and summarise invoices' },
  { name: 'Find students', detail: 'Search by name, class or admission number' },
  { name: 'List classes', detail: 'Real class and section ids for follow-up questions' },
  { name: 'Draft a notice', detail: 'Prepares a notice for approval — never sends on its own' },
] as const

export const ASK_ME_LANGUAGES = SPEECH_LANGUAGES.map((l) => ({
  tag: l.tag,
  label: l.label,
  english: l.english,
}))

export const FEEDBACK_CAPABILITY = {
  title: 'Feedback that runs both ways',
  lead: 'Parents rate teachers, the school and PTMs through campaigns. Teachers leave structured notes on a student’s performance, participation, homework and behaviour — on the same record the report card reads.',
  flows: [
    {
      from: 'Parent',
      to: 'Teacher, school or PTM',
      how: 'Campaigns with a chosen audience and a moderated response',
    },
    {
      from: 'Teacher',
      to: 'Student',
      how: 'Structured notes on performance, participation, homework and behaviour',
    },
  ],
} as const

export const HEALTH_SCORE_CAPABILITY = {
  title: 'Health score from records you already keep',
  lead: 'One number per student, class and school. Missing data is dropped, not scored as zero — so a child with no exam yet is not marked as failing.',
  metrics: STUDENT_METRICS.filter((m) => !m.module).map((m) => ({
    label: m.label,
    description: m.description,
    source: m.source,
    weight: m.defaultWeight,
  })),
  optional: STUDENT_METRICS.filter((m) => m.module).map((m) => ({
    label: m.label,
    description: m.description,
    module: m.module!,
  })),
} as const
