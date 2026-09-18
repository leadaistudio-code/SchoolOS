import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { getExamDetail } from './service'
import { classSubjectAppliesToSection } from './section-subjects'

export const examAttendanceScanSchema = z.object({
  examId: z.string().min(1),
  /** Calendar day of the sitting (YYYY-MM-DD). All papers that day are marked. */
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an exam date'),
  barcode: z.string().trim().min(3).max(160),
})

export const examAttendanceMarkSchema = z.object({
  examId: z.string().min(1),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an exam date'),
  studentId: z.string().min(1),
  status: z.enum(['PRESENT', 'ABSENT']),
})

export function normalizeAdmitBarcode(value: string): string {
  return value.trim().replace(/^MCV-ADMIT:/i, '').trim()
}

type ScopedPapers = Awaited<ReturnType<typeof loadScopedPapers>>
type AttendancePaper = ScopedPapers['papers'][number]
type AttendanceCard = NonNullable<Awaited<ReturnType<typeof attendanceCard>>>

async function loadScopedPapers(ctx: AppContext, examId: string) {
  const exam = await getExamDetail(ctx, examId)
  const allowedPaperIds = exam.subjects.map((paper) => paper.id)
  const papers = await ctx.db.examSubject.findMany({
    where: { examId, id: { in: allowedPaperIds } },
    orderBy: [
      { examDate: 'asc' },
      { startTime: 'asc' },
      { classSubject: { classLevel: { numeric: 'asc' } } },
      { classSubject: { subject: { name: 'asc' } } },
    ],
    include: {
      exam: { select: { id: true, name: true } },
      classSubject: {
        select: {
          classLevelId: true,
          classLevel: { select: { name: true } },
          subject: { select: { name: true, code: true } },
          sections: { select: { sectionId: true } },
        },
      },
    },
  })
  return { exam, papers }
}

function papersOnDate(papers: AttendancePaper[], examDate: string) {
  return papers.filter(
    (paper) => paper.examDate != null && toDateInput(paper.examDate) === examDate,
  )
}

async function attendanceCard(
  ctx: AppContext,
  where: { token?: string; studentId?: string; examId?: string },
) {
  return ctx.db.admitCard.findFirst({
    where: {
      tenantId: ctx.tenant.id,
      ...(where.token
        ? { OR: [{ verifyToken: where.token }, { number: where.token }] }
        : {}),
      ...(where.studentId ? { studentId: where.studentId } : {}),
      ...(where.examId ? { examId: where.examId } : {}),
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
          photoUrl: true,
          deletedAt: true,
          status: true,
          enrollments: {
            where: { isCurrent: true },
            take: 1,
            select: {
              classLevelId: true,
              sectionId: true,
              rollNumber: true,
              classLevel: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
        },
      },
    },
  })
}

function isEligibleForPaper(card: AttendanceCard, paper: AttendancePaper) {
  if (card.status !== 'APPROVED') return false
  if (card.examId !== paper.examId) return false
  if (card.student.deletedAt || card.student.status !== 'ACTIVE') return false
  const enrollment = card.student.enrollments[0]
  if (!enrollment || enrollment.classLevelId !== paper.classSubject.classLevelId) return false
  const sectionIds = paper.classSubject.sections.map((section) => section.sectionId)
  return classSubjectAppliesToSection(sectionIds, enrollment.sectionId)
}

function assertEligible(card: AttendanceCard, paper: AttendancePaper) {
  if (card.status !== 'APPROVED') {
    throw conflict('This admit card is not approved')
  }
  if (card.examId !== paper.examId) {
    throw conflict(`This admit card belongs to a different exam, not ${paper.exam.name}`)
  }
  if (card.student.deletedAt || card.student.status !== 'ACTIVE') {
    throw conflict('This student is no longer active')
  }

  const enrollment = card.student.enrollments[0]
  if (!enrollment || enrollment.classLevelId !== paper.classSubject.classLevelId) {
    throw conflict('This student is not registered for a paper on the selected date')
  }
  const sectionIds = paper.classSubject.sections.map((section) => section.sectionId)
  if (!classSubjectAppliesToSection(sectionIds, enrollment.sectionId)) {
    throw conflict('This paper is not assigned to the student’s section')
  }
  return enrollment
}

function eligiblePapersForCard(card: AttendanceCard, dayPapers: AttendancePaper[]) {
  return dayPapers.filter((paper) => isEligibleForPaper(card, paper))
}

export async function getExamAttendanceDesk(
  ctx: AppContext,
  examId: string,
  selectedDate?: string,
) {
  ctx.require('exams.attendance')
  const { exam, papers } = await loadScopedPapers(ctx, examId)

  const dateMap = new Map<string, AttendancePaper[]>()
  for (const paper of papers) {
    if (!paper.examDate) continue
    const key = toDateInput(paper.examDate)
    const list = dateMap.get(key) ?? []
    list.push(paper)
    dateMap.set(key, list)
  }

  const dates = [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, dayPapers]) => ({
      key,
      examDate: attendanceDate(key),
      paperCount: dayPapers.length,
      paperIds: dayPapers.map((paper) => paper.id),
      subjects: [
        ...new Set(dayPapers.map((paper) => paper.classSubject.subject.name)),
      ],
    }))

  const selected =
    dates.find((day) => day.key === selectedDate) ?? dates[0] ?? null

  if (!selected) {
    return { exam, dates, selectedDate: null, dayPapers: [], rows: [] }
  }

  const dayPapers = dateMap.get(selected.key) ?? []
  const classLevelIds = [...new Set(dayPapers.map((paper) => paper.classSubject.classLevelId))]

  const cards = await ctx.db.admitCard.findMany({
    where: {
      examId,
      status: 'APPROVED',
      student: {
        deletedAt: null,
        status: 'ACTIVE',
        enrollments: {
          some: {
            isCurrent: true,
            classLevelId: { in: classLevelIds },
          },
        },
      },
    },
    orderBy: [{ student: { firstName: 'asc' } }, { student: { lastName: 'asc' } }],
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
          photoUrl: true,
          deletedAt: true,
          status: true,
          enrollments: {
            where: {
              isCurrent: true,
              classLevelId: { in: classLevelIds },
            },
            take: 1,
            select: {
              classLevelId: true,
              sectionId: true,
              rollNumber: true,
              classLevel: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  const eligibleCards = cards.filter(
    (card) => eligiblePapersForCard(card, dayPapers).length > 0,
  )

  const attendance = await ctx.db.examAttendance.findMany({
    where: {
      examSubjectId: { in: dayPapers.map((paper) => paper.id) },
      studentId: { in: eligibleCards.map((card) => card.studentId) },
    },
    select: {
      examSubjectId: true,
      studentId: true,
      status: true,
      source: true,
      checkedInAt: true,
      updatedAt: true,
    },
  })

  const byStudentPaper = new Map(
    attendance.map((row) => [`${row.studentId}:${row.examSubjectId}`, row]),
  )

  return {
    exam,
    dates,
    selectedDate: selected.key,
    dayPapers: dayPapers.map((paper) => ({
      id: paper.id,
      subjectName: paper.classSubject.subject.name,
      className: paper.classSubject.classLevel.name,
      startTime: paper.startTime,
    })),
    rows: eligibleCards.map((card) => {
      const enrollment = card.student.enrollments[0]!
      const eligible = eligiblePapersForCard(card, dayPapers)
      const records = eligible
        .map((paper) => byStudentPaper.get(`${card.studentId}:${paper.id}`))
        .filter(Boolean) as typeof attendance

      const presentCount = records.filter((row) => row.status === 'PRESENT').length
      const absentCount = records.filter((row) => row.status === 'ABSENT').length
      let status: string | null = null
      if (presentCount === eligible.length && eligible.length > 0) status = 'PRESENT'
      else if (absentCount === eligible.length && eligible.length > 0) status = 'ABSENT'
      else if (presentCount > 0) status = 'PARTIAL'
      else if (absentCount > 0) status = 'ABSENT'

      const latestPresent = records
        .filter((row) => row.status === 'PRESENT' && row.checkedInAt)
        .sort((a, b) => (b.checkedInAt!.getTime() - a.checkedInAt!.getTime()))[0]

      const latest = records.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      )[0]

      return {
        admitCardNumber: card.number,
        student: card.student,
        paperCount: eligible.length,
        papersMarked: presentCount + absentCount,
        attendance: status
          ? {
              status,
              source: latest?.source ?? 'BARCODE',
              checkedInAt: latestPresent?.checkedInAt ?? null,
              updatedAt: latest?.updatedAt ?? new Date(),
            }
          : null,
      }
    }),
  }
}

async function upsertDayAttendance(options: {
  ctx: AppContext
  card: AttendanceCard
  dayPapers: AttendancePaper[]
  status: 'PRESENT' | 'ABSENT'
  source: 'BARCODE' | 'MANUAL'
}) {
  const { ctx, card, dayPapers, status, source } = options
  const eligible = eligiblePapersForCard(card, dayPapers)
  if (eligible.length === 0) {
    throw conflict('This student is not registered for any paper on the selected date')
  }

  let alreadyPresent = 0
  let updated = 0
  let firstCheckedInAt: Date | null = null

  for (const paper of eligible) {
    assertEligible(card, paper)
    const existing = await ctx.db.examAttendance.findUnique({
      where: {
        tenantId_examSubjectId_studentId: {
          tenantId: ctx.tenant.id,
          examSubjectId: paper.id,
          studentId: card.studentId,
        },
      },
    })

    if (status === 'PRESENT' && existing?.status === 'PRESENT') {
      alreadyPresent += 1
      firstCheckedInAt = firstCheckedInAt ?? existing.checkedInAt
      continue
    }

    const checkedInAt =
      status === 'PRESENT'
        ? existing?.status === 'PRESENT' && existing.checkedInAt
          ? existing.checkedInAt
          : new Date()
        : null

    const attendance = await ctx.db.examAttendance.upsert({
      where: {
        tenantId_examSubjectId_studentId: {
          tenantId: ctx.tenant.id,
          examSubjectId: paper.id,
          studentId: card.studentId,
        },
      },
      create: {
        tenantId: ctx.tenant.id,
        examSubjectId: paper.id,
        studentId: card.studentId,
        status,
        source,
        checkedInAt,
        markedById: ctx.user.userId,
      },
      update: {
        status,
        source,
        checkedInAt,
        markedById: ctx.user.userId,
        remarks: null,
      },
    })

    updated += 1
    firstCheckedInAt = firstCheckedInAt ?? attendance.checkedInAt

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: source === 'BARCODE' ? 'exam_attendance.scan' : 'exam_attendance.mark',
      module: 'exams',
      entityType: 'ExamAttendance',
      entityId: attendance.id,
      summary: `${source === 'BARCODE' ? 'Checked in' : 'Marked'} ${card.student.firstName} ${card.student.lastName} ${status.toLowerCase()} for ${paper.classSubject.subject.name}`,
    })
  }

  return {
    duplicate: status === 'PRESENT' && alreadyPresent === eligible.length && updated === 0,
    papersUpdated: updated,
    papersTotal: eligible.length,
    checkedInAt: firstCheckedInAt,
    enrollment: card.student.enrollments[0]!,
  }
}

export async function scanExamAttendance(
  ctx: AppContext,
  raw: z.infer<typeof examAttendanceScanSchema>,
) {
  ctx.require('exams.attendance')
  const input = examAttendanceScanSchema.parse(raw)
  const token = normalizeAdmitBarcode(input.barcode)
  const [{ papers }, card] = await Promise.all([
    loadScopedPapers(ctx, input.examId),
    attendanceCard(ctx, { token, examId: input.examId }),
  ])
  if (!card) throw notFound('Admit card')

  const dayPapers = papersOnDate(papers, input.examDate)
  if (dayPapers.length === 0) {
    throw conflict('No papers are scheduled on the selected date')
  }

  const result = await upsertDayAttendance({
    ctx,
    card,
    dayPapers,
    status: 'PRESENT',
    source: 'BARCODE',
  })

  return {
    duplicate: result.duplicate,
    studentId: card.studentId,
    studentName: `${card.student.firstName} ${card.student.lastName}`,
    admissionNo: card.student.admissionNo,
    photoUrl: card.student.photoUrl,
    className: `${result.enrollment.classLevel.name} ${result.enrollment.section.name}`,
    checkedInAt: result.checkedInAt,
    papersUpdated: result.papersUpdated,
    papersTotal: result.papersTotal,
  }
}

export async function markExamAttendance(
  ctx: AppContext,
  raw: z.infer<typeof examAttendanceMarkSchema>,
) {
  ctx.require('exams.attendance')
  const input = examAttendanceMarkSchema.parse(raw)
  const [{ papers }, card] = await Promise.all([
    loadScopedPapers(ctx, input.examId),
    attendanceCard(ctx, { studentId: input.studentId, examId: input.examId }),
  ])
  if (!card) throw conflict('The student does not have an admit card for this exam')

  const dayPapers = papersOnDate(papers, input.examDate)
  if (dayPapers.length === 0) {
    throw conflict('No papers are scheduled on the selected date')
  }

  const result = await upsertDayAttendance({
    ctx,
    card,
    dayPapers,
    status: input.status,
    source: 'MANUAL',
  })

  return {
    papersUpdated: result.papersUpdated,
    papersTotal: result.papersTotal,
  }
}
