import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { attendanceDate, toDateInput } from '@/lib/dates'
import {
  accessibleSectionIds,
  accessibleStudentIds,
  isPortalOnlyRole,
  teachingClassSubjectIds,
} from '@/server/scope'
import { notify } from '@/server/notifications'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'
import { HOMEWORK_DONE_MARKS, HOMEWORK_MARKS } from '@/lib/registers'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')

export const homeworkCreateSchema = z
  .object({
    classSubjectId: z.string().min(1, 'Select a subject'),
    sectionId: z.string().optional(),
    /** One homework is created per section; empty means the whole class. */
    sectionIds: z.array(z.string().min(1)).max(50).optional(),
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
  const isPortalScoped = isPortalOnlyRole(ctx.user.roleKeys)
  const ownSectionIds = isPortalScoped ? await accessibleSectionIds(ctx) : null
  const teachingSubjects = await teachingClassSubjectIds(ctx)
  const today = attendanceDate(new Date())

  const where: Prisma.HomeworkWhereInput = {
    deletedAt: null,
    ...(isPortalScoped && ownStudentIds !== null
      ? {
          isPublished: true,
          classLevel: {
            enrollments: {
              some: { studentId: { in: ownStudentIds }, isCurrent: true },
            },
          },
          OR: [
            { sectionId: null },
            { sectionId: { in: ownSectionIds ?? [] } },
          ],
        }
      : {}),
    ...(teachingSubjects !== null
      ? { classSubjectId: { in: teachingSubjects } }
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
          where: isPortalScoped && ownStudentIds !== null ? { studentId: { in: ownStudentIds } } : undefined,
          select: { status: true, score: true, submittedAt: true, studentId: true },
        },
      },
    }),
    ctx.db.homework.count({ where }),
  ])

  // Expected head-counts only matter to staff, so they are not computed for
  // the portal view.
  const expectedBySection = isPortalScoped && ownStudentIds !== null
    ? new Map<string, number>()
    : await expectedCounts(ctx, rows.map((r) => ({ classLevelId: r.classLevel.id })))

  const portalView = isPortalScoped && ownStudentIds !== null

  return {
    total,
    rows: rows.map((h) => {
      const mine = isPortalScoped && ownStudentIds !== null ? h.submissions[0] : undefined
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
        submitted: portalView ? 0 : submitted,
        reviewed: portalView ? 0 : h.submissions.filter((s) => s.status === 'REVIEWED').length,
        mySubmission: mine
          ? { status: mine.status, score: mine.score, submittedAt: mine.submittedAt }
          : portalView
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
  if (isPortalOnlyRole(ctx.user.roleKeys)) {
    const enrolled = await ctx.db.enrollment.findFirst({
      where: {
        studentId: { in: ownStudentIds ?? [] },
        classLevelId: homework.classLevelId,
        ...(homework.section?.id ? { sectionId: homework.section.id } : {}),
        isCurrent: true,
      },
      select: { id: true },
    })
    if (!homework.isPublished || !enrolled) throw notFound('Homework')
  }

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

  // The teacher's completion register: everyone in the class, marked or not.
  const submissionOf = new Map(submissions.map((s) => [s.studentId, s]))
  const roster =
    ownStudentIds === null
      ? (
          await ctx.db.enrollment.findMany({
            where: {
              classLevelId: homework.classLevelId,
              ...(homework.sectionId ? { sectionId: homework.sectionId } : {}),
              isCurrent: true,
              student: { deletedAt: null },
            },
            select: {
              rollNumber: true,
              section: { select: { name: true } },
              student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
            },
            orderBy: [{ section: { name: 'asc' } }, { rollNumber: 'asc' }],
          })
        ).map((e) => ({
          studentId: e.student.id,
          name: `${e.student.firstName} ${e.student.lastName}`.trim(),
          admissionNo: e.student.admissionNo,
          rollNumber: e.rollNumber,
          sectionName: e.section?.name ?? null,
          status: submissionOf.get(e.student.id)?.teacherMark ?? null,
          hint: submissionOf.get(e.student.id)?.submittedAt ? 'Handed in on the portal' : null,
        }))
      : []

  return { homework, submissions, pending, roster }
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
  const [first] = await createHomeworkForSections(ctx, input)
  return first!
}

/**
 * Sets the homework for each chosen section (or once for the whole class),
 * each with its own register, and returns every row created.
 */
export async function createHomeworkForSections(ctx: AppContext, input: HomeworkCreateInput) {
  ctx.require('homework.create')

  const { classSubject, teacherId } = await resolveTeacher(ctx, input.classSubjectId)

  const sectionIds = [...new Set(input.sectionIds?.length ? input.sectionIds : input.sectionId ? [input.sectionId] : [])]
  if (sectionIds.length > 0) {
    const found = await ctx.db.section.count({
      where: { id: { in: sectionIds }, classLevelId: classSubject.classLevelId },
    })
    if (found !== sectionIds.length) {
      throw new ApiException(
        400,
        'BAD_REQUEST',
        'A chosen section does not belong to the subject class',
      )
    }
  }

  const created = await ctx.db.$transaction(
    (sectionIds.length > 0 ? sectionIds : [null]).map((sectionId) =>
      ctx.db.homework.create({
        data: {
          tenantId: ctx.tenant.id,
          classLevelId: classSubject.classLevelId,
          sectionId,
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
      }),
    ),
  )

  for (const homework of created) {
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'homework.create',
      module: 'homework',
      entityType: 'Homework',
      entityId: homework.id,
      summary: `Set "${homework.title}" for ${homework.classLevel.name}${homework.section ? ` ${homework.section.name}` : ''}, due ${input.dueOn}`,
      after: homework,
    })
    if (input.isPublished) await notifyClass(ctx, homework.id)
  }

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
    select: { id: true, dueOn: true, title: true, classLevelId: true, sectionId: true },
  })
  if (!homework) throw notFound('Homework')

  const enrolled = await ctx.db.enrollment.findFirst({
    where: {
      studentId: input.studentId,
      classLevelId: homework.classLevelId,
      ...(homework.sectionId ? { sectionId: homework.sectionId } : {}),
      isCurrent: true,
    },
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

export const homeworkMarksSchema = z.object({
  entries: z
    .array(z.object({ studentId: z.string().min(1), mark: z.enum(HOMEWORK_MARKS).nullable() }))
    .max(500),
})

/**
 * The teacher's completion register, recorded without the student touching
 * the portal. Completed, partial and late work count as done (REVIEWED); the
 * other marks leave the row PENDING. Clearing a mark only touches rows the
 * register itself set, so a student's own hand-in and any review survive.
 */
export async function setHomeworkMarks(
  ctx: AppContext,
  homeworkId: string,
  input: z.infer<typeof homeworkMarksSchema>,
) {
  ctx.require('homework.review')

  const homework = await ctx.db.homework.findFirst({
    where: { id: homeworkId, deletedAt: null },
    select: { id: true, title: true, teacherId: true, classLevelId: true, sectionId: true },
  })
  if (!homework) throw notFound('Homework')
  await assertOwnHomework(ctx, homework.teacherId)

  const roster = await ctx.db.enrollment.findMany({
    where: {
      classLevelId: homework.classLevelId,
      ...(homework.sectionId ? { sectionId: homework.sectionId } : {}),
      isCurrent: true,
      student: { deletedAt: null },
    },
    select: { studentId: true },
  })
  const inClass = new Set(roster.map((r) => r.studentId))
  for (const e of input.entries) {
    if (!inClass.has(e.studentId)) throw conflict('A student in the list is not in the class this homework was set for')
  }

  const existing = await ctx.db.homeworkSubmission.findMany({
    where: { homeworkId },
    select: { studentId: true, status: true, teacherMark: true, submittedAt: true },
  })
  const rowOf = new Map(existing.map((s) => [s.studentId, s]))
  const now = new Date()

  const writes = input.entries.flatMap((e) => {
    const row = rowOf.get(e.studentId)
    if ((row?.teacherMark ?? null) === e.mark) return []
    if (e.mark === null) {
      if (!row) return []
      return [
        ctx.db.homeworkSubmission.update({
          where: { tenantId_homeworkId_studentId: { tenantId: ctx.tenant.id, homeworkId, studentId: e.studentId } },
          data: { teacherMark: null, status: row.submittedAt ? 'SUBMITTED' : 'PENDING', reviewedById: ctx.user.userId, reviewedAt: now },
        }),
      ]
    }
    const status = HOMEWORK_DONE_MARKS.includes(e.mark) ? ('REVIEWED' as const) : ('PENDING' as const)
    const data = { teacherMark: e.mark, status, reviewedById: ctx.user.userId, reviewedAt: now }
    return [
      ctx.db.homeworkSubmission.upsert({
        where: { tenantId_homeworkId_studentId: { tenantId: ctx.tenant.id, homeworkId, studentId: e.studentId } },
        create: { tenantId: ctx.tenant.id, homeworkId, studentId: e.studentId, ...data },
        update: data,
      }),
    ]
  })
  if (writes.length > 0) await ctx.db.$transaction(writes)

  const done = input.entries.filter((e) => e.mark !== null && HOMEWORK_DONE_MARKS.includes(e.mark)).length
  const marked = input.entries.filter((e) => e.mark !== null).length
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'homework.completion',
    module: 'homework',
    entityType: 'Homework',
    entityId: homeworkId,
    summary: `Marked ${marked} of ${inClass.size} on "${homework.title}" (${done} done)`,
  })

  return { done, marked, total: inClass.size }
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
