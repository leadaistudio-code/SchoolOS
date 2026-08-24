import type { ProficiencyLevel } from '@prisma/client'

/**
 * The scoring and readiness core.
 *
 * Everything here is a pure function of its arguments — no context, no
 * database, no clock. That is deliberate: grading and the language shown back
 * to a teacher are the two things most worth testing in isolation, and the two
 * things it would be most damaging to get subtly wrong. The service layer feeds
 * these functions rows it has already read and persists what they return.
 *
 * A note on language. This module never speaks of passing or failing a teacher.
 * A refresher is professional development, so a low score is "additional review
 * suggested", never "FAIL". The `passed` flag exists only to drive retake and
 * completion logic, and is never surfaced as a verdict on the person.
 */

export type ReadinessLevel = 'READY' | 'GOOD' | 'REFRESH_RECOMMENDED' | 'ADDITIONAL_REVIEW'

/** A semantic tone the UI maps to a badge variant; kept free of design tokens. */
export type ReadinessTone = 'success' | 'info' | 'warning' | 'neutral'

export type ReadinessBand = {
  level: ReadinessLevel
  label: string
  tone: ReadinessTone
  /** Drives retake/completion logic only — never shown as a pass/fail verdict. */
  passed: boolean
  headline: string
}

/**
 * Maps a percentage to the four positive readiness bands. `passed` is true at
 * or above the school's configured threshold; the top band sits above it and
 * the two lower bands below, so the wording always matches the number.
 */
export function readinessFromPercent(percent: number, passingThreshold: number): ReadinessBand {
  const pct = clampPercent(percent)
  const passed = pct >= passingThreshold

  if (pct >= 85) {
    return {
      level: 'READY',
      label: 'Ready to teach',
      tone: 'success',
      passed,
      headline: 'You are on top of this material.',
    }
  }
  if (passed) {
    return {
      level: 'GOOD',
      label: 'Good',
      tone: 'info',
      passed,
      headline: 'Solid — a light brush-up on a couple of points and you are set.',
    }
  }
  if (pct >= 50) {
    return {
      level: 'REFRESH_RECOMMENDED',
      label: 'Refresh recommended',
      tone: 'warning',
      passed,
      headline: 'Worth a short refresh before your next lesson on this.',
    }
  }
  return {
    level: 'ADDITIONAL_REVIEW',
    label: 'Additional review suggested',
    tone: 'neutral',
    passed,
    headline: 'A fuller review of this material is suggested — support is available.',
  }
}

/** Topic-level proficiency for the teacher's knowledge profile. */
export function proficiencyFromPercent(percent: number): ProficiencyLevel {
  const pct = clampPercent(percent)
  if (pct >= 85) return 'STRONG'
  if (pct >= 70) return 'GOOD'
  if (pct >= 50) return 'REFRESH_RECOMMENDED'
  return 'DEVELOPING'
}

export type GradeOption = { isCorrect: boolean }

export type GradeQuestion = {
  refreshQuestionId: string
  marks: number
  /** Options in the exact order the teacher saw them; indexes map to these. */
  options: GradeOption[]
  /** Topics this question is tagged with, for the per-topic breakdown. */
  topicIds: string[]
}

export type SubmittedAnswer = {
  refreshQuestionId: string
  selectedIndexes: number[]
}

export type GradedQuestion = {
  refreshQuestionId: string
  isCorrect: boolean
  marksAwarded: number
  marks: number
  topicIds: string[]
}

export type GradeResult = {
  score: number
  maxScore: number
  percent: number
  correctCount: number
  perQuestion: GradedQuestion[]
}

/**
 * Grades objective (option-based) questions. A question is correct only when
 * the chosen set is exactly the correct set — the same rule the student
 * assessment engine uses in `scoreObjective`, re-implemented here so the
 * scoring core stays free of any server import and remains trivially testable.
 */
export function gradeAnswers(questions: GradeQuestion[], answers: SubmittedAnswer[]): GradeResult {
  const byId = new Map(answers.map((a) => [a.refreshQuestionId, a.selectedIndexes ?? []]))

  let score = 0
  let maxScore = 0
  let correctCount = 0
  const perQuestion: GradedQuestion[] = []

  for (const q of questions) {
    const marks = q.marks > 0 ? q.marks : 1
    maxScore += marks

    const selected = new Set((byId.get(q.refreshQuestionId) ?? []).map(Number))
    const correct = new Set(
      q.options.map((opt, index) => (opt.isCorrect ? index : -1)).filter((index) => index >= 0),
    )

    const isCorrect =
      correct.size > 0 &&
      selected.size === correct.size &&
      [...correct].every((index) => selected.has(index))

    if (isCorrect) {
      score += marks
      correctCount += 1
    }

    perQuestion.push({
      refreshQuestionId: q.refreshQuestionId,
      isCorrect,
      marksAwarded: isCorrect ? marks : 0,
      marks,
      topicIds: q.topicIds,
    })
  }

  return {
    score,
    maxScore,
    percent: maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0,
    correctCount,
    perQuestion,
  }
}

export type TopicScore = {
  topicId: string
  correct: number
  total: number
  percent: number
}

/**
 * Rolls graded questions up per topic. A question tagged with several topics
 * counts toward each of them, so a weak topic is not hidden by a strong one it
 * happened to share a question with.
 */
export function computeTopicBreakdown(perQuestion: GradedQuestion[]): TopicScore[] {
  const tally = new Map<string, { correct: number; total: number }>()

  for (const q of perQuestion) {
    for (const topicId of q.topicIds) {
      const row = tally.get(topicId) ?? { correct: 0, total: 0 }
      row.total += 1
      if (q.isCorrect) row.correct += 1
      tally.set(topicId, row)
    }
  }

  return [...tally.entries()].map(([topicId, { correct, total }]) => ({
    topicId,
    correct,
    total,
    percent: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
  }))
}

export type HistoryPoint = {
  at: string
  percent: number
  proficiency: ProficiencyLevel
}

/**
 * Appends a trend point to a teacher's per-topic history, tolerating whatever
 * shape the stored JSON is in and capping the series so it cannot grow without
 * bound. Most recent last.
 */
export function mergeHistory(previous: unknown, entry: HistoryPoint, cap = 12): HistoryPoint[] {
  const prior = Array.isArray(previous)
    ? (previous.filter(
        (p) =>
          p &&
          typeof p === 'object' &&
          typeof (p as HistoryPoint).at === 'string' &&
          typeof (p as HistoryPoint).percent === 'number',
      ) as HistoryPoint[])
    : []

  return [...prior, entry].slice(-cap)
}

function clampPercent(percent: number): number {
  if (Number.isNaN(percent)) return 0
  if (percent < 0) return 0
  if (percent > 100) return 100
  return percent
}
