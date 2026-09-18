import type { AppContext } from '@/server/context'
import { assertStudentAccess, teachingClassSubjectIds } from '@/server/scope'
import { notFound, conflict } from '@/server/api/response'
import { ROLE } from '@/lib/rbac/roles'

/** Below this % of available marks, a topic is listed as a gap (same bar as assignment analytics). */
export const TOPIC_GAP_THRESHOLD = 60
/** At or above this %, a topic is listed as a strength. */
export const TOPIC_STRENGTH_THRESHOLD = 75

export type TopicRollup = {
  id: string
  name: string
  chapterId: string
  chapter: string
  questions: number
  successRate: number | null
}

/** Pure rollup used by attempt feedback and school heatmaps. */
export function rollupTopics(
  rows: Array<{
    topicId: string
    topicName: string
    chapterId: string
    chapterName: string
    marks: number
    marksAwarded: number | null
  }>,
): TopicRollup[] {
  const map = new Map<
    string,
    {
      name: string
      chapterId: string
      chapter: string
      earned: number
      available: number
      questions: number
    }
  >()

  for (const row of rows) {
    if (row.marksAwarded == null || row.marks <= 0) continue
    const entry = map.get(row.topicId) ?? {
      name: row.topicName,
      chapterId: row.chapterId,
      chapter: row.chapterName,
      earned: 0,
      available: 0,
      questions: 0,
    }
    entry.earned += row.marksAwarded
    entry.available += row.marks
    entry.questions += 1
    map.set(row.topicId, entry)
  }

  return [...map.entries()]
    .map(([id, entry]) => ({
      id,
      name: entry.name,
      chapterId: entry.chapterId,
      chapter: entry.chapter,
      questions: entry.questions,
      successRate:
        entry.available > 0 ? Math.round((entry.earned / entry.available) * 100) : null,
    }))
    .sort((a, b) => (a.successRate ?? 100) - (b.successRate ?? 100))
}

export function splitStrengthsAndGaps(topics: TopicRollup[]) {
  const withRate = topics.filter((t) => t.successRate !== null)
  return {
    strengths: withRate.filter((t) => (t.successRate as number) >= TOPIC_STRENGTH_THRESHOLD),
    gaps: withRate.filter((t) => (t.successRate as number) < TOPIC_GAP_THRESHOLD),
    mid: withRate.filter(
      (t) =>
        (t.successRate as number) >= TOPIC_GAP_THRESHOLD &&
        (t.successRate as number) < TOPIC_STRENGTH_THRESHOLD,
    ),
  }
}

/** Deep-link into bank generate with weak chapters pre-selected and create-paper on. */
export function remedialGenerateHref(args: {
  classSubjectId: string
  chapterIds: string[]
  title: string
  count?: number
}): string {
  const params = new URLSearchParams()
  params.set('classSubjectId', args.classSubjectId)
  params.set('createPaper', '1')
  params.set('title', args.title.slice(0, 160))
  if (args.count) params.set('count', String(args.count))
  const chapters = [...new Set(args.chapterIds.filter(Boolean))]
  if (chapters.length) params.set('chapterIds', chapters.join(','))
  return `/assessments/bank/generate?${params.toString()}`
}

function isParentViewer(ctx: AppContext): boolean {
  return (
    ctx.user.roleKeys.includes(ROLE.PARENT) && !ctx.user.roleKeys.includes(ROLE.STUDENT)
  )
}

/**
 * Learning feedback for a released attempt: strengths, weak topics, AI tips.
 * Parents get a simplified flag; the question list stays on the page but UI can hide detail.
 */
export async function attemptLearningFeedback(ctx: AppContext, attemptId: string) {
  const attempt = await ctx.db.assessmentAttempt.findFirst({
    where: { id: attemptId },
    select: {
      id: true,
      studentId: true,
      totalScore: true,
      publishedAt: true,
      teacherComment: true,
      assignment: {
        select: {
          id: true,
          assessment: {
            select: {
              id: true,
              title: true,
              totalMarks: true,
              classSubjectId: true,
              classSubject: {
                select: {
                  subject: { select: { name: true } },
                  classLevel: { select: { name: true } },
                },
              },
              questions: {
                select: {
                  id: true,
                  marks: true,
                  question: {
                    select: {
                      topics: {
                        select: {
                          topic: {
                            select: {
                              id: true,
                              name: true,
                              chapter: { select: { id: true, name: true } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      answers: {
        select: {
          assessmentQuestionId: true,
          marksAwarded: true,
          teacherComment: true,
        },
      },
    },
  })
  if (!attempt) throw notFound('Result')
  await assertStudentAccess(ctx, attempt.studentId)
  if (!attempt.publishedAt) {
    throw conflict('This result has not been released yet')
  }

  const answerByQ = new Map(attempt.answers.map((a) => [a.assessmentQuestionId, a]))
  const topicRows: Parameters<typeof rollupTopics>[0] = []

  for (const question of attempt.assignment.assessment.questions) {
    const answer = answerByQ.get(question.id)
    const topics = question.question?.topics ?? []
    for (const link of topics) {
      topicRows.push({
        topicId: link.topic.id,
        topicName: link.topic.name,
        chapterId: link.topic.chapter.id,
        chapterName: link.topic.chapter.name,
        marks: question.marks,
        marksAwarded: answer?.marksAwarded ?? null,
      })
    }
  }

  const byTopic = rollupTopics(topicRows)
  const { strengths, gaps } = splitStrengthsAndGaps(byTopic)

  // Optional AI concept notes from an evaluated sheet linked to this attempt.
  const sheet = await ctx.db.answerSheet.findFirst({
    where: { attemptId: attempt.id },
    select: {
      jobs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          answers: {
            where: { reviewStatus: { in: ['APPROVED', 'OVERRIDDEN'] } },
            select: {
              feedback: true,
              teacherFeedback: true,
              rubricNotes: true,
              suggestedMarks: true,
              maxMarks: true,
            },
          },
        },
      },
    },
  })

  const conceptsCovered = new Set<string>()
  const conceptsMissing = new Set<string>()
  const tips: string[] = []

  for (const row of sheet?.jobs[0]?.answers ?? []) {
    const notes = row.rubricNotes
    if (notes && typeof notes === 'object' && !Array.isArray(notes)) {
      const covered = (notes as { conceptsCovered?: unknown }).conceptsCovered
      const missing = (notes as { conceptsMissing?: unknown }).conceptsMissing
      if (Array.isArray(covered)) {
        for (const c of covered) if (typeof c === 'string' && c.trim()) conceptsCovered.add(c.trim())
      }
      if (Array.isArray(missing)) {
        for (const c of missing) if (typeof c === 'string' && c.trim()) conceptsMissing.add(c.trim())
      }
    }
    const tip = (row.teacherFeedback || row.feedback || '').trim()
    if (tip && tips.length < 5) tips.push(tip)
  }

  const percent =
    attempt.totalScore != null && attempt.assignment.assessment.totalMarks > 0
      ? Math.round((attempt.totalScore / attempt.assignment.assessment.totalMarks) * 100)
      : null

  const parentView = isParentViewer(ctx)

  return {
    attemptId: attempt.id,
    title: attempt.assignment.assessment.title,
    subject: attempt.assignment.assessment.classSubject.subject.name,
    className: attempt.assignment.assessment.classSubject.classLevel.name,
    totalMarks: attempt.assignment.assessment.totalMarks,
    score: attempt.totalScore,
    percent,
    teacherComment: attempt.teacherComment,
    parentView,
    summary: parentView
      ? parentSummaryCopy({ percent, strengths, gaps, subject: attempt.assignment.assessment.classSubject.subject.name })
      : studentSummaryCopy({ percent, strengths, gaps }),
    strengths: strengths.map((t) => ({
      id: t.id,
      name: t.name,
      chapter: t.chapter,
      successRate: t.successRate,
    })),
    weakTopics: gaps.map((t) => ({
      id: t.id,
      name: t.name,
      chapter: t.chapter,
      chapterId: t.chapterId,
      successRate: t.successRate,
    })),
    byTopic,
    conceptsCovered: [...conceptsCovered].slice(0, 12),
    conceptsMissing: [...conceptsMissing].slice(0, 12),
    practiceTips: tips,
    practiceNote: parentView
      ? gaps.length > 0
        ? 'Ask the class teacher about short practice on the topics below — this is guidance from one paper, not a report-card grade.'
        : 'No weak topics stood out on this paper.'
      : gaps.length > 0
        ? 'Review the expected answers for questions on these topics, then ask your teacher for extra practice if you want more questions.'
        : 'No weak topics stood out — keep practising regularly.',
  }
}

function studentSummaryCopy(args: {
  percent: number | null
  strengths: TopicRollup[]
  gaps: TopicRollup[]
}): string {
  if (args.percent == null) return 'Your marks are in. Topic tips appear when questions are tagged to the syllabus.'
  const scoreBit = `You scored ${args.percent}%.`
  if (args.gaps.length === 0 && args.strengths.length === 0) {
    return `${scoreBit} Topic strengths and gaps show when paper questions are linked to syllabus topics.`
  }
  if (args.gaps.length === 0) {
    return `${scoreBit} Strong areas: ${args.strengths
      .slice(0, 3)
      .map((t) => t.name)
      .join(', ')}.`
  }
  return `${scoreBit} Worth another look: ${args.gaps
    .slice(0, 3)
    .map((t) => t.name)
    .join(', ')}.`
}

function parentSummaryCopy(args: {
  percent: number | null
  strengths: TopicRollup[]
  gaps: TopicRollup[]
  subject: string
}): string {
  if (args.percent == null) {
    return `The ${args.subject} paper has been marked. Open the details below if you want question-by-question marks.`
  }
  const scoreBit = `Score on this ${args.subject} paper: ${args.percent}%.`
  if (args.gaps.length === 0) {
    return `${scoreBit} No major topic gaps showed up on this single paper.`
  }
  return `${scoreBit} Topics that scored lower: ${args.gaps
    .slice(0, 3)
    .map((t) => t.name)
    .join(', ')}. This is from one assessment, not a full-term report.`
}

/**
 * Teacher / principal Learning Insights: subject → chapter → topic heat from recent marked papers.
 */
export async function learningInsightsOverview(ctx: AppContext) {
  ctx.require('assessments.view')

  const teachingIds = await teachingClassSubjectIds(ctx)
  const classSubjectFilter =
    teachingIds === null ? {} : { classSubjectId: { in: teachingIds } }

  const since = new Date()
  since.setDate(since.getDate() - 90)

  const assignments = await ctx.db.assessmentAssignment.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: since },
      assessment: { deletedAt: null, ...classSubjectFilter },
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: {
      id: true,
      assessment: {
        select: {
          id: true,
          title: true,
          totalMarks: true,
          classSubjectId: true,
          classSubject: {
            select: {
              subject: { select: { id: true, name: true } },
              classLevel: { select: { name: true } },
            },
          },
          questions: {
            select: {
              id: true,
              marks: true,
              question: {
                select: {
                  topics: {
                    select: {
                      topic: {
                        select: {
                          id: true,
                          name: true,
                          chapter: { select: { id: true, name: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      attempts: {
        where: { status: 'EVALUATED', publishedAt: { not: null } },
        select: {
          id: true,
          studentId: true,
          totalScore: true,
          answers: {
            select: {
              assessmentQuestionId: true,
              marksAwarded: true,
            },
          },
        },
      },
    },
  })

  const topicRows: Parameters<typeof rollupTopics>[0] = []
  const subjectBuckets = new Map<
    string,
    { subjectId: string; subjectName: string; className: string; papers: number; markedAttempts: number }
  >()
  const attention = new Map<
    string,
    { studentId: string; papers: number; lowPapers: number; lastTitle: string; lastPercent: number }
  >()

  const paperSummaries: Array<{
    assignmentId: string
    assessmentId: string
    title: string
    subject: string
    className: string
    classSubjectId: string
    marked: number
    gaps: Array<{ id: string; name: string; chapter: string; chapterId: string; successRate: number | null }>
    remedialHref: string | null
  }> = []

  for (const assignment of assignments) {
    const assessment = assignment.assessment
    const subjectKey = `${assessment.classSubject.subject.id}:${assessment.classSubject.classLevel.name}`
    const bucket = subjectBuckets.get(subjectKey) ?? {
      subjectId: assessment.classSubject.subject.id,
      subjectName: assessment.classSubject.subject.name,
      className: assessment.classSubject.classLevel.name,
      papers: 0,
      markedAttempts: 0,
    }
    bucket.papers += 1
    bucket.markedAttempts += assignment.attempts.length
    subjectBuckets.set(subjectKey, bucket)

    const answerFlat = assignment.attempts.flatMap((attempt) =>
      attempt.answers.map((answer) => ({
        attempt,
        answer,
      })),
    )

    const perPaperRows: Parameters<typeof rollupTopics>[0] = []

    for (const question of assessment.questions) {
      const topics = question.question?.topics ?? []
      if (topics.length === 0) continue
      const scored = answerFlat.filter((row) => row.answer.assessmentQuestionId === question.id)
      for (const { attempt, answer } of scored) {
        void attempt
        for (const link of topics) {
          const row = {
            topicId: link.topic.id,
            topicName: link.topic.name,
            chapterId: link.topic.chapter.id,
            chapterName: link.topic.chapter.name,
            marks: question.marks,
            marksAwarded: answer.marksAwarded,
          }
          topicRows.push(row)
          perPaperRows.push(row)
        }
      }
    }

    for (const attempt of assignment.attempts) {
      const total = assessment.totalMarks || 1
      const percent =
        attempt.totalScore != null ? Math.round((attempt.totalScore / total) * 100) : null
      if (percent == null) continue
      const entry = attention.get(attempt.studentId) ?? {
        studentId: attempt.studentId,
        papers: 0,
        lowPapers: 0,
        lastTitle: assessment.title,
        lastPercent: percent,
      }
      entry.papers += 1
      if (percent < 40) entry.lowPapers += 1
      entry.lastTitle = assessment.title
      entry.lastPercent = percent
      attention.set(attempt.studentId, entry)
    }

    const paperTopics = rollupTopics(perPaperRows)
    const { gaps } = splitStrengthsAndGaps(paperTopics)
    const chapterIds = [...new Set(gaps.map((g) => g.chapterId).filter(Boolean))]
    paperSummaries.push({
      assignmentId: assignment.id,
      assessmentId: assessment.id,
      title: assessment.title,
      subject: assessment.classSubject.subject.name,
      className: assessment.classSubject.classLevel.name,
      classSubjectId: assessment.classSubjectId,
      marked: assignment.attempts.length,
      gaps: gaps.map((g) => ({
        id: g.id,
        name: g.name,
        chapter: g.chapter,
        chapterId: g.chapterId,
        successRate: g.successRate,
      })),
      remedialHref:
        gaps.length > 0 && chapterIds.length > 0
          ? remedialGenerateHref({
              classSubjectId: assessment.classSubjectId,
              chapterIds,
              title: `Remedial · ${assessment.classSubject.subject.name} · ${gaps
                .slice(0, 2)
                .map((g) => g.name)
                .join(', ')}`,
              count: Math.min(12, Math.max(6, gaps.length * 2)),
            })
          : null,
    })
  }

  const heatmap = rollupTopics(topicRows)
  const { gaps: schoolGaps, strengths: schoolStrengths } = splitStrengthsAndGaps(heatmap)

  // Chapter rollup for the heatmap UI
  const chapterMap = new Map<
    string,
    { chapterId: string; chapter: string; topics: TopicRollup[]; avgRate: number | null }
  >()
  for (const topic of heatmap) {
    const key = topic.chapterId || topic.chapter
    const entry = chapterMap.get(key) ?? {
      chapterId: topic.chapterId,
      chapter: topic.chapter,
      topics: [],
      avgRate: null,
    }
    entry.topics.push(topic)
    chapterMap.set(key, entry)
  }
  const byChapter = [...chapterMap.values()]
    .map((entry) => {
      const rates = entry.topics
        .map((t) => t.successRate)
        .filter((r): r is number => r !== null)
      return {
        ...entry,
        avgRate:
          rates.length > 0
            ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
            : null,
      }
    })
    .sort((a, b) => (a.avgRate ?? 100) - (b.avgRate ?? 100))

  const attentionList = [...attention.values()]
    .filter((row) => row.lowPapers >= 1 && row.papers >= 1)
    .sort((a, b) => b.lowPapers - a.lowPapers || a.lastPercent - b.lastPercent)
    .slice(0, 15)

  let attentionNamed: Array<{
    studentId: string
    name: string
    admissionNo: string | null
    lowPapers: number
    papers: number
    lastTitle: string
    lastPercent: number
  }> = []

  if (attentionList.length > 0) {
    const students = await ctx.db.student.findMany({
      where: { id: { in: attentionList.map((r) => r.studentId) }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, admissionNo: true },
    })
    const byId = new Map(students.map((s) => [s.id, s]))
    attentionNamed = attentionList
      .map((row) => {
        const student = byId.get(row.studentId)
        if (!student) return null
        return {
          studentId: row.studentId,
          name: `${student.firstName} ${student.lastName}`.trim(),
          admissionNo: student.admissionNo,
          lowPapers: row.lowPapers,
          papers: row.papers,
          lastTitle: row.lastTitle,
          lastPercent: row.lastPercent,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
  }

  return {
    windowDays: 90,
    subjects: [...subjectBuckets.values()].sort((a, b) =>
      a.subjectName.localeCompare(b.subjectName),
    ),
    byChapter,
    heatmap,
    schoolGaps: schoolGaps.slice(0, 20),
    schoolStrengths: schoolStrengths.slice(0, 10),
    papersWithGaps: paperSummaries.filter((p) => p.gaps.length > 0).slice(0, 12),
    needsAttention: attentionNamed,
    note: 'Figures come from published, marked assignments in the last 90 days. A low topic score on one paper is an observation, not a diagnosis.',
  }
}
