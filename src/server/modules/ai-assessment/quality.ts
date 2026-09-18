import type { AppContext } from '@/server/context'
import { notFound } from '@/server/api/response'
import { assertClassSubjectAccess } from '@/server/scope'
import { OBJECTIVE_TYPES } from '@/lib/questions'

export type QualityIndicator = {
  key: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
  score?: number
}

const OBJECTIVE = new Set(OBJECTIVE_TYPES)

/**
 * Deterministic paper quality indicators — not AI guarantees.
 * Run before teacher review; surface as a panel, never as certainty.
 */
export async function runPaperQualityCheck(ctx: AppContext, assessmentId: string) {
  const paper = await ctx.db.assessment.findFirst({
    where: { id: assessmentId, deletedAt: null },
    select: {
      id: true,
      title: true,
      totalMarks: true,
      classSubjectId: true,
      questions: {
        select: {
          id: true,
          questionId: true,
          marks: true,
          textSnapshot: true,
          answerSnapshot: true,
          optionsSnapshot: true,
          typeSnapshot: true,
          difficultySnapshot: true,
          position: true,
        },
        orderBy: { position: 'asc' },
      },
    },
  })
  if (!paper) throw notFound('Assessment')
  await assertClassSubjectAccess(ctx, paper.classSubjectId)

  const indicators: QualityIndicator[] = []
  const questions = paper.questions
  const marksSum = questions.reduce((sum, q) => sum + q.marks, 0)
  const marksDelta = Math.abs(marksSum - paper.totalMarks)

  indicators.push({
    key: 'marks',
    label: 'Marks distribution',
    status: marksDelta < 0.01 ? 'pass' : marksDelta <= 1 ? 'warn' : 'fail',
    detail:
      marksDelta < 0.01
        ? `Questions sum to ${marksSum} (matches total).`
        : `Questions sum to ${marksSum}; paper total is ${paper.totalMarks}.`,
    score: paper.totalMarks === 0 ? 0 : Math.max(0, 100 - (marksDelta / paper.totalMarks) * 100),
  })

  const texts = questions.map((q) => q.textSnapshot.trim().toLowerCase())
  const dupes = texts.filter((t, i) => t && texts.indexOf(t) !== i)
  indicators.push({
    key: 'duplicates',
    label: 'Question duplication',
    status: dupes.length === 0 ? 'pass' : 'warn',
    detail:
      dupes.length === 0
        ? 'None detected in this paper.'
        : `${dupes.length} near-duplicate stem(s) in this paper.`,
  })

  const missingAnswers = questions.filter((q) => {
    if (!OBJECTIVE.has(q.typeSnapshot)) return !q.answerSnapshot?.trim()
    const opts = Array.isArray(q.optionsSnapshot)
      ? (q.optionsSnapshot as { isCorrect?: boolean }[])
      : []
    return !opts.some((o) => o.isCorrect) && !q.answerSnapshot?.trim()
  })
  indicators.push({
    key: 'answer_key',
    label: 'Answer key',
    status: missingAnswers.length === 0 ? 'pass' : 'warn',
    detail:
      missingAnswers.length === 0
        ? 'Verified for placed questions.'
        : `${missingAnswers.length} question(s) missing a clear key.`,
  })

  const empty = questions.filter((q) => !q.textSnapshot.trim())
  indicators.push({
    key: 'stems',
    label: 'Question stems',
    status: empty.length === 0 ? 'pass' : 'fail',
    detail: empty.length === 0 ? 'All questions have text.' : `${empty.length} empty stem(s).`,
  })

  const difficulties = questions.map((q) => q.difficultySnapshot)
  const hard = difficulties.filter((d) => d === 'HARD').length
  const easy = difficulties.filter((d) => d === 'EASY').length
  const medium = difficulties.filter((d) => d === 'MEDIUM').length
  const balance =
    questions.length === 0
      ? 'No questions yet.'
      : `${easy} easy · ${medium} medium · ${hard} hard`
  const mixSkew =
    questions.length >= 3 &&
    (easy === questions.length || medium === questions.length || hard === questions.length)
  indicators.push({
    key: 'difficulty',
    label: 'Difficulty balance',
    status: questions.length === 0 ? 'warn' : mixSkew ? 'warn' : 'pass',
    detail: mixSkew ? `${balance} — all one difficulty; consider a mix.` : balance,
  })

  // Topic / chapter spread via bank links (when available)
  const linkedIds = questions.map((q) => q.questionId).filter(Boolean) as string[]
  let chapterDetail = 'Link questions to the bank to estimate chapter spread.'
  let chapterStatus: QualityIndicator['status'] = 'warn'
  if (linkedIds.length > 0) {
    const topicRows = await ctx.db.questionTopic.findMany({
      where: { questionId: { in: linkedIds } },
      select: {
        questionId: true,
        topic: { select: { chapter: { select: { name: true } } } },
      },
    })
    const byChapter = new Map<string, number>()
    for (const row of topicRows) {
      const name = row.topic.chapter.name
      byChapter.set(name, (byChapter.get(name) ?? 0) + 1)
    }
    if (byChapter.size === 0) {
      chapterDetail = 'Bank questions are not tagged to chapters yet.'
    } else {
      chapterDetail = [...byChapter.entries()]
        .map(([name, n]) => `${name}: ${n}`)
        .join(' · ')
      chapterStatus = byChapter.size === 1 && questions.length >= 5 ? 'warn' : 'pass'
    }
  }
  indicators.push({
    key: 'chapters',
    label: 'Chapter distribution',
    status: questions.length === 0 ? 'warn' : chapterStatus,
    detail: chapterDetail,
  })

  const numberingOk = questions.every((q, i) => q.position === i || q.position === i + 1)
  indicators.push({
    key: 'numbering',
    label: 'Question numbering',
    status: numberingOk ? 'pass' : 'warn',
    detail: numberingOk ? 'Positions look sequential.' : 'Positions may need reordering.',
  })

  const bankLinked = questions.filter((q) => q.questionId).length
  const coverage = questions.length === 0 ? 0 : Math.round((bankLinked / questions.length) * 100)
  indicators.push({
    key: 'syllabus',
    label: 'Bank / syllabus link',
    status: questions.length === 0 ? 'warn' : coverage >= 70 ? 'pass' : 'warn',
    detail:
      questions.length === 0
        ? 'Add questions to estimate coverage.'
        : `${coverage}% linked to question bank (topic mapping via bank).`,
    score: coverage,
  })

  const failed = indicators.filter((i) => i.status === 'fail').length
  const warned = indicators.filter((i) => i.status === 'warn').length
  const overall: QualityIndicator['status'] =
    failed > 0 ? 'fail' : warned > 0 ? 'warn' : questions.length === 0 ? 'warn' : 'pass'

  return {
    assessmentId: paper.id,
    title: paper.title,
    questionCount: questions.length,
    overall,
    overallLabel:
      overall === 'pass'
        ? 'Quality check passed'
        : overall === 'warn'
          ? 'Review recommended'
          : 'Issues found',
    indicators,
    disclaimer: 'These are automated indicators, not guarantees of pedagogical quality.',
  }
}
