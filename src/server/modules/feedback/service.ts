import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { notify } from '@/server/notifications'

const date = z.string().datetime().optional()
const ids = z.array(z.string().min(1)).max(100).default([])

const defaultQuestions = [
  ['The teacher explains concepts clearly.', 'Teaching clarity', 'RATING_5'],
  ['I understand what is being taught in class.', 'Teaching clarity', 'RATING_5'],
  ['The teacher allows students to ask questions.', 'Engagement', 'RATING_5'],
  ['The teacher helps when I do not understand something.', 'Support', 'RATING_5'],
  ['The pace of teaching is appropriate.', 'Engagement', 'RATING_5'],
  ['Classes are engaging.', 'Engagement', 'RATING_5'],
  ['The teacher treats students respectfully.', 'Respect', 'RATING_5'],
  ['The teacher gives useful feedback on my work.', 'Support', 'RATING_5'],
  ['I feel comfortable asking this teacher for help.', 'Support', 'RATING_5'],
  ['Overall, I am satisfied with my learning experience in this subject.', 'Overall experience', 'RATING_5'],
] as const

export const templateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  audience: z.enum(['STUDENT', 'PARENT', 'TEACHER']),
  target: z.enum(['TEACHER', 'SCHOOL', 'STUDENT', 'PTM']),
  isAnonymousToTarget: z.coerce.boolean().default(true),
  minimumResponses: z.coerce.number().int().min(1).max(100).default(5),
  classMinNumeric: z.coerce.number().int().min(0).max(20).optional(),
  classMaxNumeric: z.coerce.number().int().min(0).max(20).optional(),
  questions: z.array(z.object({
    label: z.string().trim().min(2).max(500), description: z.string().trim().max(500).optional(),
    type: z.enum(['RATING_5', 'RATING_10', 'YES_NO', 'MULTIPLE_CHOICE', 'CHECKBOX', 'EMOJI', 'NPS', 'SHORT_TEXT', 'LONG_TEXT', 'DROPDOWN']),
    category: z.string().trim().max(80).optional(), required: z.coerce.boolean().default(true),
    choices: z.array(z.string().trim().min(1).max(100)).max(20).optional(), isConcern: z.coerce.boolean().default(false),
  })).min(1).max(40),
})

export const campaignSchema = z.object({
  name: z.string().trim().min(2).max(120), templateId: z.string().min(1),
  frequency: z.enum(['ONE_TIME', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'TERM_WISE', 'CUSTOM']).default('FORTNIGHTLY'),
  startsAt: date, endsAt: date, classLevelIds: ids, sectionIds: ids, subjectIds: ids, teacherIds: ids, studentIds: ids,
  isAnonymousToTarget: z.coerce.boolean().default(true), minimumResponses: z.coerce.number().int().min(1).max(100).default(5),
}).superRefine((value, ctx) => { if (value.startsAt && value.endsAt && value.endsAt < value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'End must be after start' }) })

export const responseSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().min(1), rating: z.coerce.number().int().min(0).max(10).optional(), value: z.string().trim().max(3000).optional() })).min(1).max(40),
  concernDetail: z.string().trim().max(3000).optional(),
})

export const teacherStudentFeedbackSchema = z.object({
  studentId: z.string().min(1), subjectId: z.string().optional(), tags: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  performance: z.string().trim().max(1200).optional(), participation: z.string().trim().max(1200).optional(), homework: z.string().trim().max(1200).optional(), behaviour: z.string().trim().max(1200).optional(), strengths: z.string().trim().max(1200).optional(), improvement: z.string().trim().max(1200).optional(), actions: z.string().trim().max(1200).optional(), comment: z.string().trim().max(3000).optional(),
  visibility: z.enum(['TEACHER_ONLY', 'STUDENT', 'PARENT', 'STUDENT_AND_PARENT', 'COORDINATOR', 'ADMINISTRATION']).default('STUDENT_AND_PARENT'),
})

export const actionItemSchema = z.object({ responseId: z.string().optional(), title: z.string().trim().min(2).max(180), description: z.string().trim().max(3000).optional(), category: z.string().trim().max(100).optional(), assigneeStaffId: z.string().optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'), dueAt: date, internalNotes: z.string().trim().max(3000).optional() })

export async function ensureDefaultTemplate(ctx: AppContext) {
  ctx.require('feedback.template_manage')
  const existing = await ctx.db.feedbackTemplate.findFirst({ where: { name: 'Student teacher feedback', deletedAt: null } })
  if (existing) return existing
  return ctx.db.feedbackTemplate.create({ data: { tenantId: ctx.tenant.id, name: 'Student teacher feedback', audience: 'STUDENT', target: 'TEACHER', isAnonymousToTarget: true, minimumResponses: 5, createdById: ctx.user.userId, questions: { create: [...defaultQuestions.map(([label, category], sortOrder) => ({ tenantId: ctx.tenant.id, label, category, type: 'RATING_5' as const, sortOrder })), { tenantId: ctx.tenant.id, label: 'What do you like most about this teacher’s classes?', category: 'Appreciation', type: 'LONG_TEXT' as const, required: false, sortOrder: 10 }, { tenantId: ctx.tenant.id, label: 'What could make the classes better?', category: 'Suggestion', type: 'LONG_TEXT' as const, required: false, sortOrder: 11 }, { tenantId: ctx.tenant.id, label: 'Is there anything happening in this class that makes you uncomfortable or concerned?', category: 'Concern', type: 'YES_NO' as const, required: true, isConcern: true, sortOrder: 12 }] } } })
}

export async function listTemplates(ctx: AppContext) { ctx.require('feedback.template_manage'); return ctx.db.feedbackTemplate.findMany({ where: { deletedAt: null }, include: { _count: { select: { questions: true, campaigns: true } } }, orderBy: { updatedAt: 'desc' } }) }
export async function createTemplate(ctx: AppContext, input: z.infer<typeof templateSchema>) {
  ctx.require('feedback.template_manage')
  const created = await ctx.db.feedbackTemplate.create({ data: { tenantId: ctx.tenant.id, ...input, createdById: ctx.user.userId, questions: { create: input.questions.map((question, sortOrder) => ({ tenantId: ctx.tenant.id, ...question, choices: question.choices ?? undefined, sortOrder })) } }, include: { questions: true } })
  await record(ctx, 'feedback_template.create', 'FeedbackTemplate', created.id, `Created feedback template ${created.name}`, created)
  return created
}

export async function listCampaigns(ctx: AppContext) { ctx.require('feedback.campaign_manage'); return ctx.db.feedbackCampaign.findMany({ include: { template: { select: { name: true } }, _count: { select: { assignments: true } } }, orderBy: { createdAt: 'desc' } }) }
export async function createCampaign(ctx: AppContext, input: z.infer<typeof campaignSchema>) {
  ctx.require('feedback.campaign_manage')
  const template = await ctx.db.feedbackTemplate.findFirst({ where: { id: input.templateId, deletedAt: null } }); if (!template) throw notFound('Feedback template')
  const session = await ctx.db.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true } })
  const campaign = await ctx.db.feedbackCampaign.create({ data: { tenantId: ctx.tenant.id, templateId: template.id, sessionId: session?.id, name: input.name, audience: template.audience, target: template.target, frequency: input.frequency, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null, classLevelIds: input.classLevelIds, sectionIds: input.sectionIds, subjectIds: input.subjectIds, teacherIds: input.teacherIds, studentIds: input.studentIds, isAnonymousToTarget: input.isAnonymousToTarget, minimumResponses: input.minimumResponses, createdById: ctx.user.userId } })
  await record(ctx, 'feedback_campaign.create', 'FeedbackCampaign', campaign.id, `Created feedback campaign ${campaign.name}`, campaign)
  return campaign
}

export async function activateCampaign(ctx: AppContext, id: string) {
  ctx.require('feedback.campaign_manage')
  const campaign = await ctx.db.feedbackCampaign.findFirst({ where: { id }, include: { template: true } }); if (!campaign) throw notFound('Feedback campaign')
  // Already running: nothing new is created, but the caller still reads
  // `created`, and an undefined there reaches the user as 'undefined feedback
  // requests created'.
  if (campaign.status === 'ACTIVE') return { campaign, created: 0 }
  const periodKey = campaign.startsAt ? campaign.startsAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  let created = 0
  if (campaign.audience === 'STUDENT' && campaign.target === 'TEACHER') {
    const classIds = (campaign.classLevelIds as string[] | null) ?? []; const subjectIds = (campaign.subjectIds as string[] | null) ?? []; const teacherIds = (campaign.teacherIds as string[] | null) ?? []; const studentIds = (campaign.studentIds as string[] | null) ?? []
    const session = campaign.sessionId ? { sessionId: campaign.sessionId } : { isCurrent: true }
    const enrollments = await ctx.db.enrollment.findMany({ where: { isCurrent: true, ...(campaign.sessionId ? { sessionId: campaign.sessionId } : {}), ...(classIds.length ? { classLevelId: { in: classIds } } : {}), ...(studentIds.length ? { studentId: { in: studentIds } } : {}) }, select: { studentId: true, classLevelId: true, sectionId: true, student: { select: { userId: true } } } })
    for (const enrollment of enrollments) {
      if (!enrollment.student.userId) continue
      const teaching = await ctx.db.classSubject.findMany({ where: { classLevelId: enrollment.classLevelId, teacherId: { not: null }, ...(subjectIds.length ? { subjectId: { in: subjectIds } } : {}), ...(teacherIds.length ? { teacherId: { in: teacherIds } } : {}) }, select: { subjectId: true, teacherId: true } })
      for (const item of teaching) {
        const result = await ctx.db.feedbackAssignment.createMany({ data: [{ tenantId: ctx.tenant.id, campaignId: campaign.id, templateId: campaign.templateId, studentId: enrollment.studentId, targetStaffId: item.teacherId, subjectId: item.subjectId, classLevelId: enrollment.classLevelId, sectionId: enrollment.sectionId, periodKey, dueAt: campaign.endsAt }], skipDuplicates: true }); created += result.count
      }
    }
  }
  const updated = await ctx.db.feedbackCampaign.update({ where: { id: campaign.id }, data: { status: 'ACTIVE', startsAt: campaign.startsAt ?? new Date() } })
  await record(ctx, 'feedback_campaign.activate', 'FeedbackCampaign', campaign.id, `Activated ${campaign.name}; ${created} feedback requests created`, { created })
  return { campaign: updated, created }
}

export async function pendingForCurrentUser(ctx: AppContext) {
  ctx.require('feedback.submit')
  const [student, parent] = await Promise.all([ctx.db.student.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } }), ctx.db.parent.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } })])
  return ctx.db.feedbackAssignment.findMany({ where: { status: 'PENDING', OR: [{ studentId: student?.id ?? '__none__' }, { parentId: parent?.id ?? '__none__' }] }, include: { template: { include: { questions: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } }, targetStaff: { select: { firstName: true, lastName: true } }, subject: { select: { name: true } } }, orderBy: { createdAt: 'asc' } })
}

export async function submitResponse(ctx: AppContext, assignmentId: string, input: z.infer<typeof responseSchema>) {
  ctx.require('feedback.submit')
  const assignment = await ctx.db.feedbackAssignment.findFirst({ where: { id: assignmentId, status: 'PENDING' }, include: { template: { include: { questions: { where: { isActive: true } } } } } }); if (!assignment) throw notFound('Feedback request')
  const [student, parent] = await Promise.all([ctx.db.student.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } }), ctx.db.parent.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } })])
  if (assignment.studentId !== student?.id && assignment.parentId !== parent?.id) throw new ApiException(403, 'FORBIDDEN', 'This feedback request is not yours')
  const valid = new Map(assignment.template.questions.map((q) => [q.id, q])); const seen = new Set<string>()
  for (const answer of input.answers) { const question = valid.get(answer.questionId); if (!question || seen.has(answer.questionId)) throw new ApiException(400, 'BAD_REQUEST', 'An answer does not match this form'); seen.add(answer.questionId); if (question.type.startsWith('RATING') && (answer.rating === undefined || answer.rating < 1 || answer.rating > (question.type === 'RATING_10' ? 10 : 5))) throw new ApiException(400, 'BAD_REQUEST', 'Choose a valid rating') }
  for (const question of assignment.template.questions) if (question.required && !seen.has(question.id)) throw new ApiException(400, 'BAD_REQUEST', 'Please answer every required question')
  const concernSelected = input.answers.some((answer) => valid.get(answer.questionId)?.isConcern && answer.value === 'CONCERN')
  if (concernSelected && !input.concernDetail) throw new ApiException(400, 'BAD_REQUEST', 'Please describe your concern privately')
  const response = await ctx.db.$transaction(async (tx) => {
    const created = await tx.feedbackResponse.create({ data: { tenantId: ctx.tenant.id, assignmentId: assignment.id, respondentUserId: ctx.user.userId, studentId: student?.id, parentId: parent?.id, answers: { create: input.answers.map((answer) => ({ tenantId: ctx.tenant.id, questionId: answer.questionId, rating: answer.rating, value: answer.value })) } }, include: { answers: true } })
    // Free text is the only thing a human has to read before anyone else
    // does. Ratings carry no words to moderate, so queueing them would bury
    // the comments that actually need a decision.
    const textAnswers = created.answers.filter((answer) => (answer.value ?? '').trim().length > 0 && valid.get(answer.questionId)?.type.endsWith('TEXT'))
    if (textAnswers.length > 0) await tx.feedbackModeration.createMany({ data: textAnswers.map((answer) => ({ tenantId: ctx.tenant.id, answerId: answer.id })) })
    if (concernSelected) await tx.feedbackConcern.create({ data: { tenantId: ctx.tenant.id, responseId: created.id, detail: input.concernDetail! } })
    await tx.feedbackAssignment.update({ where: { id: assignment.id }, data: { status: 'SUBMITTED', submittedAt: new Date() } })
    return created
  }).catch((err: unknown) => { if ((err as { code?: string }).code === 'P2002') throw conflict('Feedback already submitted'); throw err })
  if (concernSelected) await notify(ctx, { userIds: await safeguardingUsers(ctx), eventKey: 'feedback.concern', title: 'Confidential feedback concern', body: 'A confidential student concern requires review.', linkUrl: '/feedback/concerns' })
  return response
}

export async function teacherInsights(ctx: AppContext) {
  ctx.require('feedback.teacher_view_own')
  const staff = await ctx.db.staff.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } }); if (!staff) throw new ApiException(403, 'FORBIDDEN', 'Only teaching staff have feedback insights')
  const assignments = await ctx.db.feedbackAssignment.findMany({ where: { targetStaffId: staff.id, status: 'SUBMITTED', campaign: { isAnonymousToTarget: true } }, include: { campaign: { select: { minimumResponses: true, name: true } }, responses: { include: { answers: { include: { question: { select: { category: true, type: true } } } } } } } })
  const responseCount = assignments.length; const minimum = Math.max(...assignments.map((a) => a.campaign.minimumResponses), 5)
  if (responseCount < minimum) return { available: false, responseCount, minimum, categories: [] as { name: string; average: number; count: number }[] }
  const grouped = new Map<string, number[]>(); for (const assignment of assignments) for (const response of assignment.responses) for (const answer of response.answers) if (answer.rating) { const key = answer.question.category ?? 'Overall'; grouped.set(key, [...(grouped.get(key) ?? []), answer.rating]) }
  const categories = [...grouped.entries()].map(([name, values]) => ({ name, average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10, count: values.length }))
  return { available: true, responseCount, minimum, categories }
}

export async function createTeacherStudentFeedback(ctx: AppContext, input: z.infer<typeof teacherStudentFeedbackSchema>) {
  ctx.require('feedback.teacher_give_student'); const teacher = await ctx.db.staff.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } }); if (!teacher) throw new ApiException(403, 'FORBIDDEN', 'Only staff can give student feedback')
  const enrollment = await ctx.db.enrollment.findFirst({ where: { studentId: input.studentId, isCurrent: true }, select: { classLevelId: true, sectionId: true, student: { select: { userId: true, guardians: { select: { parent: { select: { userId: true } } } } } } } }); if (!enrollment) throw notFound('Active student')
  if (input.subjectId) { const assignment = await ctx.db.classSubject.findFirst({ where: { classLevelId: enrollment.classLevelId, subjectId: input.subjectId, teacherId: teacher.id } }); if (!assignment) throw new ApiException(403, 'FORBIDDEN', 'You do not teach this subject to this student') }
  const created = await ctx.db.teacherStudentFeedback.create({ data: { tenantId: ctx.tenant.id, studentId: input.studentId, teacherId: teacher.id, subjectId: input.subjectId, classLevelId: enrollment.classLevelId, sectionId: enrollment.sectionId, tags: input.tags, performance: input.performance, participation: input.participation, homework: input.homework, behaviour: input.behaviour, strengths: input.strengths, improvement: input.improvement, actions: input.actions, comment: input.comment, visibility: input.visibility } })
  const recipients = [input.visibility === 'STUDENT' || input.visibility === 'STUDENT_AND_PARENT' ? enrollment.student.userId : undefined, ...(input.visibility === 'PARENT' || input.visibility === 'STUDENT_AND_PARENT' ? enrollment.student.guardians.map((g) => g.parent.userId) : [])].filter((id): id is string => !!id)
  await notify(ctx, { userIds: recipients, eventKey: 'feedback.student', title: 'New teacher feedback', body: 'Your teacher has shared feedback and recommended next steps.', linkUrl: '/feedback' })
  await record(ctx, 'teacher_student_feedback.create', 'TeacherStudentFeedback', created.id, 'Shared student feedback', created)
  return created
}

export async function listActionItems(ctx: AppContext) { ctx.require('feedback.action_manage'); return ctx.db.feedbackActionItem.findMany({ include: { assignee: { select: { firstName: true, lastName: true } }, response: { select: { id: true } } }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }) }
export async function createActionItem(ctx: AppContext, input: z.infer<typeof actionItemSchema>) { ctx.require('feedback.action_manage'); if (input.responseId && !(await ctx.db.feedbackResponse.findFirst({ where: { id: input.responseId } }))) throw notFound('Feedback response'); const created = await ctx.db.feedbackActionItem.create({ data: { tenantId: ctx.tenant.id, ...input, dueAt: input.dueAt ? new Date(input.dueAt) : null, createdById: ctx.user.userId } }); await record(ctx, 'feedback_action.create', 'FeedbackActionItem', created.id, `Created action item ${created.title}`, created); return created }
export async function listConcerns(ctx: AppContext) { ctx.require('feedback.concern_view'); return ctx.db.feedbackConcern.findMany({ include: { response: { include: { assignment: { include: { campaign: { select: { name: true } } } } } } }, orderBy: { createdAt: 'desc' } }) }

async function safeguardingUsers(ctx: AppContext) { const roles = await ctx.db.userRole.findMany({ where: { role: { key: { in: ['SCHOOL_ADMIN', 'PRINCIPAL'] } } }, select: { userId: true } }); return roles.map((r) => r.userId) }
async function record(ctx: AppContext, action: string, entityType: string, entityId: string, summary: string, after?: unknown) { await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.userId, actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`, action, module: 'feedback', entityType, entityId, summary, after: after as never }) }

/* ------------------------------------------------------------- moderation */

export const moderationSchema = z.object({
  answerId: z.string().min(1),
  status: z.enum(['APPROVED', 'FLAGGED', 'UNDER_REVIEW', 'HIDDEN', 'ESCALATED', 'RESOLVED']),
  flagReason: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
})

export const concernUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['NEW', 'UNDER_REVIEW', 'FOLLOW_UP_REQUIRED', 'RESOLVED', 'CLOSED']),
  note: z.string().trim().max(2000).optional(),
})

export const actionUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED']),
  assigneeStaffId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  internalNotes: z.string().trim().max(3000).optional(),
})

/**
 * The moderation queue: free-text feedback nobody has read yet.
 *
 * Ordered oldest first, because a comment left unread for a week is the one
 * that matters — a queue sorted newest-first quietly buries its own backlog.
 * Respondent identity is never selected: the point of anonymous feedback is
 * that the moderator judges the words, not the child who wrote them.
 */
export async function listModerationQueue(ctx: AppContext) {
  ctx.require('feedback.moderate')
  return ctx.db.feedbackModeration.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 200,
    include: {
      answer: {
        select: {
          id: true,
          value: true,
          rating: true,
          question: { select: { label: true, category: true, type: true } },
          response: {
            select: {
              id: true,
              submittedAt: true,
              assignment: {
                select: {
                  campaign: { select: { name: true, isAnonymousToTarget: true } },
                  targetStaff: { select: { firstName: true, lastName: true } },
                  subject: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  })
}

/** Counts for the tabs above the queue, so a moderator sees the backlog first. */
export async function moderationCounts(ctx: AppContext) {
  ctx.require('feedback.moderate')
  const rows = await ctx.db.feedbackModeration.groupBy({ by: ['status'], _count: { _all: true } })
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<string, number>
}

/**
 * Records a moderator's decision on one comment.
 *
 * Escalation notifies the safeguarding roles rather than merely changing a
 * label: a comment serious enough to escalate is one somebody has to be told
 * about today.
 */
export async function moderateAnswer(ctx: AppContext, input: z.infer<typeof moderationSchema>) {
  ctx.require('feedback.moderate')

  const existing = await ctx.db.feedbackModeration.findFirst({ where: { answerId: input.answerId } })
  if (!existing) throw notFound('Moderation record')

  const updated = await ctx.db.feedbackModeration.update({
    where: { id: existing.id },
    data: {
      status: input.status,
      flagReason: input.flagReason ?? null,
      note: input.note ?? null,
      reviewedBy: ctx.user.userId,
      reviewedAt: new Date(),
    },
  })

  if (input.status === 'ESCALATED') {
    await notify(ctx, {
      userIds: await safeguardingUsers(ctx),
      eventKey: 'feedback.moderation_escalated',
      title: 'Feedback escalated',
      body: input.flagReason || 'A moderator escalated a feedback comment for review.',
      linkUrl: '/feedback/moderation',
    })
  }

  await record(ctx, 'feedback_moderation.decide', 'FeedbackModeration', updated.id, `Marked a comment ${input.status.toLowerCase()}`, updated)
  return updated
}

/**
 * Moves a confidential concern along and records who is holding it.
 *
 * Resolving stamps the time so "how long do concerns sit open" is answerable
 * later; reopening clears it rather than leaving a resolution date on
 * something that is not resolved.
 */
export async function updateConcern(ctx: AppContext, input: z.infer<typeof concernUpdateSchema>) {
  ctx.require('feedback.concern_manage')

  const concern = await ctx.db.feedbackConcern.findFirst({ where: { id: input.id } })
  if (!concern) throw notFound('Concern')

  const resolved = input.status === 'RESOLVED' || input.status === 'CLOSED'
  const updated = await ctx.db.feedbackConcern.update({
    where: { id: input.id },
    data: {
      status: input.status,
      ownerId: ctx.user.userId,
      resolvedAt: resolved ? (concern.resolvedAt ?? new Date()) : null,
      ...(input.note ? { detail: `${concern.detail}\n\n— ${ctx.user.firstName} ${ctx.user.lastName}: ${input.note}` } : {}),
    },
  })

  await record(ctx, 'feedback_concern.update', 'FeedbackConcern', updated.id, `Concern marked ${input.status.toLowerCase().replace(/_/g, ' ')}`, updated)
  return updated
}

/** Reassigns or advances an action item. */
export async function updateActionItem(ctx: AppContext, input: z.infer<typeof actionUpdateSchema>) {
  ctx.require('feedback.action_manage')

  const existing = await ctx.db.feedbackActionItem.findFirst({ where: { id: input.id } })
  if (!existing) throw notFound('Action item')

  const updated = await ctx.db.feedbackActionItem.update({
    where: { id: input.id },
    data: {
      status: input.status,
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.assigneeStaffId !== undefined ? { assigneeStaffId: input.assigneeStaffId || null } : {}),
      ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes || null } : {}),
    },
  })

  await record(ctx, 'feedback_action.update', 'FeedbackActionItem', updated.id, `Action item marked ${input.status.toLowerCase().replace(/_/g, ' ')}`, updated)
  return updated
}
