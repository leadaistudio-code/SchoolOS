import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { assertClassSubjectAccess, teachingClassSubjectIds } from '@/server/scope'
import { notify } from '@/server/notifications'
import { OBJECTIVE_TYPES } from '@/lib/questions'

/**
 * Assigning a paper, and sitting one.
 *
 * The rule this file exists to keep: the paper a student receives carries no
 * answers. Not the correct option, not the marking scheme, not the explanation.
 * A student portal that fetches the whole placement and hides the answer in the
 * browser has already sent it, and the first child to open developer tools has
 * the key. So there are two readers of the same paper — `paperForTeacher` and
 * `paperForStudent` — and only one of them selects the answer columns.
 */

export const assignSchema = z
  .object({
    assessmentId: z.string().min(1),
    sectionId: z.string().optional(),
    classLevelId: z.string().optional(),
    mode: z.enum(['OFFLINE', 'ONLINE', 'PRACTICE']).default('OFFLINE'),
    opensAt: z.string().datetime({ offset: true }),
    dueAt: z.string().datetime({ offset: true }),
    minutesOverride: z.coerce.number().int().min(5).max(360).optional(),
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(false),
    onePerScreen: z.boolean().default(false),
    allowBack: z.boolean().default(true),
    autoSubmit: z.boolean().default(true),
    attemptLimit: z.coerce.number().int().min(1).max(5).default(1),
    showResultOnSubmit: z.boolean().default(false),
  })
  .refine((value) => new Date(value.dueAt) > new Date(value.opensAt), {
    path: ['dueAt'],
    message: 'The closing time must be after the opening time',
  })
  .refine((value) => value.sectionId || value.classLevelId, {
    path: ['sectionId'],
    message: 'Choose a section or a class',
  })

export const answerSchema = z.object({
  assessmentQuestionId: z.string().min(1),
  responseText: z.string().max(20000).nullish(),
  selectedIndexes: z.array(z.number().int().min(0).max(50)).max(50).nullish(),
})

export type AssignInput = z.infer<typeof assignSchema>

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

/* -------------------------------------------------------------------------- */
/* Assigning                                                                   */
/* -------------------------------------------------------------------------- */

export async function createAssignment(ctx: AppContext, input: AssignInput) {
  const assessment = await ctx.db.assessment.findFirst({
    where: { id: input.assessmentId, deletedAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      classSubjectId: true,
      classSubject: { select: { classLevelId: true, subject: { select: { name: true } } } },
    },
  })
  if (!assessment) throw notFound('Paper')
  await assertClassSubjectAccess(ctx, assessment.classSubjectId)

  // An unapproved paper has not been checked for whether it adds up. Assigning
  // one puts an arithmetic error in front of a class.
  if (assessment.status === 'DRAFT' || assessment.status === 'IN_REVIEW') {
    throw conflict('Approve this paper before assigning it')
  }

  const created = await ctx.db.assessmentAssignment.create({
    data: {
      tenantId: ctx.tenant.id,
      assessmentId: input.assessmentId,
      sectionId: input.sectionId ?? null,
      classLevelId: input.classLevelId ?? assessment.classSubject.classLevelId,
      mode: input.mode,
      opensAt: new Date(input.opensAt),
      dueAt: new Date(input.dueAt),
      minutesOverride: input.minutesOverride ?? null,
      shuffleQuestions: input.shuffleQuestions,
      shuffleOptions: input.shuffleOptions,
      onePerScreen: input.onePerScreen,
      allowBack: input.allowBack,
      autoSubmit: input.autoSubmit,
      attemptLimit: input.attemptLimit,
      showResultOnSubmit: input.showResultOnSubmit,
      createdById: ctx.user.userId,
    },
    select: { id: true, sectionId: true, classLevelId: true },
  })

  await ctx.db.assessment.update({
    where: { id: input.assessmentId },
    data: { status: 'ASSIGNED' },
  })

  // Tell the students it exists. In-app only: a fortnightly test does not
  // justify an SMS to every parent, and the channel list is the school's to
  // widen later.
  const students = await studentsInScope(ctx, created.sectionId, created.classLevelId)
  const userIds = students.map((student) => student.userId).filter(Boolean) as string[]
  if (userIds.length > 0) {
    await notify(ctx, {
      userIds,
      eventKey: 'assessment.assigned',
      title: `${assessment.title} — ${assessment.classSubject.subject.name}`,
      body:
        input.mode === 'OFFLINE'
          ? 'A test has been scheduled for your class.'
          : 'A test is available in your portal.',
      linkUrl: '/my/assessments',
    })
  }

  await audit({
    ...actor(ctx),
    action: 'assessment.assign',
    entityType: 'Assessment',
    entityId: input.assessmentId,
    summary: `Assigned ${assessment.title} to ${students.length} students (${input.mode.toLowerCase()})`,
  })

  return { id: created.id, students: students.length }
}

async function studentsInScope(
  ctx: AppContext,
  sectionId: string | null,
  classLevelId: string | null,
) {
  return ctx.db.student.findMany({
    where: {
      deletedAt: null,
      enrollments: {
        some: {
          isCurrent: true,
          ...(sectionId ? { sectionId } : classLevelId ? { classLevelId } : {}),
        },
      },
    },
    select: { id: true, userId: true, firstName: true, lastName: true },
  })
}

export async function listAssignmentsFor(ctx: AppContext, assessmentId: string) {
  const assessment = await ctx.db.assessment.findFirst({
    where: { id: assessmentId, deletedAt: null },
    select: { classSubjectId: true },
  })
  if (!assessment) throw notFound('Paper')
  await assertClassSubjectAccess(ctx, assessment.classSubjectId)

  return ctx.db.assessmentAssignment.findMany({
    where: { assessmentId, deletedAt: null },
    orderBy: { opensAt: 'desc' },
    select: {
      id: true,
      mode: true,
      opensAt: true,
      dueAt: true,
      attemptLimit: true,
      section: { select: { name: true } },
      classLevel: { select: { name: true } },
      _count: { select: { attempts: true } },
    },
  })
}

/* -------------------------------------------------------------------------- */
/* The student's side                                                          */
/* -------------------------------------------------------------------------- */

/** The caller's own student record, or a clear refusal. */
async function currentStudent(ctx: AppContext) {
  const student = await ctx.db.student.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: {
      id: true,
      enrollments: {
        where: { isCurrent: true },
        select: { sectionId: true, classLevelId: true },
        take: 1,
      },
    },
  })
  if (!student) {
    throw new ApiException(403, 'NOT_A_STUDENT', 'This is only available to students')
  }
  return student
}

export async function myAssessments(ctx: AppContext) {
  const student = await currentStudent(ctx)
  const enrollment = student.enrollments[0]
  if (!enrollment) return []

  const assignments = await ctx.db.assessmentAssignment.findMany({
    where: {
      deletedAt: null,
      OR: [{ sectionId: enrollment.sectionId }, { sectionId: null, classLevelId: enrollment.classLevelId }],
    },
    orderBy: { dueAt: 'asc' },
    select: {
      id: true,
      mode: true,
      opensAt: true,
      dueAt: true,
      attemptLimit: true,
      minutesOverride: true,
      assessment: {
        select: {
          id: true,
          title: true,
          totalMarks: true,
          durationMinutes: true,
          type: { select: { name: true } },
          classSubject: { select: { subject: { select: { name: true } } } },
        },
      },
      attempts: {
        where: { studentId: student.id },
        orderBy: { attemptNumber: 'desc' },
        select: {
          id: true,
          status: true,
          attemptNumber: true,
          submittedAt: true,
          totalScore: true,
          publishedAt: true,
        },
      },
    },
  })

  const now = new Date()
  return assignments.map((assignment) => {
    const latest = assignment.attempts[0] ?? null
    const attemptsUsed = assignment.attempts.length
    const open = now >= assignment.opensAt && now <= assignment.dueAt

    const state = latest?.status === 'IN_PROGRESS'
      ? 'in_progress'
      : attemptsUsed >= assignment.attemptLimit
        ? 'completed'
        : now < assignment.opensAt
          ? 'upcoming'
          : now > assignment.dueAt
            ? 'missed'
            : 'available'

    return {
      assignmentId: assignment.id,
      title: assignment.assessment.title,
      subject: assignment.assessment.classSubject.subject.name,
      type: assignment.assessment.type.name,
      totalMarks: assignment.assessment.totalMarks,
      minutes: assignment.minutesOverride ?? assignment.assessment.durationMinutes,
      mode: assignment.mode,
      opensAt: assignment.opensAt,
      dueAt: assignment.dueAt,
      state,
      canStart: open && assignment.mode !== 'OFFLINE' && attemptsUsed < assignment.attemptLimit,
      attemptId: latest?.status === 'IN_PROGRESS' ? latest.id : null,
      // A score exists as soon as it is computed; it is shown only once
      // released. Those are different facts and the portal must not conflate
      // them.
      score: latest?.publishedAt ? latest.totalScore : null,
    }
  })
}

/**
 * Deals the paper.
 *
 * Shuffling happens here, once, and the order is not stored: the answer rows
 * key off the placement id, so presentation order is irrelevant to scoring and
 * a refresh reshuffling the screen costs nothing.
 */
export async function startAttempt(ctx: AppContext, assignmentId: string) {
  const student = await currentStudent(ctx)

  const assignment = await ctx.db.assessmentAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    select: {
      id: true,
      mode: true,
      opensAt: true,
      dueAt: true,
      attemptLimit: true,
      sectionId: true,
      classLevelId: true,
      assessmentId: true,
    },
  })
  if (!assignment) throw notFound('Assessment')

  const enrollment = student.enrollments[0]
  const forThisStudent =
    (assignment.sectionId && assignment.sectionId === enrollment?.sectionId) ||
    (!assignment.sectionId && assignment.classLevelId === enrollment?.classLevelId)
  if (!forThisStudent) {
    throw new ApiException(403, 'NOT_ASSIGNED', 'This test was not set for your class')
  }

  if (assignment.mode === 'OFFLINE') {
    throw conflict('This test is written on paper, not in the portal')
  }

  const now = new Date()
  if (now < assignment.opensAt) throw conflict('This test has not opened yet')
  if (now > assignment.dueAt) throw conflict('This test has closed')

  const existing = await ctx.db.assessmentAttempt.findMany({
    where: { assignmentId, studentId: student.id },
    orderBy: { attemptNumber: 'desc' },
    select: { id: true, status: true, attemptNumber: true },
  })

  const live = existing.find((attempt) => attempt.status === 'IN_PROGRESS')
  if (live) return attemptPaper(ctx, live.id)

  if (existing.length >= assignment.attemptLimit) {
    throw conflict('You have used all your attempts at this test')
  }

  const attempt = await ctx.db.assessmentAttempt.create({
    data: {
      tenantId: ctx.tenant.id,
      assignmentId,
      studentId: student.id,
      attemptNumber: (existing[0]?.attemptNumber ?? 0) + 1,
    },
    select: { id: true },
  })

  return attemptPaper(ctx, attempt.id)
}

/** Deterministic shuffle from a seed, so one attempt keeps one order. */
function shuffle<T>(items: T[], seed: string): T[] {
  const scored = items.map((item, index) => {
    let hash = 0
    const key = `${seed}:${index}`
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) | 0
    }
    return { item, hash }
  })
  scored.sort((a, b) => a.hash - b.hash)
  return scored.map((entry) => entry.item)
}

/**
 * The paper as the student sees it.
 *
 * Note what is absent from the select: `answerSnapshot`, and `isCorrect` on the
 * options. This is the only reader that runs for a student, and it cannot leak
 * what it does not fetch.
 */
export async function attemptPaper(ctx: AppContext, attemptId: string) {
  const student = await currentStudent(ctx)

  const attempt = await ctx.db.assessmentAttempt.findFirst({
    where: { id: attemptId, studentId: student.id },
    select: {
      id: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      assignment: {
        select: {
          id: true,
          mode: true,
          dueAt: true,
          minutesOverride: true,
          shuffleQuestions: true,
          shuffleOptions: true,
          onePerScreen: true,
          allowBack: true,
          autoSubmit: true,
          assessment: {
            select: {
              id: true,
              title: true,
              totalMarks: true,
              durationMinutes: true,
              instructions: true,
              classSubject: { select: { subject: { select: { name: true } } } },
              sections: {
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  title: true,
                  instructions: true,
                  questions: {
                    orderBy: { position: 'asc' },
                    select: {
                      id: true,
                      marks: true,
                      textSnapshot: true,
                      optionsSnapshot: true,
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
        select: { assessmentQuestionId: true, responseText: true, selectedIndexes: true },
      },
    },
  })
  if (!attempt) throw notFound('Attempt')

  const { assignment } = attempt
  const saved = new Map(attempt.answers.map((answer) => [answer.assessmentQuestionId, answer]))

  const sections = assignment.assessment.sections.map((section) => {
    const questions = section.questions.map((question) => {
      const options = asOptions(question.optionsSnapshot).map((option, index) => ({
        // The index is the identity. Shuffling reorders what is shown while the
        // index travels with it, so the server scores against the paper as set.
        index,
        text: option.text,
        matchWith: option.matchWith ?? null,
      }))

      return {
        id: question.id,
        marks: question.marks,
        text: question.textSnapshot,
        type: question.typeSnapshot,
        options: assignment.shuffleOptions ? shuffle(options, attempt.id + question.id) : options,
        answer: saved.get(question.id) ?? null,
      }
    })

    return {
      id: section.id,
      title: section.title,
      instructions: section.instructions,
      questions: assignment.shuffleQuestions ? shuffle(questions, attempt.id + section.id) : questions,
    }
  })

  const minutes = assignment.minutesOverride ?? assignment.assessment.durationMinutes
  const endsAt = new Date(
    Math.min(attempt.startedAt.getTime() + minutes * 60_000, assignment.dueAt.getTime()),
  )

  return {
    attemptId: attempt.id,
    status: attempt.status,
    title: assignment.assessment.title,
    subject: assignment.assessment.classSubject.subject.name,
    instructions: assignment.assessment.instructions,
    totalMarks: assignment.assessment.totalMarks,
    mode: assignment.mode,
    startedAt: attempt.startedAt,
    endsAt,
    timed: assignment.mode !== 'PRACTICE',
    onePerScreen: assignment.onePerScreen,
    allowBack: assignment.allowBack,
    autoSubmit: assignment.autoSubmit,
    sections,
  }
}

export async function saveAnswer(
  ctx: AppContext,
  attemptId: string,
  input: z.infer<typeof answerSchema>,
) {
  const student = await currentStudent(ctx)

  const attempt = await ctx.db.assessmentAttempt.findFirst({
    where: { id: attemptId, studentId: student.id },
    select: {
      id: true,
      status: true,
      startedAt: true,
      assignment: {
        select: {
          dueAt: true,
          minutesOverride: true,
          assessment: { select: { id: true, durationMinutes: true } },
        },
      },
    },
  })
  if (!attempt) throw notFound('Attempt')
  if (attempt.status !== 'IN_PROGRESS') throw conflict('This attempt has already been submitted')

  // The clock is the server's. A browser with a frozen timer, or one whose
  // system time has been moved, does not buy extra minutes.
  if (expired(attempt)) {
    throw new ApiException(409, 'TIME_UP', 'Your time is up. Submit the paper.')
  }

  const belongs = await ctx.db.assessmentQuestion.count({
    where: {
      id: input.assessmentQuestionId,
      assessmentId: attempt.assignment.assessment.id,
    },
  })
  if (belongs === 0) throw notFound('Question')

  await ctx.db.studentAnswer.upsert({
    where: {
      tenantId_attemptId_assessmentQuestionId: {
        tenantId: ctx.tenant.id,
        attemptId,
        assessmentQuestionId: input.assessmentQuestionId,
      },
    },
    create: {
      tenantId: ctx.tenant.id,
      attemptId,
      assessmentQuestionId: input.assessmentQuestionId,
      responseText: input.responseText ?? null,
      selectedIndexes: input.selectedIndexes ?? undefined,
    },
    update: {
      responseText: input.responseText ?? null,
      selectedIndexes: input.selectedIndexes ?? undefined,
    },
  })

  return { saved: true }
}

function expired(attempt: {
  startedAt: Date
  assignment: {
    dueAt: Date
    minutesOverride: number | null
    assessment: { durationMinutes: number }
  }
}): boolean {
  const minutes = attempt.assignment.minutesOverride ?? attempt.assignment.assessment.durationMinutes
  const endsAt = Math.min(
    attempt.startedAt.getTime() + minutes * 60_000,
    attempt.assignment.dueAt.getTime(),
  )
  // A little slack, so a request already in flight when the clock turns is not
  // thrown away.
  return Date.now() > endsAt + 5_000
}

/**
 * Scores the options-based questions.
 *
 * Only the types where a right answer is a matter of fact. One-word and
 * fill-in-the-blank answers are deliberately left for a teacher: "photosynthesis"
 * and "Photosynthesis " and "photosynthsis" are the same answer to a human and
 * three different strings here, and a marking scheme that fails a child on a
 * typo is worse than one that takes a minute of a teacher's time.
 */
export function scoreObjective(
  type: string,
  optionsSnapshot: unknown,
  selectedIndexes: unknown,
  marks: number,
): { isCorrect: boolean; marksAwarded: number } | null {
  if (!OBJECTIVE_TYPES.includes(type as never)) return null

  const options = asOptions(optionsSnapshot)
  if (options.length === 0) return null

  const chosen = new Set(
    Array.isArray(selectedIndexes) ? (selectedIndexes as number[]).map(Number) : [],
  )
  const correct = new Set(
    options.map((option, index) => (option.isCorrect ? index : -1)).filter((index) => index >= 0),
  )

  if (correct.size === 0) return null

  const exact =
    chosen.size === correct.size && [...correct].every((index) => chosen.has(index))

  return { isCorrect: exact, marksAwarded: exact ? marks : 0 }
}

export async function submitAttempt(ctx: AppContext, attemptId: string, auto = false) {
  const student = await currentStudent(ctx)

  const attempt = await ctx.db.assessmentAttempt.findFirst({
    where: { id: attemptId, studentId: student.id },
    select: {
      id: true,
      status: true,
      startedAt: true,
      assignment: {
        select: {
          dueAt: true,
          minutesOverride: true,
          mode: true,
          showResultOnSubmit: true,
          assessment: { select: { id: true, title: true, totalMarks: true } },
        },
      },
      answers: {
        select: {
          id: true,
          selectedIndexes: true,
          assessmentQuestion: {
            select: { marks: true, typeSnapshot: true, optionsSnapshot: true },
          },
        },
      },
    },
  })
  if (!attempt) throw notFound('Attempt')
  if (attempt.status !== 'IN_PROGRESS') throw conflict('This attempt has already been submitted')

  let objectiveScore = 0
  const updates = []

  for (const answer of attempt.answers) {
    const scored = scoreObjective(
      answer.assessmentQuestion.typeSnapshot,
      answer.assessmentQuestion.optionsSnapshot,
      answer.selectedIndexes,
      answer.assessmentQuestion.marks,
    )
    if (!scored) continue
    objectiveScore += scored.marksAwarded
    updates.push(
      ctx.db.studentAnswer.update({
        where: { id: answer.id },
        data: { isCorrect: scored.isCorrect, marksAwarded: scored.marksAwarded },
      }),
    )
  }

  await ctx.db.$transaction([
    ...updates,
    ctx.db.assessmentAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        autoSubmitted: auto,
        objectiveScore,
        // Practice tests can release themselves. A real test is released by a
        // teacher, because a score with the written answers still unmarked is
        // not the student's result.
        ...(attempt.assignment.mode === 'PRACTICE' && attempt.assignment.showResultOnSubmit
          ? { totalScore: objectiveScore, publishedAt: new Date() }
          : {}),
      },
    }),
  ])

  await audit({
    ...actor(ctx),
    action: 'assessment.submit',
    entityType: 'AssessmentAttempt',
    entityId: attemptId,
    summary: `Submitted ${attempt.assignment.assessment.title}${auto ? ' (time up)' : ''}`,
  })

  return {
    submitted: true,
    objectiveScore,
    released:
      attempt.assignment.mode === 'PRACTICE' && attempt.assignment.showResultOnSubmit,
  }
}

/** Who has sat it and who has not — the teacher's view of one assignment. */
export async function assignmentProgress(ctx: AppContext, assignmentId: string) {
  const assignment = await ctx.db.assessmentAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    select: {
      id: true,
      mode: true,
      sectionId: true,
      classLevelId: true,
      dueAt: true,
      assessment: { select: { id: true, title: true, totalMarks: true, classSubjectId: true } },
    },
  })
  if (!assignment) throw notFound('Assignment')
  await assertClassSubjectAccess(ctx, assignment.assessment.classSubjectId)

  const [students, attempts] = await Promise.all([
    studentsInScope(ctx, assignment.sectionId, assignment.classLevelId),
    ctx.db.assessmentAttempt.findMany({
      where: { assignmentId },
      orderBy: { attemptNumber: 'desc' },
      select: {
        id: true,
        studentId: true,
        status: true,
        submittedAt: true,
        autoSubmitted: true,
        objectiveScore: true,
        totalScore: true,
        publishedAt: true,
      },
    }),
  ])

  const byStudent = new Map<string, (typeof attempts)[number]>()
  for (const attempt of attempts) {
    if (!byStudent.has(attempt.studentId)) byStudent.set(attempt.studentId, attempt)
  }

  return {
    assignment: {
      id: assignment.id,
      mode: assignment.mode,
      dueAt: assignment.dueAt,
      title: assignment.assessment.title,
      totalMarks: assignment.assessment.totalMarks,
      assessmentId: assignment.assessment.id,
    },
    rows: students.map((student) => {
      const attempt = byStudent.get(student.id) ?? null
      return {
        studentId: student.id,
        name: `${student.firstName} ${student.lastName}`,
        attemptId: attempt?.id ?? null,
        status: attempt?.status ?? 'NOT_STARTED',
        submittedAt: attempt?.submittedAt ?? null,
        autoSubmitted: attempt?.autoSubmitted ?? false,
        objectiveScore: attempt?.objectiveScore ?? null,
        totalScore: attempt?.totalScore ?? null,
        published: Boolean(attempt?.publishedAt),
      }
    }),
  }
}

/** Assignments a teacher is responsible for, newest first. */
export async function teacherAssignments(ctx: AppContext) {
  const allowed = await teachingClassSubjectIds(ctx)
  if (allowed !== null && allowed.length === 0) return []

  return ctx.db.assessmentAssignment.findMany({
    where: {
      deletedAt: null,
      ...(allowed === null ? {} : { assessment: { classSubjectId: { in: allowed } } }),
    },
    orderBy: { dueAt: 'desc' },
    take: 100,
    select: {
      id: true,
      mode: true,
      opensAt: true,
      dueAt: true,
      section: { select: { name: true } },
      classLevel: { select: { name: true } },
      assessment: {
        select: {
          id: true,
          title: true,
          totalMarks: true,
          classSubject: { select: { subject: { select: { name: true } } } },
        },
      },
      _count: { select: { attempts: true } },
    },
  })
}
