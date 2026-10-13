import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { CO_SCHOLASTIC_GRADES, parseHolistic, parseReportCardConfig } from '@/lib/exams/report-card-config'
import { getDefaultReportCardTemplate } from './report-templates'

const note = z.string().trim().max(120).nullable().optional()
const remark = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(600).nullable().optional())

export const holisticRowSchema = z.object({
  resultId: z.string().min(1).max(40),
  competencies: z.record(z.string().max(80), z.object({ score: z.number().int().min(0).max(5).nullable(), note })).default({}),
  coScholastic: z.record(z.string().max(80), z.object({ grade: z.enum(CO_SCHOLASTIC_GRADES).nullable(), note })).default({}),
  teacherRemark: remark,
  principalRemark: remark,
  promotionStatus: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(120).nullable().optional()),
})

export const holisticSaveSchema = z.object({
  examId: z.string().min(1).max(40),
  rows: z.array(holisticRowSchema).min(1).max(200),
})

/** Sections the caller may assess: all for administrators, own class-teacher sections otherwise. */
async function assessableSectionIds(ctx: AppContext): Promise<string[] | null> {
  if (ctx.can('exams.manage')) return null
  const staff = await ctx.db.staff.findFirst({ where: { userId: ctx.user.userId }, select: { id: true } })
  if (!staff) return []
  const sections = await ctx.db.section.findMany({ where: { classTeacherId: staff.id, deletedAt: null }, select: { id: true } })
  return sections.map((s) => s.id)
}

/** One row per student of a section for an exam, with Part 2 assessments. */
export async function holisticMatrix(ctx: AppContext, examId: string | undefined, sectionId: string | undefined) {
  ctx.require('exams.marks')
  const allowed = await assessableSectionIds(ctx)
  const template = await getDefaultReportCardTemplate(ctx)
  const config = parseReportCardConfig(template?.config)

  const exams = await ctx.db.exam.findMany({
    where: { status: { not: 'ARCHIVED' } },
    orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, name: true, sessionId: true, status: true, classes: { select: { classLevelId: true } } },
  })
  const exam = exams.find((e) => e.id === examId) ?? exams[0]
  const sections = exam
    ? await ctx.db.section.findMany({
        where: {
          deletedAt: null,
          classLevelId: { in: exam.classes.map((c) => c.classLevelId) },
          ...(allowed === null ? {} : { id: { in: allowed } }),
        },
        orderBy: [{ classLevel: { numeric: 'asc' } }, { name: 'asc' }],
        select: { id: true, name: true, classLevel: { select: { name: true } } },
      })
    : []
  const section = sections.find((s) => s.id === sectionId) ?? sections[0]

  const students = exam && section
    ? await ctx.db.enrollment.findMany({
        where: { sessionId: exam.sessionId, sectionId: section.id, isCurrent: true, student: { deletedAt: null } },
        orderBy: [{ rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
        select: { studentId: true, rollNumber: true, student: { select: { firstName: true, lastName: true, admissionNo: true } } },
      })
    : []
  const results = exam && students.length
    ? await ctx.db.result.findMany({
        where: { examId: exam.id, studentId: { in: students.map((s) => s.studentId) } },
        select: { id: true, studentId: true, percentage: true, grade: true, isPass: true, holistic: true, teacherRemark: true, principalRemark: true, promotionStatus: true, publishedAt: true },
      })
    : []
  const byStudent = new Map(results.map((r) => [r.studentId, r]))

  return {
    config,
    canPrincipal: ctx.can('exams.manage'),
    exams: exams.map((e) => ({ id: e.id, name: e.name })),
    exam: exam ? { id: exam.id, name: exam.name, status: exam.status } : null,
    sections: sections.map((s) => ({ id: s.id, label: `${s.classLevel.name} · ${s.name}` })),
    section: section ? { id: section.id, label: `${section.classLevel.name} · ${section.name}` } : null,
    rows: students.map((s) => {
      const result = byStudent.get(s.studentId)
      return {
        studentId: s.studentId,
        rollNumber: s.rollNumber,
        name: `${s.student.firstName} ${s.student.lastName}`.trim(),
        admissionNo: s.student.admissionNo,
        result: result
          ? {
              id: result.id,
              percentage: result.percentage,
              grade: result.grade,
              isPass: result.isPass,
              published: Boolean(result.publishedAt),
              holistic: parseHolistic(result.holistic),
              teacherRemark: result.teacherRemark ?? '',
              principalRemark: result.principalRemark ?? '',
              promotionStatus: result.promotionStatus ?? '',
            }
          : null,
      }
    }),
  }
}

/** Per-exam pipeline: sheets locked → results computed → Part 2 filled → published. */
export async function reportCardQueue(ctx: AppContext) {
  ctx.require('results.view')
  const exams = await ctx.db.exam.findMany({
    where: { status: { not: 'ARCHIVED' } },
    orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
    take: 30,
    select: {
      id: true,
      name: true,
      status: true,
      sessionId: true,
      publishedAt: true,
      classes: { select: { classLevelId: true } },
      subjects: { select: { marksStatus: true } },
    },
  })
  return Promise.all(
    exams.map(async (exam) => {
      const [students, results, holisticDone, published] = await Promise.all([
        ctx.db.enrollment.count({
          where: { sessionId: exam.sessionId, isCurrent: true, classLevelId: { in: exam.classes.map((c) => c.classLevelId) }, student: { deletedAt: null } },
        }),
        ctx.db.result.count({ where: { examId: exam.id } }),
        ctx.db.result.count({ where: { examId: exam.id, OR: [{ teacherRemark: { not: null } }, { promotionStatus: { not: null } }] } }),
        ctx.db.result.count({ where: { examId: exam.id, publishedAt: { not: null } } }),
      ])
      const papers = exam.subjects.length
      const locked = exam.subjects.filter((s) => s.marksStatus === 'LOCKED').length
      const stage =
        exam.status === 'PUBLISHED' ? 'Published'
          : results === 0 ? (locked === papers && papers > 0 ? 'Ready to compute' : 'Marks entry')
            : results < students ? 'Partially computed'
              : 'Ready to publish'
      return { id: exam.id, name: exam.name, status: exam.status, papers, locked, students, results, holisticDone, published, stage }
    }),
  )
}

export async function saveHolisticAssessment(ctx: AppContext, input: z.infer<typeof holisticSaveSchema>) {
  ctx.require('exams.marks')
  const allowed = await assessableSectionIds(ctx)
  const canPrincipal = ctx.can('exams.manage')
  const exam = await ctx.db.exam.findFirst({ where: { id: input.examId }, select: { id: true, name: true, sessionId: true } })
  if (!exam) throw notFound('Exam')
  const results = await ctx.db.result.findMany({
    where: { examId: exam.id, id: { in: input.rows.map((r) => r.resultId) } },
    select: {
      id: true,
      student: { select: { enrollments: { where: { sessionId: exam.sessionId, isCurrent: true }, take: 1, select: { sectionId: true } } } },
    },
  })
  if (results.length !== new Set(input.rows.map((r) => r.resultId)).size) throw conflict('Some students do not have a result for this exam')
  if (allowed !== null) {
    const allowedSet = new Set(allowed)
    if (results.some((r) => !allowedSet.has(r.student.enrollments[0]?.sectionId ?? ''))) {
      throw conflict('You can only assess students of sections where you are the class teacher')
    }
  }

  await ctx.db.$transaction(async (tx) => {
    for (const row of input.rows) {
      const holistic = { competencies: row.competencies, coScholastic: row.coScholastic } as Prisma.InputJsonValue
      await tx.result.update({
        where: { id: row.resultId },
        data: {
          holistic,
          teacherRemark: row.teacherRemark ?? null,
          promotionStatus: row.promotionStatus ?? null,
          ...(canPrincipal ? { principalRemark: row.principalRemark ?? null } : {}),
        },
      })
    }
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'result.holistic.save',
    module: 'exams',
    entityType: 'Exam',
    entityId: exam.id,
    summary: `Saved holistic assessment for ${input.rows.length} students in ${exam.name}`,
    after: { students: input.rows.length },
  })
  return { saved: input.rows.length }
}
