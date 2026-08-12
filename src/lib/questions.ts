/**
 * Question vocabulary.
 *
 * Pure data with no imports, in `lib` rather than `server` for the same reason
 * the feature keys are: the bank filters and the paper builder run in the
 * browser and need these labels. Importing them from the service would pull the
 * service — and through it Prisma and the server environment — into the client
 * bundle, where it fails at hydration.
 */

export const QUESTION_TYPES = [
  'MCQ',
  'TRUE_FALSE',
  'FILL_BLANK',
  'MATCH',
  'ONE_WORD',
  'VERY_SHORT',
  'SHORT',
  'LONG',
  'DESCRIPTIVE',
  'CASE_STUDY',
  'ASSERTION_REASON',
  'NUMERICAL',
  'DIAGRAM',
  'COMPREHENSION',
  'PRACTICAL',
  'HOTS',
] as const

export type QuestionTypeKey = (typeof QUESTION_TYPES)[number]

export const QUESTION_TYPE_LABEL: Record<QuestionTypeKey, string> = {
  MCQ: 'Multiple choice',
  TRUE_FALSE: 'True or false',
  FILL_BLANK: 'Fill in the blank',
  MATCH: 'Match the following',
  ONE_WORD: 'One word answer',
  VERY_SHORT: 'Very short answer',
  SHORT: 'Short answer',
  LONG: 'Long answer',
  DESCRIPTIVE: 'Descriptive',
  CASE_STUDY: 'Case study',
  ASSERTION_REASON: 'Assertion and reason',
  NUMERICAL: 'Numerical',
  DIAGRAM: 'Diagram based',
  COMPREHENSION: 'Comprehension',
  PRACTICAL: 'Practical',
  HOTS: 'Higher order thinking',
}

/** Types marked by matching an answer rather than by reading one. */
export const OBJECTIVE_TYPES: QuestionTypeKey[] = [
  'MCQ',
  'TRUE_FALSE',
  'ASSERTION_REASON',
  'MATCH',
]

/** Types whose answers are a list the teacher builds, not free text. */
export const OPTION_TYPES: QuestionTypeKey[] = ['MCQ', 'TRUE_FALSE', 'ASSERTION_REASON', 'MATCH']

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const
export type DifficultyKey = (typeof DIFFICULTIES)[number]

export const BLOOM_LEVELS = [
  'REMEMBER',
  'UNDERSTAND',
  'APPLY',
  'ANALYZE',
  'EVALUATE',
  'CREATE',
] as const
export type BloomKey = (typeof BLOOM_LEVELS)[number]

export const BLOOM_LABEL: Record<BloomKey, string> = {
  REMEMBER: 'Remember',
  UNDERSTAND: 'Understand',
  APPLY: 'Apply',
  ANALYZE: 'Analyze',
  EVALUATE: 'Evaluate',
  CREATE: 'Create',
}
