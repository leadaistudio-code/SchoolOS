import type { AppContext } from '@/server/context'
import { TeacherRefreshType, TeacherRefreshFrequency } from '@prisma/client'
import { ApiException, notFound, conflict } from '@/server/api/response'
import { audit } from '@/server/audit'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { assistantConfigured, assistantModel } from '@/server/assistant/providers'
import {
  gradeAnswers,
  computeTopicBreakdown,
  readinessFromPercent,
  proficiencyFromPercent,
  mergeHistory,
  type GradeQuestion,
  type HistoryPoint,
} from './scoring'
import { composeRefresher } from './generate'
import type { ComposeRefresherInput, SubmitRefresherInput } from './schema'

/**
 * Teacher-facing knowledge refresh service.
 *
 * The privacy stance is enforced here, not just documented: a teacher only ever
 * reads and submits their OWN refreshers (ownership is re-checked against their
 * Staff row on every call, never taken from the request), and no method on this
 * module exposes one teacher's results to another user. Oversight roles use the
 * separate readiness analytics, which are aggregate by design.
 */

export type ResolvedRefreshConfig = {
  enabled: boolean
  frequency: TeacherRefreshFrequency
  weeklyQuestionCount: number
  monthlyQuestionCount: number
  passingThreshold: number
  maxAttempts: number
  preLectureEnabled: boolean
  preLectureCount: number
  completionWindowHours: number
}

const CONFIG_DEFAULTS: ResolvedRefreshConfig = {
  enabled: false,
  frequency: TeacherRefreshFrequency.WEEKLY,
  weeklyQuestionCount: 10,
  monthlyQuestionCount: 25,
  passingThreshold: 70,
  maxAttempts: 2,
  preLectureEnabled: true,
  preLectureCount: 5,
  completionWindowHours: 48,
}

/** Reads the school's config, falling back to defaults. No permission gate: the
 * service applies these rules on the teacher's behalf; it does not expose them. */
export async function resolveConfig(ctx: AppContext): Promise<ResolvedRefreshConfig> {
  const row = await ctx.db.teacherRefreshConfig.findFirst({})
  if (!row) return { ...CONFIG_DEFAULTS }
  return {
    enabled: row.enabled,
    frequency: row.frequency,
    weeklyQuestionCount: row.weeklyQuestionCount,
    monthlyQuestionCount: row.monthlyQuestionCount,
    passingThreshold: row.passingThreshold,
    maxAttempts: row.maxAttempts,
    preLectureEnabled: row.preLectureEnabled,
    preLectureCount: row.preLectureCount,
    completionWindowHours: row.completionWindowHours,
  }
}

/** The Staff row for the signed-in teacher. Throws if the account is not staff. */
export async function currentTeacher(ctx: AppContext): Promise<{ id: string; userId: string | null }> {
  const staff = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: { id: true, userId: true },
  })
  if (!staff) {
    throw new ApiException(403, 'NOT_TEACHING_STAFF', 'Knowledge refreshers are for teaching staff.')
  }
  return staff
}

type RefresherListItem = {
  id: string
  type: TeacherRefreshType
  status: string
  scheduledAt: Date
  dueAt: Date
  questionCount: number
  subjectLabel: string
  className: string
  latestPercent: number | null
  readinessLabel: string | null
}

/** The teacher's own dashboard: due now, overdue, and completed. */
export async function listMyRefreshers(ctx: AppContext) {
  ctx.require('teacher_refresh.view_self')
  const teacher = await currentTeacher(ctx)
  const config = await resolveConfig(ctx)
  const now = new Date()

  const rows = await ctx.db.teacherRefreshAssessment.findMany({
    where: { teacherId: teacher.id },
    orderBy: { dueAt: 'asc' },
    take: 200,
    include: {
      classSubject: {
        select: {
          subject: { select: { name: true } },
          classLevel: { select: { name: true } },
        },
      },
      attempts: {
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { score: true, maxScore: true },
      },
    },
  })

  const map = (r: (typeof rows)[number]): RefresherListItem => {
    const attempt = r.attempts[0]
    const percent =
      attempt && attempt.maxScore && attempt.maxScore > 0 && attempt.score != null
        ? Math.round((attempt.score / attempt.maxScore) * 1000) / 10
        : null
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      scheduledAt: r.scheduledAt,
      dueAt: r.dueAt,
      questionCount: r.questionCount,
      subjectLabel: r.classSubject.subject.name,
      className: r.classSubject.classLevel.name,
      latestPercent: percent,
      readinessLabel:
        percent == null ? null : readinessFromPercent(percent, config.passingThreshold).label,
    }
  }

  const items = rows.map(map)

  return {
    enabled: config.enabled,
    dueNow: items.filter((i) => i.status === 'PENDING' && i.dueAt >= now),
    overdue: items.filter(
      (i) => i.status === 'OVERDUE' || (i.status === 'PENDING' && i.dueAt < now),
    ),
    completed: items.filter((i) => i.status === 'COMPLETED'),
    exempted: items.filter((i) => i.status === 'EXEMPTED'),
  }
}

/**
 * A single refresher prepared for taking. Deliberately strips the correct-answer
 * markers and solutions from the options: the teacher answers first, and only
 * then sees what was right, on the result screen.
 */
export async function getMyRefresherForTaking(ctx: AppContext, id: string) {
  ctx.require('teacher_refresh.take')
  const teacher = await currentTeacher(ctx)

  const assessment = await ctx.db.teacherRefreshAssessment.findFirst({
    where: { id, teacherId: teacher.id },
    include: {
      classSubject: {
        select: {
          subject: { select: { name: true } },
          classLevel: { select: { name: true } },
        },
      },
      questions: {
        orderBy: { position: 'asc' },
        include: {
          question: {
            select: {
              id: true,
              text: true,
              type: true,
              options: { orderBy: { position: 'asc' }, select: { text: true } },
            },
          },
        },
      },
    },
  })
  if (!assessment) throw notFound('Refresher')

  const config = await resolveConfig(ctx)
  const attemptsUsed = await ctx.db.teacherRefreshAttempt.count({
    where: { assessmentId: id, submittedAt: { not: null } },
  })

  return {
    id: assessment.id,
    type: assessment.type,
    status: assessment.status,
    dueAt: assessment.dueAt,
    subjectLabel: assessment.classSubject.subject.name,
    className: assessment.classSubject.classLevel.name,
    attemptsUsed,
    maxAttempts: config.maxAttempts,
    questions: assessment.questions.map((rq) => ({
      refreshQuestionId: rq.id,
      position: rq.position,
      text: rq.question.text,
      type: rq.question.type,
      options: rq.question.options.map((o, index) => ({ index, text: o.text })),
    })),
  }
}

/**
 * Grades a submitted refresher, records the attempt, updates the teacher's
 * topic-level knowledge profile, and returns supportive, learning-oriented
 * feedback. Enforces the school's max-attempts and threshold rules.
 */
export async function submitMyRefresher(
  ctx: AppContext,
  id: string,
  input: SubmitRefresherInput,
) {
  ctx.require('teacher_refresh.take')
  const teacher = await currentTeacher(ctx)
  const config = await resolveConfig(ctx)

  const assessment = await ctx.db.teacherRefreshAssessment.findFirst({
    where: { id, teacherId: teacher.id },
    include: {
      questions: {
        orderBy: { position: 'asc' },
        include: {
          question: {
            select: {
              id: true,
              text: true,
              solution: true,
              marks: true,
              options: { orderBy: { position: 'asc' }, select: { isCorrect: true } },
              topics: { select: { topic: { select: { id: true, name: true } } } },
            },
          },
        },
      },
    },
  })
  if (!assessment) throw notFound('Refresher')

  if (assessment.status === 'EXEMPTED') {
    throw conflict('You have been exempted from this refresher.')
  }

  const attemptsUsed = await ctx.db.teacherRefreshAttempt.count({
    where: { assessmentId: id, submittedAt: { not: null } },
  })
  if (attemptsUsed >= config.maxAttempts) {
    throw conflict('You have used all attempts for this refresher.')
  }

  // Grade (pure).
  const gradeQuestions: GradeQuestion[] = assessment.questions.map((rq) => ({
    refreshQuestionId: rq.id,
    marks: rq.question.marks ?? 1,
    options: rq.question.options.map((o) => ({ isCorrect: o.isCorrect })),
    topicIds: rq.question.topics.map((t) => t.topic.id),
  }))
  const graded = gradeAnswers(gradeQuestions, input.answers)
  const readiness = readinessFromPercent(graded.percent, config.passingThreshold)
  const topicScores = computeTopicBreakdown(graded.perQuestion)

  const topicNames = new Map<string, string>()
  for (const rq of assessment.questions) {
    for (const t of rq.question.topics) topicNames.set(t.topic.id, t.topic.name)
  }

  const enrichedBreakdown = topicScores.map((t) => ({
    topicId: t.topicId,
    name: topicNames.get(t.topicId) ?? 'Topic',
    correct: t.correct,
    total: t.total,
    percent: t.percent,
    proficiency: proficiencyFromPercent(t.percent),
  }))

  const strengths = enrichedBreakdown.filter((t) => t.percent >= 85).map((t) => t.name)
  const toRefresh = enrichedBreakdown.filter((t) => t.percent < config.passingThreshold).map((t) => t.name)

  // Supportive "2-Minute Refresh" note. AI when available; a friendly static
  // note otherwise, so the feature never depends on the model being reachable.
  const incorrect = assessment.questions.filter((rq) => {
    const g = graded.perQuestion.find((p) => p.refreshQuestionId === rq.id)
    return g ? !g.isCorrect : false
  })
  const { note, generatedByAi } = await buildRefreshNote(ctx, incorrect, readiness.level)

  const now = new Date()
  const attemptsAfter = attemptsUsed + 1
  const completed = readiness.passed || attemptsAfter >= config.maxAttempts

  // Read existing profile history before the write, so we can append a trend point.
  const existingProfiles = await ctx.db.teacherKnowledgeProfile.findMany({
    where: { teacherId: teacher.id, topicId: { in: enrichedBreakdown.map((t) => t.topicId) } },
    select: { topicId: true, history: true },
  })
  const historyByTopic = new Map(existingProfiles.map((p) => [p.topicId, p.history]))

  const feedbackPayload = {
    note,
    generatedByAi,
    readiness: { level: readiness.level, label: readiness.label, headline: readiness.headline },
    strengths,
    toRefresh,
  }

  const attempt = await ctx.db.teacherRefreshAttempt.create({
    data: {
      tenantId: ctx.tenant.id,
      assessmentId: id,
      teacherId: teacher.id,
      startedAt: now,
      submittedAt: now,
      score: graded.score,
      maxScore: graded.maxScore,
      topicBreakdown: enrichedBreakdown as never,
      feedback: feedbackPayload as never,
      answers: {
        create: graded.perQuestion.map((p) => ({
          tenantId: ctx.tenant.id,
          refreshQuestionId: p.refreshQuestionId,
          selectedIndexes: (input.answers.find((a) => a.refreshQuestionId === p.refreshQuestionId)
            ?.selectedIndexes ?? []) as never,
          isCorrect: p.isCorrect,
        })),
      },
    },
    select: { id: true },
  })

  if (completed) {
    await ctx.db.teacherRefreshAssessment.update({
      where: { id },
      data: { status: 'COMPLETED' },
    })
  }

  // Update the teacher's topic-level knowledge profile.
  for (const t of enrichedBreakdown) {
    const point: HistoryPoint = {
      at: now.toISOString(),
      percent: t.percent,
      proficiency: t.proficiency,
    }
    const history = mergeHistory(historyByTopic.get(t.topicId), point)
    await ctx.db.teacherKnowledgeProfile.upsert({
      where: { tenantId_teacherId_topicId: { tenantId: ctx.tenant.id, teacherId: teacher.id, topicId: t.topicId } },
      create: {
        tenantId: ctx.tenant.id,
        teacherId: teacher.id,
        topicId: t.topicId,
        proficiency: t.proficiency,
        lastTestedAt: now,
        history: history as never,
      },
      update: {
        proficiency: t.proficiency,
        lastTestedAt: now,
        history: history as never,
      },
    })
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'teacher_refresh.submit',
    module: 'teacher_refresh',
    entityType: 'TeacherRefreshAttempt',
    entityId: attempt.id,
    summary: `Completed a ${assessment.type.toLowerCase()} refresher (${graded.percent}%)`,
  })

  return {
    attemptId: attempt.id,
    score: graded.score,
    maxScore: graded.maxScore,
    percent: graded.percent,
    correctCount: graded.correctCount,
    readiness: { level: readiness.level, label: readiness.label, headline: readiness.headline },
    passed: readiness.passed,
    canRetake: !readiness.passed && attemptsAfter < config.maxAttempts,
    attemptsUsed: attemptsAfter,
    maxAttempts: config.maxAttempts,
    topicBreakdown: enrichedBreakdown,
    strengths,
    toRefresh,
    note,
    generatedByAi,
  }
}

/**
 * On-demand refresher for the signed-in teacher — powers "Before You Teach"
 * (pre-lecture) and any manual "refresh me now" action. The teacher may only
 * name a subject they teach; `composeRefresher` re-checks that.
 */
export async function composeForCurrentTeacher(ctx: AppContext, input: ComposeRefresherInput) {
  ctx.require('teacher_refresh.take')
  const teacher = await currentTeacher(ctx)
  const config = await resolveConfig(ctx)

  if (input.type === TeacherRefreshType.PRE_LECTURE && !config.preLectureEnabled) {
    throw conflict('Pre-lecture refreshers are switched off for your school.')
  }

  const count =
    input.count ??
    (input.type === TeacherRefreshType.PRE_LECTURE ? config.preLectureCount : config.weeklyQuestionCount)

  const result = await composeRefresher(ctx, {
    teacherId: teacher.id,
    classSubjectId: input.classSubjectId,
    type: input.type,
    topicIds: input.topicIds,
    count,
    completionWindowHours: config.completionWindowHours,
    allowAi: true,
  })

  if (!result) {
    throw new ApiException(
      409,
      'NO_REFRESH_CONTENT',
      'There are no questions available for these topics yet.',
    )
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'teacher_refresh.compose',
    module: 'teacher_refresh',
    entityType: 'TeacherRefreshAssessment',
    entityId: result.assessmentId,
    summary: `Created a ${input.type.toLowerCase()} refresher (${result.questionCount} questions)`,
  })

  return result
}

/** The teacher's topic-level knowledge profile, for the dashboard trend. */
export async function getMyKnowledgeProfile(ctx: AppContext) {
  ctx.require('teacher_refresh.view_self')
  const teacher = await currentTeacher(ctx)

  const rows = await ctx.db.teacherKnowledgeProfile.findMany({
    where: { teacherId: teacher.id },
    orderBy: { lastTestedAt: 'desc' },
    take: 100,
    include: {
      topic: {
        select: {
          name: true,
          chapter: {
            select: {
              name: true,
              curriculum: {
                select: { classSubject: { select: { subject: { select: { name: true } } } } },
              },
            },
          },
        },
      },
    },
  })

  return rows.map((r) => ({
    topicId: r.topicId,
    topicName: r.topic.name,
    chapterName: r.topic.chapter.name,
    subjectName: r.topic.chapter.curriculum.classSubject.subject.name,
    proficiency: r.proficiency,
    lastTestedAt: r.lastTestedAt,
  }))
}

export type TeachingSubjectOption = {
  classSubjectId: string
  subjectName: string
  className: string
  topics: { id: string; name: string; chapterName: string }[]
}

/**
 * The subjects the signed-in teacher actually teaches, each with its published
 * topics — the picker behind "Before You Teach".
 *
 * The source of truth is the teaching assignment: a teacher can only ever ask for
 * a refresher on a subject that is theirs, because that is the only thing this
 * query returns. A school with no active session (still onboarding) gets its
 * subjects with empty topic lists rather than an error — the teacher can still
 * refresh the whole subject, and the dashboard does not fall over.
 */
export async function listMyTeachingSubjects(ctx: AppContext): Promise<TeachingSubjectOption[]> {
  ctx.require('teacher_refresh.take')
  const teacher = await currentTeacher(ctx)

  const classSubjects = await ctx.db.classSubject.findMany({
    where: { teacherId: teacher.id },
    orderBy: [{ classLevel: { name: 'asc' } }, { subject: { name: 'asc' } }],
    take: 100,
    select: {
      id: true,
      subject: { select: { name: true } },
      classLevel: { select: { name: true } },
    },
  })
  if (classSubjects.length === 0) return []

  const session = await ctx.db.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  })

  const topicsByCs = new Map<string, { id: string; name: string; chapterName: string }[]>()
  if (session) {
    const topics = await ctx.db.topic.findMany({
      where: {
        deletedAt: null,
        chapter: {
          deletedAt: null,
          curriculum: {
            classSubjectId: { in: classSubjects.map((c) => c.id) },
            sessionId: session.id,
            isPublished: true,
            deletedAt: null,
          },
        },
      },
      orderBy: [{ chapter: { position: 'asc' } }, { position: 'asc' }],
      take: 2000,
      select: {
        id: true,
        name: true,
        chapter: {
          select: { name: true, curriculum: { select: { classSubjectId: true } } },
        },
      },
    })
    for (const t of topics) {
      const csId = t.chapter.curriculum.classSubjectId
      const list = topicsByCs.get(csId) ?? []
      list.push({ id: t.id, name: t.name, chapterName: t.chapter.name })
      topicsByCs.set(csId, list)
    }
  }

  return classSubjects.map((c) => ({
    classSubjectId: c.id,
    subjectName: c.subject.name,
    className: c.classLevel.name,
    topics: topicsByCs.get(c.id) ?? [],
  }))
}

/* -------------------------------------------------------------------------- */
/* Oversight read (principal / admin / department head)                       */
/* -------------------------------------------------------------------------- */

export type OversightAssessment = {
  id: string
  type: string
  status: string
  scheduledAt: string | null
  dueAt: string
  questionCount: number
  latestPercent: number | null
  readinessLabel: string | null
}
export type TeacherReadinessDetail = {
  teacher: { id: string; name: string; department: string | null }
  assessments: OversightAssessment[]
}

/**
 * One teacher's refreshers, for an oversight role acting on their behalf —
 * extending a window or recording an exemption. This is INTERNAL professional-
 * development information: it is gated behind `view_department`, tenant-scoped
 * through `ctx.db`, and never surfaces raw answers or per-question detail, only
 * the same aggregate percentage a teacher sees on their own dashboard. It exists
 * so a principal can *support* a teacher, not to grade or rank them.
 */
export async function listTeacherReadiness(
  ctx: AppContext,
  teacherId: string,
): Promise<TeacherReadinessDetail> {
  ctx.require('teacher_refresh.view_department')

  const teacher = await ctx.db.staff.findFirst({
    where: { id: teacherId, staffType: 'TEACHING', deletedAt: null },
    select: { id: true, firstName: true, lastName: true, department: true },
  })
  if (!teacher) throw notFound('Teacher')

  const config = await resolveConfig(ctx)
  const assessments = await ctx.db.teacherRefreshAssessment.findMany({
    where: { teacherId: teacher.id },
    orderBy: [{ dueAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      type: true,
      status: true,
      scheduledAt: true,
      dueAt: true,
      _count: { select: { questions: true } },
      attempts: {
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { score: true, maxScore: true },
      },
    },
  })

  return {
    teacher: {
      id: teacher.id,
      name: `${teacher.firstName} ${teacher.lastName}`.trim(),
      department: teacher.department,
    },
    assessments: assessments.map((a) => {
      const attempt = a.attempts[0]
      const latestPercent =
        attempt && attempt.maxScore && attempt.maxScore > 0 && attempt.score != null
          ? Math.round((attempt.score / attempt.maxScore) * 1000) / 10
          : null
      return {
        id: a.id,
        type: a.type,
        status: a.status,
        scheduledAt: a.scheduledAt ? a.scheduledAt.toISOString() : null,
        dueAt: a.dueAt.toISOString(),
        questionCount: a._count.questions,
        latestPercent,
        readinessLabel:
          latestPercent == null
            ? null
            : readinessFromPercent(latestPercent, config.passingThreshold).label,
      }
    }),
  }
}

/* -------------------------------------------------------------------------- */
/* Oversight write actions (principal / admin)                                */
/* -------------------------------------------------------------------------- */
/** Exempts a teacher from a refresher, with a reason on record. */
export async function exemptRefresher(ctx: AppContext, id: string, reason: string) {
  ctx.require('teacher_refresh.manage')

  const assessment = await ctx.db.teacherRefreshAssessment.findFirst({
    where: { id },
    select: { id: true, status: true, teacherId: true },
  })
  if (!assessment) throw notFound('Refresher')
  if (assessment.status === 'COMPLETED') throw conflict('This refresher is already completed.')

  await ctx.db.teacherRefreshAssessment.update({ where: { id }, data: { status: 'EXEMPTED' } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'teacher_refresh.exempt',
    module: 'teacher_refresh',
    entityType: 'TeacherRefreshAssessment',
    entityId: id,
    summary: `Exempted a teacher from a refresher: ${reason}`,
  })

  return { id, status: 'EXEMPTED' as const }
}

/** Extends the completion window on a refresher by a number of hours. */
export async function extendRefresher(ctx: AppContext, id: string, hours: number) {
  ctx.require('teacher_refresh.manage')

  const assessment = await ctx.db.teacherRefreshAssessment.findFirst({
    where: { id },
    select: { id: true, dueAt: true, status: true },
  })
  if (!assessment) throw notFound('Refresher')

  const newDue = new Date(assessment.dueAt.getTime() + hours * 60 * 60 * 1000)
  await ctx.db.teacherRefreshAssessment.update({
    where: { id },
    // Re-open an overdue refresher when its window is extended.
    data: { dueAt: newDue, status: assessment.status === 'OVERDUE' ? 'PENDING' : assessment.status },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'teacher_refresh.extend',
    module: 'teacher_refresh',
    entityType: 'TeacherRefreshAssessment',
    entityId: id,
    summary: `Extended a refresher window by ${hours}h`,
  })

  return { id, dueAt: newDue }
}

/* -------------------------------------------------------------------------- */

async function buildRefreshNote(
  ctx: AppContext,
  incorrect: { question: { text: string; solution: string | null } }[],
  level: string,
): Promise<{ note: string; generatedByAi: boolean }> {
  if (incorrect.length === 0) {
    return {
      note:
        level === 'READY'
          ? 'Excellent — you were solid across the board. Nothing to refresh here.'
          : 'Nice work — you got everything right on this round.',
      generatedByAi: false,
    }
  }

  const staticNote =
    'A couple of points to revisit before your next lesson on this. Look back over the questions you missed and the correct answers shown below — they point to the concepts most worth a quick refresh.'

  if (!assistantConfigured() || !(await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST))) {
    return { note: staticNote, generatedByAi: false }
  }

  try {
    const model = assistantModel()
    const prompt = `A teacher has just completed a short knowledge refresher and missed these points:
${incorrect
  .map((rq) => `- ${rq.question.text}\n  Correct answer: ${rq.question.solution ?? 'see key'}`)
  .join('\n')}

Write a warm, encouraging "2-Minute Refresh" note (max 3 short paragraphs). Focus on the underlying concepts and the misconceptions students commonly hold about them. Address the teacher as a respected colleague refreshing their knowledge — never as someone who failed. Do not restate the questions verbatim.`

    const result = await model.turn({
      system: 'You are a supportive academic mentor helping a teacher refresh their subject knowledge. Be encouraging, concrete and concise.',
      turns: [{ role: 'user', text: prompt }],
      tools: [],
      onText: () => {},
    })
    const text = result.text?.trim()
    if (text) return { note: text, generatedByAi: true }
  } catch (err) {
    console.error('[teacher-refresh] refresh note generation failed', err)
  }

  return { note: staticNote, generatedByAi: false }
}
