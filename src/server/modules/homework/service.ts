import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { accessibleStudentIds } from '@/server/scope'
import { notify } from '@/server/notifications'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')

export const homeworkCreateSchema = z
  .object({
    classSubjectId: z.string().min(1, 'Select a subject'),
    sectionId: z.string().optional(),
    title: z.string().trim().min(3, 'Give the homework a title').max(160),
    instructions: z.string().trim().max(4000).optional(),
    assignedOn: isoDate,
    dueOn: isoDate,
    maxScore: z.coerce.number().min(0).max(1000).optional(),
    isPublished: z.coerce.boolean().default(true),
  })
  .refine((v) => attendanceDate(v.dueOn) >= attendanceDate(v.assignedOn), {
    path: ['dueOn'],
    message: 'The due date cannot be before the date it is assigned',
  })

export type HomeworkCreateInput = z.infer<typeof homeworkCreateSchema>

export const homeworkUpdateSchema = homeworkCreateSchema.innerType().partial()

export const submissionSchema = z.object({
  homeworkId: z.string().min(1),
  studentId: z.string().min(1),
  note: z.string().trim().max(2000).optional(),
})

export const reviewSchema = z.object({
  status: z.enum(['REVIEWED', 'REDO']),
  score: z.coerce.number().min(0).max(1000).optional(),
  teacherComment: z.string().trim().max(1000).optional(),
})

export const homeworkFilterSchema = z.object({
  classLevelId: z.string().optional(),
  sectionId: z.string().optional(),
  subjectId: z.string().optional(),
  status: z.enum(['upcoming', 'overdue', 'all']).optional(),
})

export const HOMEWORK_SORT_FIELDS = ['dueOn', 'assignedOn', 'title'] as const

export type HomeworkRow = {
  id: string
  title: string
  subject: string
  className: string
  sectionName: string | null
  teacher: string
  assignedOn: Date
  dueOn: Date
  isPublished: boolean
  maxScore: number | null
  attachmentCount: number
  expected: number
  submitted: number
  reviewed: number
  /** For a student or parent view: this child's own submission state. */
  mySubmission: { status: string; score: number | null; submittedAt: Date | null } | null
  isOverdue: boolean
}

/**
 * Lists homework.
 *
 * Staff see it as a workload: how many of the class have handed in. Students
 * and parents see the same rows narrowed to their own classes, carrying their
 * own submission state instead of the class totals.
 */
export async function listHomework(
  ctx: AppContext,
  query: ListQuery,
  filter: z.infer<typeof homeworkFilterSchema>,
): Promise<{ rows: HomeworkRow[]; total: number }> {
  ctx.require('homework.view')

  const ownStudentIds = await accessibleStudentIds(ctx)
  const isSelfScoped = ownStudentIds !== null
  const today = attendanceDate(new Date())

  const where: Prisma.HomeworkWhereInput = {
    deletedAt: null,
    // A student never sees a draft, and only sees their own classes.
    ...(isSelfScoped
      ? {
          isPublished: true,
          classLevel: {
            enrollments: {
              some: { studentId: { in: ownStudentIds }, isCurrent: true },
            },
          },
        }
      : {}),
    ...(filter.classLevelId ? { classLevelId: filter.classLevelId } : {}),
    ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
    ...(filter.subjectId ? { classSubject: { subjectId: filter.subjectId } } : {}),
    ...(filter.status === 'upcoming' ? { dueOn: { gte: today } } : {}),
    ...(filter.status === 'overdue' ? { dueOn: { lt: today } } : {}),
    ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
  }

  const orderBy = orderByFrom(query.sort, query.dir, HOMEWORK_SORT_FIELDS, { dueOn: 'desc' })

  const [rows, total] = await Promise.all([
    ctx.db.homework.findMany({
      where,
      orderBy,
      ...skipTake(query),
      select: {
        id: true,
        title: true,
        assignedOn: true,
        dueOn: true,
        isPublished: true,
        maxScore: true,
        classLevel: { select: { id: true, name: true } },
        section: { select: { name: true } },
        classSubject: { select: { subject: { select: { name: true } } } },
        teacher: { select: { firstName: true, lastName: true } },
        _count: { select: { attachments: true } },
        submissions: {
          where: isSelfScoped ? { studentId: { in: ownStudentIds } } : undefined,
          select: { status: true, score: true, submittedAt: true, studentId: true },
        },
      },
    }),
    ctx.db.homework.count({ where }),
  ])

  // Expected head-counts only matter to staff, so they are not computed for
  // the portal view.
  const expectedBySection = isSelfScoped
    ? new Map<string, number>()
    : await expectedCounts(ctx, rows.map((r) => ({ classLevelId: r.classLevel.id })))

  return {
    total,
    rows: rows.map((h) => {
      const mine = isSelfScoped ? h.submissions[0] : undefined
      const submitted = h.submissions.filter(
        (s) => s.status === 'SUBMITTED' || s.status === 'REVIEWED' || s.status === 'LATE',
      ).length

      return {
        id: h.id,
        title: h.title,
        subject: h.classSubject.subject.name,
        className: h.classLevel.name,
        sectionName: h.section?.name ?? null,
        teacher: `${h.teacher.firstName} ${h.teacher.lastName}`,
        assignedOn: h.assignedOn,
        dueOn: h.dueOn,
        isPublished: h.isPublished,
        maxScore: h.maxScore,
        attachmentCount: h._count.attachments,
        expected: expectedBySection.get(h.classLevel.id) ?? 0,
        submitted: isSelfScoped ? 0 : submitted,
        reviewed: isSelfScoped ? 0 : h.submissions.filter((s) => s.status === 'REVIEWED').length,
        mySubmission: mine
          ? { status: mine.status, score: mine.score, submittedAt: mine.submittedAt }
          : isSelfScoped
            ? { status: 'PENDING', score: null, submittedAt: null }
            : null,
        isOverdue: h.dueOn < today,
      }
    }),
  }
}

async function expectedCounts(
  ctx: AppContext,
  rows: { classLevelId: string }[],
): Promise<Map<string, number>> {
  const ids = [...new Set(rows.map((r) => r.classLevelId))]
  if (ids.length === 0) return new Map()

  const grouped = await ctx.db.enrollment.groupBy({
    by: ['classLevelId'],
    where: { classLevelId: { in: ids }, isCurrent: true },
    _count: { _all: true },
  })
  return new Map(grouped.map((g) => [g.classLevelId, g._count._all]))
}

export async function getHomework(ctx: AppContext, id: string) {
  ctx.require('homework.view')

  const homework = await ctx.db.homework.findFirst({
    where: { id, deletedAt: null },
    include: {
      classLevel: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      classSubject: { select: { subject: { select: { name: true } } } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
      attachments: true,
    },
  })
  if (!homework) throw notFound('Homework')

  const ownStudentIds = await accessibleStudentIds(ctx)

  // A reviewer sees the whole class; a student or parent sees only their own.
  const submissions = await ctx.db.homeworkSubmission.findMany({
    where: {
      homeworkId: id,
      ...(ownStudentIds === null ? {} : { studentId: { in: ownStudentIds } }),
    },
    include: {
      student: {
        select: { id: true, firstName: true, lastName: true, admissionNo: true },
      },
      attachments: true,
    },
    orderBy: { student: { firstName: 'asc' } },
  })

  // For staff, list students who have not handed in at all.
  const pending =
    ownStudentIds === null
      ? await ctx.db.enrollment.findMany({
          where: {
            classLevelId: homework.classLevelId,
            ...(homework.sectionId ? { sectionId: homework.sectionId } : {}),
            isCurrent: true,
            student: {
              deletedAt: null,
              homeworkSubmissions: { none: { homeworkId: id } },
            },
          },
          select: {
            rollNumber: true,
            student: {
              select: { id: true, firstName: true, lastName: true, admissionNo: true },
            },
          },
          orderBy: { rollNumber: 'asc' },
        })
      : []

  return { homework, submissions, pending }
}

/** Verifies the acting user teaches this subject, unless they are school-wide staff. */
async function resolveTeacher(ctx: AppContext, classSubjectId: string) {
  const classSubject = await ctx.db.classSubject.findFirst({
    where: { id: classSubjectId },
    select: { id: true, classLevelId: true, teacherId: true },
  })
  if (!classSubject) throw notFound('Subject assignment')

  const me = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: { id: true },
  })

  const schoolWide = ctx.can('academics.manage')
  if (!schoolWide && (!me || classSubject.teacherId !== me.id)) {
    throw new ApiException(
      403,
      'FORBIDDEN',
      'You can only set homework for subjects you teach',
    )
  }

  const teacherId = classSubject.teacherId ?? me?.id
  if (!teacherId) {
    throw conflict('This subject has no teacher assigned yet')
  }
  return { classSubject, teacherId }
}

export async function createHomework(ctx: AppContext, input: HomeworkCreateInput) {
  ctx.require('homework.create')

  const { classSubject, teacherId } = await resolveTeacher(ctx, input.classSubjectId)

  if (input.sectionId) {
    const section = await ctx.db.section.findFirst({
      where: { id: input.sectionId, classLevelId: classSubject.classLevelId },
      select: { id: true },
    })
    if (!section) {
      throw new ApiException(
        400,
        'BAD_REQUEST',
        'That section does not belong to the subject class',
      )
    }
  }

  const created = await ctx.db.homework.create({
    data: {
      tenantId: ctx.tenant.id,
      classLevelId: classSubject.classLevelId,
      sectionId: input.sectionId || null,
      classSubjectId: input.classSubjectId,
      teacherId,
      title: input.title,
      instructions: input.instructions,
      assignedOn: attendanceDate(input.assignedOn),
      dueOn: attendanceDate(input.dueOn),
      maxScore: input.maxScore,
      isPublished: input.isPublished,
    },
    include: {
      classLevel: { select: { name: true } },
      section: { select: { name: true } },
      classSubject: { select: { subject: { select: { name: true } } } },
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'homework.create',
    module: 'homework',
    entityType: 'Homework',
    entityId: created.id,
    summary: `Set "${created.title}" for ${created.classLevel.name}${created.section ? ` ${created.section.name}` : ''}, due ${input.dueOn}`,
    after: created,
  })

  if (input.isPublished) await notifyClass(ctx, created.id)

  return created
}

/** Notifies the guardians and students of the class the homework was set for. */
async function notifyClass(ctx: AppContext, homeworkId: string) {
  const homework = await ctx.db.homework.findFirst({
    where: { id: homeworkId },
    select: {
      title: true,
      dueOn: true,
      classLevelId: true,
      sectionId: true,
      classSubject: { select: { subject: { select: { name: true } } } },
    },
  })
  if (!homework) return

  const enrollments = await ctx.db.enrollment.findMany({
    where: {
      classLevelId: homework.classLevelId,
      ...(homework.sectionId ? { sectionId: homework.sectionId } : {}),
      isCurrent: true,
    },
    select: {
      student: {
        select: {
          userId: true,
          guardians: { select: { parent: { select: { userId: true } } } },
        },
      },
    },
  })

  const userIds = enrollments.flatMap((e) => [
    e.student.userId,
    ...e.student.guardians.map((g) => g.parent.userId),
  ])

  await notify(ctx, {
    userIds: userIds.filter((id): id is string => !!id),
    eventKey: 'homework.assigned',
    title: `New homework: ${homework.classSubject.subject.name}`,
    body: `${homework.title} — due ${toDateInput(homework.dueOn)}.`,
    linkUrl: `/academics/homework/${homeworkId}`,
  })
}

export async function updateHomework(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof homeworkUpdateSchema>,
) {
  ctx.require('homework.edit')

  const before = await ctx.db.homework.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Homework')
  await assertOwnHomework(ctx, before.teacherId)

  const updated = await ctx.db.homework.update({
    where: { id },
    data: {
      title: input.title,
      instructions: input.instructions,
      maxScore: input.maxScore,
      isPublished: input.isPublished,
      ...(input.assignedOn ? { assignedOn: attendanceDate(input.assignedOn) } : {}),
      ...(input.dueOn ? { dueOn: attendanceDate(input.dueOn) } : {}),
      ...(input.sectionId !== undefined ? { sectionId: input.sectionId || null } : {}),
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'homework.update',
    module: 'homework',
    entityType: 'Homework',
    entityId: id,
    summary: `Updated homework "${updated.title}"`,
    before,
    after: updated,
  })

  // Publishing a draft is the moment the class should hear about it.
  if (!before.isPublished && updated.isPublished) await notifyClass(ctx, id)

  return updated
}

async function assertOwnHomework(ctx: AppContext, teacherId: string) {
  if (ctx.can('academics.manage')) return
  const me = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId },
    select: { id: true },
  })
  if (!me || me.id !== teacherId) {
    throw new ApiException(403, 'FORBIDDEN', 'You can only change homework you set')
  }
}

export async function deleteHomework(ctx: AppContext, id: string) {
  ctx.require('homework.delete')
  const before = await ctx.db.homework.findFirst({ where: { id, deletedAt: null } })
  if (!before) throw notFound('Homework')
  await assertOwnHomework(ctx, before.teacherId)

  await ctx.db.homework.update({ where: { id }, data: { deletedAt: new Date() } })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'homework.delete',
    module: 'homework',
    entityType: 'Homework',
    entityId: id,
    summary: `Deleted homework "${before.title}"`,
    before,
  })
  return { ok: true }
}

/**
 * Records a submission.
 *
 * Handing in after the due date is recorded as LATE rather than refused — the
 * school decides what to do about lateness, the software just tells the truth.
 */
export async function submitHomework(
  ctx: AppContext,
  input: z.infer<typeof submissionSchema>,
) {
  ctx.require('homework.submit')

  const allowed = await accessibleStudentIds(ctx)
  if (allowed !== null && !allowed.includes(input.studentId)) {
    throw new ApiException(403, 'FORBIDDEN', 'You cannot submit for this student')
  }

  const homework = await ctx.db.homework.findFirst({
    where: { id: input.homeworkId, deletedAt: null, isPublished: true },
    select: { id: true, dueOn: true, title: true, classLevelId: true },
  })
  if (!homework) throw notFound('Homework')

  const enrolled = await ctx.db.enrollment.findFirst({
    where: { studentId: input.studentId, classLevelId: homework.classLevelId, isCurrent: true },
    select: { id: true },
  })
  if (!enrolled) throw conflict('This student is not in the class this homework was set for')

  const existing = await ctx.db.homeworkSubmission.findFirst({
    where: { homeworkId: input.homeworkId, studentId: input.studentId },
    select: { id: true, status: true },
  })
  if (existing && (existing.status === 'REVIEWED' || existing.status === 'SUBMITTED')) {
    throw conflict('This homework has already been handed in')
  }

  const now = new Date()
  const isLate = attendanceDate(now) > attendanceDate(homework.dueOn)

  const submission = await ctx.db.homeworkSubmission.upsert({
    where: {
      tenantId_homeworkId_studentId: {
        tenantId: ctx.tenant.id,
        homeworkId: input.homeworkId,
        studentId: input.studentId,
      },
    },
    create: {
      tenantId: ctx.tenant.id,
      homeworkId: input.homeworkId,
      studentId: input.studentId,
      status: isLate ? 'LATE' : 'SUBMITTED',
      submittedAt: now,
      note: input.note,
    },
    update: {
      status: isLate ? 'LATE' : 'SUBMITTED',
      submittedAt: now,
      note: input.note,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'homework.submit',
    module: 'homework',
    entityType: 'HomeworkSubmission',
    entityId: submission.id,
    summary: `Handed in "${homework.title}"${isLate ? ' (late)' : ''}`,
  })

  return submission
}

export async function reviewSubmission(
  ctx: AppContext,
  submissionId: string,
  input: z.infer<typeof reviewSchema>,
) {
  ctx.require('homework.review')

  const submission = await ctx.db.homeworkSubmission.findFirst({
    where: { id: submissionId },
    include: {
      homework: { select: { title: true, maxScore: true, teacherId: true } },
      student: {
        select: {
          firstName: true,
          lastName: true,
          userId: true,
          guardians: { select: { parent: { select: { userId: true } } } },
        },
      },
    },
  })
  if (!submission) throw notFound('Submission')
  await assertOwnHomework(ctx, submission.homework.teacherId)

  const max = submission.homework.maxScore
  if (input.score !== undefined && max !== null && input.score > max) {
    throw new ApiException(
      400,
      'BAD_REQUEST',
      `The score cannot be more than the maximum of ${max}`,
    )
  }

  const updated = await ctx.db.homeworkSubmission.update({
    where: { id: submissionId },
    data: {
      status: input.status,
      score: input.score,
      teacherComment: input.teacherComment,
      reviewedById: ctx.user.userId,
      reviewedAt: new Date(),
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'homework.review',
    module: 'homework',
    entityType: 'HomeworkSubmission',
    entityId: submissionId,
    summary: `Reviewed ${submission.student.firstName} ${submission.student.lastName} on "${submission.homework.title}"${input.score !== undefined ? ` — ${input.score}${max ? `/${max}` : ''}` : ''}`,
    before: { status: submission.status, score: submission.score },
    after: { status: input.status, score: input.score },
  })

  await notify(ctx, {
    userIds: [
      submission.student.userId,
      ...submission.student.guardians.map((g) => g.parent.userId),
    ].filter((id): id is string => !!id),
    eventKey: 'homework.reviewed',
    title: input.status === 'REDO' ? 'Homework needs redoing' : 'Homework reviewed',
    body: `"${submission.homework.title}"${input.score !== undefined ? ` — ${input.score}${max ? `/${max}` : ''}` : ''}${input.teacherComment ? `. ${input.teacherComment}` : ''}`,
    linkUrl: '/academics/homework',
  })

  return updated
}

/** Subjects the acting user may set homework for. */
export async function teachableSubjects(ctx: AppContext) {
  const schoolWide = ctx.can('academics.manage')
  const me = schoolWide
    ? null
    : await ctx.db.staff.findFirst({
        where: { userId: ctx.user.userId },
        select: { id: true },
      })

  return ctx.db.classSubject.findMany({
    where: {
      ...(schoolWide ? {} : { teacherId: me?.id ?? '__none__' }),
      classLevel: { deletedAt: null },
    },
    orderBy: [{ classLevel: { numeric: 'asc' } }, { subject: { name: 'asc' } }],
    select: {
      id: true,
      classLevelId: true,
      subject: { select: { name: true, code: true } },
      classLevel: {
        select: {
          id: true,
          name: true,
          sections: { where: { deletedAt: null }, select: { id: true, name: true } },
        },
      },
    },
  })
}
