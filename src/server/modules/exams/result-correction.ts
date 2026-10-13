import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { assignClassRanks, gradeForPercent, resolveMarkParts, resultPasses, writtenMax } from './service'
import { classSubjectAppliesToSection } from './section-subjects'

const mark = z.coerce.number().min(0).max(1000).nullable().optional()

export const resultCorrectionSchema = z.object({
  resultId: z.string().min(1).max(40),
  reason: z.string().trim().min(5, 'Give a reason of at least 5 characters').max(300),
  rows: z
    .array(
      z.object({
        examSubjectId: z.string().min(1).max(40),
        marksObtained: mark,
        writtenMarks: mark,
        internalMarks: mark,
        oralMarks: mark,
        isAbsent: z.coerce.boolean().default(false),
      }),
    )
    .min(1)
    .max(40),
})
export type ResultCorrectionInput = z.infer<typeof resultCorrectionSchema>

/** The result, the student's class placement and the papers that count towards it. */
async function loadResult(ctx: AppContext, resultId: string) {
  const result = await ctx.db.result.findFirst({
    where: { id: resultId },
    select: {
      id: true,
      examId: true,
      studentId: true,
      totalMax: true,
      totalObtained: true,
      percentage: true,
      grade: true,
      isPass: true,
      rankInClass: true,
      publishedAt: true,
      exam: { select: { name: true, sessionId: true, gradingScale: { select: { bands: true, passRule: true, passPercent: true } } } },
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
    },
  })
  if (!result) throw notFound('Report card')
  const enrollment = await ctx.db.enrollment.findFirst({
    where: { studentId: result.studentId, sessionId: result.exam.sessionId, isCurrent: true },
    select: { classLevelId: true, sectionId: true },
  })
  if (!enrollment) throw conflict('The student is no longer enrolled in this session')
  const papers = await ctx.db.examSubject.findMany({
    where: { examId: result.examId, closedWithoutMarks: false, classSubject: { classLevelId: enrollment.classLevelId } },
    orderBy: { classSubject: { subject: { name: 'asc' } } },
    select: {
      id: true,
      maxMarks: true,
      passMarks: true,
      internalMaxMarks: true,
      oralMaxMarks: true,
      classSubject: { select: { subject: { select: { name: true, isElective: true } }, sections: { select: { sectionId: true } } } },
      marks: {
        where: { studentId: result.studentId },
        take: 1,
        select: { marksObtained: true, internalMarks: true, oralMarks: true, isAbsent: true, notApplicable: true },
      },
    },
  })
  const applicable = papers.filter(
    (paper) =>
      classSubjectAppliesToSection(paper.classSubject.sections.map((row) => row.sectionId), enrollment.sectionId) &&
      !paper.marks[0]?.notApplicable,
  )
  return { result, enrollment, papers: applicable }
}

/** Current marks on a report card, shaped for the correction form. */
export async function resultCorrectionSheet(ctx: AppContext, resultId: string) {
  ctx.require('exams.manage')
  const { result, papers } = await loadResult(ctx, resultId)
  return {
    resultId: result.id,
    published: Boolean(result.publishedAt),
    papers: papers.map((paper) => {
      const current = paper.marks[0] ?? null
      const hasParts = Boolean(paper.internalMaxMarks || paper.oralMaxMarks)
      const parts = current && !current.isAbsent && (current.internalMarks !== null || current.oralMarks !== null)
      return {
        examSubjectId: paper.id,
        subject: paper.classSubject.subject.name,
        maxMarks: paper.maxMarks,
        passMarks: paper.passMarks,
        writtenMax: writtenMax(paper),
        internalMaxMarks: paper.internalMaxMarks,
        oralMaxMarks: paper.oralMaxMarks,
        hasParts,
        total: current?.marksObtained ?? null,
        written:
          current && parts && current.marksObtained !== null
            ? Math.round((current.marksObtained - (current.internalMarks ?? 0) - (current.oralMarks ?? 0)) * 100) / 100
            : null,
        internal: current?.internalMarks ?? null,
        oral: current?.oralMarks ?? null,
        isAbsent: current?.isAbsent ?? false,
        entered: Boolean(current),
        elective: paper.classSubject.subject.isElective,
      }
    }),
  }
}

/**
 * Corrects marks on a report card — including a published one — and
 * recalculates that result and the class ranks. Locked sheets are bypassed on
 * purpose, so this is limited to administrators, needs a reason, and every
 * changed paper is recorded in the audit trail with its old and new value.
 */
export async function correctResultMarks(ctx: AppContext, input: ResultCorrectionInput) {
  ctx.require('exams.manage')
  const { result, enrollment, papers } = await loadResult(ctx, input.resultId)
  const bands = result.exam.gradingScale?.bands ?? []
  if (bands.length === 0) throw conflict('This exam has no grading scale')
  const paperById = new Map(papers.map((paper) => [paper.id, paper]))
  if (new Set(input.rows.map((row) => row.examSubjectId)).size !== input.rows.length) throw conflict('Each paper can appear only once')

  const updates: Array<{ paperId: string; subject: string; values: { marksObtained: number | null; internalMarks: number | null; oralMarks: number | null; isAbsent: boolean } }> = []
  const changes: Array<{ subject: string; before: string; after: string }> = []
  const describe = (row: { marksObtained: number | null; isAbsent: boolean } | null) =>
    !row ? 'not entered' : row.isAbsent ? 'absent' : String(row.marksObtained)

  for (const row of input.rows) {
    const paper = paperById.get(row.examSubjectId)
    if (!paper) throw conflict('A paper on this form does not belong to this report card')
    const subject = paper.classSubject.subject.name
    const resolved = resolveMarkParts(
      {
        studentId: result.studentId,
        marksObtained: row.marksObtained ?? null,
        writtenMarks: row.writtenMarks,
        internalMarks: row.internalMarks,
        oralMarks: row.oralMarks,
        isAbsent: row.isAbsent,
        notApplicable: false,
      },
      paper,
    )
    if (!row.isAbsent && resolved.marksObtained === null && paper.classSubject.subject.isElective && !paper.marks[0]) continue
    if (!row.isAbsent && resolved.marksObtained === null) throw conflict(`Enter a mark for ${subject}, or mark the student absent`)
    if (!row.isAbsent && resolved.marksObtained! > paper.maxMarks) throw conflict(`${subject}: enter a mark from 0 to ${paper.maxMarks}`)
    const values = {
      marksObtained: row.isAbsent ? null : resolved.marksObtained,
      internalMarks: row.isAbsent ? null : resolved.internalMarks ?? null,
      oralMarks: row.isAbsent ? null : resolved.oralMarks ?? null,
      isAbsent: row.isAbsent,
    }
    const current = paper.marks[0] ?? null
    const same =
      current &&
      current.isAbsent === values.isAbsent &&
      current.marksObtained === values.marksObtained &&
      current.internalMarks === values.internalMarks &&
      current.oralMarks === values.oralMarks
    if (same) continue
    updates.push({ paperId: paper.id, subject, values })
    changes.push({ subject, before: describe(current), after: describe(values) })
  }
  if (updates.length === 0) return { changed: 0, result: null }

  const finalMarks = new Map(papers.map((paper) => [paper.id, paper.marks[0] ?? null] as const))
  for (const update of updates) finalMarks.set(update.paperId, { ...update.values, notApplicable: false })
  const missing = papers
    .filter((paper) => !finalMarks.get(paper.id) && !paper.classSubject.subject.isElective)
    .map((paper) => paper.classSubject.subject.name)
  if (missing.length) throw conflict(`Every paper needs a mark or Absent. Missing: ${missing.join(', ')}`)
  const counted = papers.filter((paper) => finalMarks.get(paper.id))

  const totalMax = counted.reduce((sum, paper) => sum + paper.maxMarks, 0)
  const totalObtained = Math.round(counted.reduce((sum, paper) => sum + (finalMarks.get(paper.id)!.marksObtained ?? 0), 0) * 100) / 100
  const percentage = totalMax === 0 ? 0 : Math.round((totalObtained / totalMax) * 10000) / 100
  const band = gradeForPercent(percentage, bands)
  const isPass = resultPasses(
    result.exam.gradingScale!,
    percentage,
    band,
    counted.map((paper) => ({ ...finalMarks.get(paper.id)!, passMarks: paper.passMarks })),
  )

  const before = { totalObtained: result.totalObtained, percentage: result.percentage, grade: result.grade, isPass: result.isPass, rankInClass: result.rankInClass }
  let rankInClass = null as number | null
  await ctx.db.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.mark.upsert({
        where: { tenantId_examSubjectId_studentId: { tenantId: ctx.tenant.id, examSubjectId: update.paperId, studentId: result.studentId } },
        create: { tenantId: ctx.tenant.id, examSubjectId: update.paperId, studentId: result.studentId, ...update.values, enteredById: ctx.user.userId, source: 'ADMIN_MANUAL' },
        update: { ...update.values, enteredById: ctx.user.userId, source: 'ADMIN_MANUAL' },
      })
    }
    await tx.result.update({
      where: { id: result.id },
      data: { totalMax, totalObtained, percentage, grade: band?.grade ?? null, isPass },
    })
    const classResults = await tx.result.findMany({
      where: {
        examId: result.examId,
        student: { enrollments: { some: { isCurrent: true, sessionId: result.exam.sessionId, classLevelId: enrollment.classLevelId } } },
      },
      select: { id: true, percentage: true, totalObtained: true, rankInClass: true },
    })
    for (const ranked of assignClassRanks(classResults)) {
      if (ranked.id === result.id) rankInClass = ranked.rank
      if (classResults.find((row) => row.id === ranked.id)?.rankInClass !== ranked.rank) {
        await tx.result.update({ where: { id: ranked.id }, data: { rankInClass: ranked.rank } })
      }
    }
  })

  const after = { totalObtained, percentage, grade: band?.grade ?? null, isPass, rankInClass }
  const studentName = `${result.student.firstName} ${result.student.lastName}`.trim()
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'exam.results.correct',
    module: 'results',
    entityType: 'Result',
    entityId: result.id,
    summary: `Corrected ${changes.map((c) => c.subject).join(', ')} for ${studentName} (${result.student.admissionNo}) in ${result.exam.name}${result.publishedAt ? ' after publishing' : ''}`,
    before: { ...before, marks: changes.map((c) => ({ subject: c.subject, value: c.before })) },
    after: { ...after, marks: changes.map((c) => ({ subject: c.subject, value: c.after })), reason: input.reason, published: Boolean(result.publishedAt) },
  })
  return { changed: updates.length, result: after }
}
