import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { assertClassSubjectAccess } from '@/server/scope'
import { notify } from '@/server/notifications'
import { OBJECTIVE_TYPES } from '@/lib/questions'

/**
 * Marking, releasing and reading the results.
 *
 * The line this file holds is between a score existing and a student being
 * allowed to see it. Objective marks are computed the moment a paper is
 * submitted; the written answers may sit unmarked for a week. A portal that
 * showed the first number as "your result" would be telling a child they scored
 * 12 out of 40 on a paper where 28 marks have not been looked at yet.
 */

export const markSchema = z.object({
  marksAwarded: z.coerce.number().min(0).max(100),
  teacherComment: z.string().trim().max(2000).nullish(),
})

export const finaliseSchema = z.object({
  teacherComment: z.string().trim().max(4000).nullish(),
})

function actor(ctx: AppContext) {
  return {
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    module: 'assessments',
  }
}

type PlacedOption = { text: string; isCorrect?: boolean; matchWith?: string | null }
function asOptions(value: unknown): PlacedOption[] {
  return Array.isArray(value) ? (value as PlacedOption[]) : []
}

/**
 * One attempt, as the marker sees it: the answer beside the marking scheme.
 *
 * This is the reader that *does* select the answer columns, and it is reachable
 * only with `assessments.evaluate` on a subject the caller teaches.
 */
export async function attemptForMarking(ctx: AppContext, attemptId: string) {
  const attempt = await ctx.db.assessmentAttempt.findFirst({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      autoSubmitted: true,
      objectiveScore: true,
      totalScore: true,
      publishedAt: true,
      teacherComment: true,
      student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
      assignment: {
        select: {
          id: true,
          assessment: {
            select: {
              id: true,
              title: true,
              totalMarks: true,
              classSubjectId: true,
              sections: {
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  title: true,
                  questions: {
                    orderBy: { position: 'asc' },
                    select: {
                      id: true,
                      marks: true,
                      textSnapshot: true,
                      optionsSnapshot: true,
                      answerSnapshot: true,
                      typeSnapshot: true,
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
          id: true,
          assessmentQuestionId: true,
          responseText: true,
          selectedIndexes: true,
          isCorrect: true,
          marksAwarded: true,
          teacherComment: true,
        },
      },
    },
  })
  if (!attempt) throw notFound('Attempt')
  await assertClassSubjectAccess(ctx, attempt.assignment.assessment.classSubjectId)

  const answers = new Map(attempt.answers.map((answer) => [answer.assessmentQuestionId, answer]))

  const sections = attempt.assignment.assessment.sections.map((section) => ({
    id: section.id,
    title: section.title,
    questions: section.questions.map((question) => {
      const answer = answers.get(question.id) ?? null
      const options = asOptions(question.optionsSnapshot)
      const chosen = Array.isArray(answer?.selectedIndexes)
        ? (answer.selectedIndexes as number[])
        : []

      return {
        placementId: question.id,
        answerId: answer?.id ?? null,
        marks: question.marks,
        text: question.textSnapshot,
        type: question.typeSnapshot,
        objective: OBJECTIVE_TYPES.includes(question.typeSnapshot as never),
        expectedAnswer: question.answerSnapshot,
        options: options.map((option, index) => ({
          text: option.text,
          isCorrect: Boolean(option.isCorrect),
          chosen: chosen.includes(index),
        })),
        responseText: answer?.responseText ?? null,
        isCorrect: answer?.isCorrect ?? null,
        marksAwarded: answer?.marksAwarded ?? null,
        teacherComment: answer?.teacherComment ?? null,
      }
    }),
  }))

  const outstanding = sections
    .flatMap((section) => section.questions)
    .filter((question) => !question.objective && question.marksAwarded === null).length

  return {
    id: attempt.id,
    status: attempt.status,
    submittedAt: attempt.submittedAt,
    autoSubmitted: attempt.autoSubmitted,
    objectiveScore: attempt.objectiveScore,
    totalScore: attempt.totalScore,
    published: Boolean(attempt.publishedAt),
    teacherComment: attempt.teacherComment,
    student: attempt.student,
    assignmentId: attempt.assignment.id,
    assessment: {
      id: attempt.assignment.assessment.id,
      title: attempt.assignment.assessment.title,
      totalMarks: attempt.assignment.assessment.totalMarks,
    },
    sections,
    outstanding,
  }
}

async function answerGuard(ctx: AppContext, answerId: string) {
  const answer = await ctx.db.studentAnswer.findFirst({
    where: { id: answerId },
    select: {
      id: true,
      attemptId: true,
      assessmentQuestion: { select: { marks: true, typeSnapshot: true } },
      attempt: {
        select: {
          status: true,
          publishedAt: true,
          assignment: { select: { assessment: { select: { classSubjectId: true } } } },
        },
      },
    },
  })
  if (!answer) throw notFound('Answer')
  await assertClassSubjectAccess(ctx, answer.attempt.assignment.assessment.classSubjectId)
  return answer
}

export async function markAnswer(
  ctx: AppContext,
  answerId: string,
  input: z.infer<typeof markSchema>,
) {
  const answer = await answerGuard(ctx, answerId)

  if (answer.attempt.status === 'IN_PROGRESS') {
    throw conflict('This paper has not been submitted yet')
  }
  if (input.marksAwarded > answer.assessmentQuestion.marks) {
    throw conflict(
      `That question is worth ${answer.assessmentQuestion.marks} marks. You cannot award more.`,
    )
  }

  return ctx.db.studentAnswer.update({
    where: { id: answerId },
    data: {
      marksAwarded: input.marksAwarded,
      teacherComment: input.teacherComment ?? null,
      isCorrect: input.marksAwarded >= answer.assessmentQuestion.marks,
      evaluatedById: ctx.user.userId,
      evaluatedAt: new Date(),
    },
    select: { id: true, marksAwarded: true },
  })
}

/**
 * Totals the attempt and marks it evaluated.
 *
 * Refuses while a written answer is unmarked, because the total would be the
 * objective score wearing the name of a result.
 */
export async function finaliseAttempt(
  ctx: AppContext,
  attemptId: string,
  input: z.infer<typeof finaliseSchema>,
) {
  const attempt = await ctx.db.assessmentAttempt.findFirst({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      assignment: {
        select: { assessment: { select: { classSubjectId: true, title: true } } },
      },
      answers: {
        select: {
          marksAwarded: true,
          assessmentQuestion: { select: { typeSnapshot: true } },
        },
      },
    },
  })
  if (!attempt) throw notFound('Attempt')
  await assertClassSubjectAccess(ctx, attempt.assignment.assessment.classSubjectId)
  if (attempt.status === 'IN_PROGRESS') throw conflict('This paper has not been submitted yet')

  const unmarked = attempt.answers.filter(
    (answer) =>
      !OBJECTIVE_TYPES.includes(answer.assessmentQuestion.typeSnapshot as never) &&
      answer.marksAwarded === null,
  ).length
  if (unmarked > 0) {
    throw conflict(
      `${unmarked} written ${unmarked === 1 ? 'answer is' : 'answers are'} still unmarked.`,
    )
  }

  const total = attempt.answers.reduce((sum, answer) => sum + (answer.marksAwarded ?? 0), 0)

  await ctx.db.assessmentAttempt.update({
    where: { id: attemptId },
    data: {
      status: 'EVALUATED',
      totalScore: Math.round(total * 100) / 100,
      teacherComment: input.teacherComment ?? null,
      evaluatedById: ctx.user.userId,
      evaluatedAt: new Date(),
    },
  })

  await audit({
    ...actor(ctx),
    action: 'assessment.evaluate',
    entityType: 'AssessmentAttempt',
    entityId: attemptId,
    summary: `Marked ${attempt.assignment.assessment.title} — ${total} marks`,
  })

  return { totalScore: total }
}

/**
 * Releases every marked attempt in one assignment.
 *
 * All at once, per assignment, rather than per student: releasing one child's
 * result while their neighbour waits is how a class finds out who was marked
 * first, and the teacher has no reason to want that.
 */
export async function publishResults(ctx: AppContext, assignmentId: string) {
  const assignment = await ctx.db.assessmentAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    select: {
      id: true,
      assessment: { select: { classSubjectId: true, title: true, totalMarks: true } },
    },
  })
  if (!assignment) throw notFound('Assignment')
  await assertClassSubjectAccess(ctx, assignment.assessment.classSubjectId)

  const ready = await ctx.db.assessmentAttempt.findMany({
    where: { assignmentId, status: 'EVALUATED', publishedAt: null },
    select: { id: true, totalScore: true, student: { select: { userId: true } } },
  })

  if (ready.length === 0) {
    throw conflict('No marked papers are waiting to be released')
  }

  await ctx.db.assessmentAttempt.updateMany({
    where: { id: { in: ready.map((attempt) => attempt.id) } },
    data: { publishedAt: new Date() },
  })

  const userIds = ready.map((attempt) => attempt.student.userId).filter(Boolean) as string[]
  if (userIds.length > 0) {
    await notify(ctx, {
      userIds,
      eventKey: 'assessment.result',
      title: `Result: ${assignment.assessment.title}`,
      body: 'Your marked paper is available.',
      linkUrl: '/my/assessments',
    })
  }

  await audit({
    ...actor(ctx),
    action: 'assessment.publish',
    entityType: 'AssessmentAssignment',
    entityId: assignmentId,
    summary: `Released ${ready.length} results for ${assignment.assessment.title}`,
  })

  return { released: ready.length }
}

/* -------------------------------------------------------------------------- */
/* Analytics                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How the class did, and where it did not.
 *
 * Computed on read from the attempts themselves rather than stored: a marked
 * paper changes these numbers, and a cached figure that disagrees with the
 * marking screen is worse than a query.
 */
export async function assignmentAnalytics(ctx: AppContext, assignmentId: string) {
  const assignment = await ctx.db.assessmentAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    select: {
      id: true,
      sectionId: true,
      classLevelId: true,
      assessment: {
        select: {
          id: true,
          title: true,
          totalMarks: true,
          classSubjectId: true,
          questions: {
            select: {
              id: true,
              marks: true,
              textSnapshot: true,
              typeSnapshot: true,
              difficultySnapshot: true,
              question: {
                select: {
                  topics: {
                    select: {
                      topic: {
                        select: { id: true, name: true, chapter: { select: { name: true } } },
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
  })
  if (!assignment) throw notFound('Assignment')
  await assertClassSubjectAccess(ctx, assignment.assessment.classSubjectId)

  const [attempts, cohort] = await Promise.all([
    ctx.db.assessmentAttempt.findMany({
      where: { assignmentId, status: { in: ['SUBMITTED', 'EVALUATED'] } },
      select: {
        id: true,
        status: true,
        totalScore: true,
        objectiveScore: true,
        answers: {
          select: { assessmentQuestionId: true, marksAwarded: true, isCorrect: true },
        },
      },
    }),
    ctx.db.student.count({
      where: {
        deletedAt: null,
        enrollments: {
          some: {
            isCurrent: true,
            ...(assignment.sectionId
              ? { sectionId: assignment.sectionId }
              : assignment.classLevelId
                ? { classLevelId: assignment.classLevelId }
                : {}),
          },
        },
      },
    }),
  ])

  const marked = attempts.filter((attempt) => attempt.status === 'EVALUATED')
  const scores = marked
    .map((attempt) => attempt.totalScore)
    .filter((score): score is number => score !== null)

  const total = assignment.assessment.totalMarks
  const passMark = total * 0.33

  const summary = {
    cohort,
    submitted: attempts.length,
    marked: marked.length,
    submissionRate: cohort > 0 ? Math.round((attempts.length / cohort) * 100) : 0,
    average:
      scores.length > 0
        ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10
        : null,
    highest: scores.length > 0 ? Math.max(...scores) : null,
    lowest: scores.length > 0 ? Math.min(...scores) : null,
    passRate:
      scores.length > 0
        ? Math.round((scores.filter((score) => score >= passMark).length / scores.length) * 100)
        : null,
    totalMarks: total,
  }

  // Per question: what share of the marks available were actually earned.
  const perQuestion = assignment.assessment.questions.map((question) => {
    const answers = attempts
      .flatMap((attempt) => attempt.answers)
      .filter((answer) => answer.assessmentQuestionId === question.id)

    const scored = answers.filter((answer) => answer.marksAwarded !== null)
    const earned = scored.reduce((sum, answer) => sum + (answer.marksAwarded ?? 0), 0)
    const available = scored.length * question.marks

    return {
      id: question.id,
      text: question.textSnapshot,
      type: question.typeSnapshot,
      difficulty: question.difficultySnapshot,
      marks: question.marks,
      answered: answers.length,
      scored: scored.length,
      successRate: available > 0 ? Math.round((earned / available) * 100) : null,
      topics: question.question?.topics.map((link) => link.topic) ?? [],
    }
  })

  // Per topic, rolled up from the questions that carry it. This is the gap
  // report: it says which part of the syllabus the class did not take in,
  // rather than which child did badly.
  const topicTotals = new Map<
    string,
    { name: string; chapter: string; earned: number; available: number; questions: number }
  >()

  for (const question of perQuestion) {
    if (question.successRate === null) continue
    for (const topic of question.topics) {
      const entry = topicTotals.get(topic.id) ?? {
        name: topic.name,
        chapter: topic.chapter.name,
        earned: 0,
        available: 0,
        questions: 0,
      }
      entry.earned += (question.successRate / 100) * question.scored * question.marks
      entry.available += question.scored * question.marks
      entry.questions += 1
      topicTotals.set(topic.id, entry)
    }
  }

  const byTopic = [...topicTotals.entries()]
    .map(([id, entry]) => ({
      id,
      name: entry.name,
      chapter: entry.chapter,
      questions: entry.questions,
      successRate: entry.available > 0 ? Math.round((entry.earned / entry.available) * 100) : null,
    }))
    .sort((a, b) => (a.successRate ?? 100) - (b.successRate ?? 100))

  return {
    assessment: {
      id: assignment.assessment.id,
      title: assignment.assessment.title,
      totalMarks: total,
    },
    assignmentId: assignment.id,
    summary,
    perQuestion: [...perQuestion].sort(
      (a, b) => (a.successRate ?? 101) - (b.successRate ?? 101),
    ),
    byTopic,
    // Stated as an observation, not a conclusion. The number is real; what to
    // do about it is the teacher's call, and a system that says "reteach this"
    // on one test of 20 students is overreaching.
    gaps: byTopic.filter((topic) => topic.successRate !== null && topic.successRate < 60),
  }
}

/** A student's own marked paper, once it has been released. */
export async function myResult(ctx: AppContext, attemptId: string) {
  const student = await ctx.db.student.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: { id: true },
  })
  if (!student) throw notFound('Student')

  const attempt = await ctx.db.assessmentAttempt.findFirst({
    where: { id: attemptId, studentId: student.id },
    select: {
      id: true,
      totalScore: true,
      publishedAt: true,
      teacherComment: true,
      assignment: {
        select: {
          assessment: {
            select: {
              title: true,
              totalMarks: true,
              classSubject: { select: { subject: { select: { name: true } } } },
              sections: {
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  title: true,
                  questions: {
                    orderBy: { position: 'asc' },
                    select: {
                      id: true,
                      marks: true,
                      textSnapshot: true,
                      answerSnapshot: true,
                      typeSnapshot: true,
                      optionsSnapshot: true,
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
          responseText: true,
          selectedIndexes: true,
          isCorrect: true,
          marksAwarded: true,
          teacherComment: true,
        },
      },
    },
  })
  if (!attempt) throw notFound('Result')

  // The answer key travels with the result and not a moment earlier. Before
  // release there is nothing here to read.
  if (!attempt.publishedAt) {
    throw conflict('This result has not been released yet')
  }

  const answers = new Map(attempt.answers.map((answer) => [answer.assessmentQuestionId, answer]))

  return {
    title: attempt.assignment.assessment.title,
    subject: attempt.assignment.assessment.classSubject.subject.name,
    totalMarks: attempt.assignment.assessment.totalMarks,
    score: attempt.totalScore,
    teacherComment: attempt.teacherComment,
    sections: attempt.assignment.assessment.sections.map((section) => ({
      id: section.id,
      title: section.title,
      questions: section.questions.map((question) => {
        const answer = answers.get(question.id) ?? null
        const options = asOptions(question.optionsSnapshot)
        const chosen = Array.isArray(answer?.selectedIndexes)
          ? (answer.selectedIndexes as number[])
          : []
        return {
          id: question.id,
          text: question.textSnapshot,
          marks: question.marks,
          marksAwarded: answer?.marksAwarded ?? null,
          isCorrect: answer?.isCorrect ?? null,
          responseText: answer?.responseText ?? null,
          expectedAnswer: question.answerSnapshot,
          teacherComment: answer?.teacherComment ?? null,
          options: options.map((option, index) => ({
            text: option.text,
            isCorrect: Boolean(option.isCorrect),
            chosen: chosen.includes(index),
          })),
        }
      }),
    })),
  }
}
