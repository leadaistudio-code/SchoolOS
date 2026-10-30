import type { AppContext } from '@/server/context'
import { assertStudentAccess } from '@/server/scope'
import { attendanceDate } from '@/lib/dates'

/**
 * The evidence behind each Student 360 figure.
 *
 * Each reader returns the raw rows a number was built from, using the same
 * window and the same counting rule as the figure itself, so the drill-down
 * always adds up to what the 360° shows.
 */

export const STUDENT_INSIGHTS = [
  'score',
  'attendance',
  'punctuality',
  'academics',
  'homework',
  'fees',
  'behaviour',
  'transport',
  'library',
  'sports',
  'feedback',
] as const
export type StudentInsight = (typeof STUDENT_INSIGHTS)[number]

/** Score metric key → drill-down tab. */
export const SCORE_METRIC_TAB: Record<string, StudentInsight> = {
  ACADEMICS: 'academics',
  ATTENDANCE: 'attendance',
  PUNCTUALITY: 'punctuality',
  HOMEWORK: 'homework',
  FEE_TIMELINESS: 'fees',
  BEHAVIOUR: 'behaviour',
  TRANSPORT: 'transport',
  LIBRARY: 'library',
  SPORTS: 'sports',
}

export async function insightWindow(ctx: AppContext) {
  const session = await ctx.db.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true, startsOn: true, endsOn: true },
  })
  const today = attendanceDate(new Date())
  if (!session) return null
  return {
    sessionId: session.id,
    sessionName: session.name,
    from: session.startsOn,
    to: today < session.endsOn ? today : session.endsOn,
  }
}

export async function studentAttendanceDays(ctx: AppContext, studentId: string, sessionId: string) {
  await assertStudentAccess(ctx, studentId)
  return ctx.db.studentAttendance.findMany({
    where: { studentId, sessionId },
    orderBy: { onDate: 'desc' },
    select: { id: true, onDate: true, status: true, minutesLate: true, remarks: true, source: true },
  })
}

export async function studentExamMarks(ctx: AppContext, studentId: string, sessionId: string) {
  await assertStudentAccess(ctx, studentId)
  const [results, marks] = await Promise.all([
    ctx.db.result.findMany({
      where: { studentId, publishedAt: { not: null }, exam: { sessionId } },
      orderBy: [{ exam: { startsOn: 'asc' } }, { computedAt: 'asc' }],
      select: {
        id: true,
        examId: true,
        totalMax: true,
        totalObtained: true,
        percentage: true,
        grade: true,
        rankInClass: true,
        isPass: true,
        exam: { select: { name: true, startsOn: true } },
      },
    }),
    ctx.db.mark.findMany({
      where: { studentId, examSubject: { exam: { sessionId, results: { some: { studentId, publishedAt: { not: null } } } } } },
      select: {
        id: true,
        marksObtained: true,
        internalMarks: true,
        oralMarks: true,
        isAbsent: true,
        notApplicable: true,
        grade: true,
        examSubject: {
          select: {
            examId: true,
            maxMarks: true,
            internalMaxMarks: true,
            oralMaxMarks: true,
            passMarks: true,
            classSubject: { select: { subject: { select: { name: true } } } },
          },
        },
      },
    }),
  ])
  return results.map((r) => ({
    ...r,
    marks: marks
      .filter((m) => m.examSubject.examId === r.examId)
      .sort((a, b) =>
        a.examSubject.classSubject.subject.name.localeCompare(b.examSubject.classSubject.subject.name),
      ),
  }))
}

export async function studentHomework(ctx: AppContext, studentId: string, from: Date, to: Date) {
  await assertStudentAccess(ctx, studentId)
  return ctx.db.homeworkSubmission.findMany({
    where: { studentId, homework: { assignedOn: { gte: from, lte: to } } },
    orderBy: { homework: { dueOn: 'desc' } },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      score: true,
      homework: {
        select: {
          title: true,
          assignedOn: true,
          dueOn: true,
          maxScore: true,
          classSubject: { select: { subject: { select: { name: true } } } },
        },
      },
    },
  })
}

export async function studentInvoices(ctx: AppContext, studentId: string, sessionId: string) {
  await assertStudentAccess(ctx, studentId)
  return ctx.db.feeInvoice.findMany({
    where: { studentId, sessionId, status: { notIn: ['DRAFT', 'CANCELLED'] } },
    orderBy: { dueOn: 'asc' },
    select: {
      id: true,
      number: true,
      title: true,
      dueOn: true,
      totalMinor: true,
      paidMinor: true,
      balanceMinor: true,
      status: true,
    },
  })
}

export async function studentConduct(ctx: AppContext, studentId: string, from: Date, to: Date) {
  await assertStudentAccess(ctx, studentId)
  const [records, schoolTotal] = await Promise.all([
    ctx.db.disciplineRecord.findMany({
      where: { studentId, occurredOn: { gte: from, lte: to } },
      orderBy: { occurredOn: 'desc' },
      select: { id: true, occurredOn: true, category: true, severity: true, notes: true, actionTaken: true },
    }),
    ctx.db.disciplineRecord.count(),
  ])
  return { records, schoolRecordsConduct: schoolTotal > 0 }
}

export async function studentBoarding(ctx: AppContext, studentId: string, from: Date, to: Date) {
  await assertStudentAccess(ctx, studentId)
  return ctx.db.transportBoardingLog.findMany({
    where: { studentId, occurredAt: { gte: from, lte: to }, event: { in: ['BOARDED', 'ABSENT'] } },
    orderBy: { occurredAt: 'desc' },
    take: 400,
    select: { id: true, event: true, occurredAt: true, stop: { select: { name: true } } },
  })
}

export async function studentLoans(ctx: AppContext, studentId: string, from: Date) {
  await assertStudentAccess(ctx, studentId)
  return ctx.db.libraryLoan.findMany({
    where: { studentId, issuedOn: { gte: from } },
    orderBy: { issuedOn: 'desc' },
    select: {
      id: true,
      issuedOn: true,
      dueOn: true,
      returnedOn: true,
      status: true,
      book: { select: { title: true } },
    },
  })
}

export async function studentTeams(ctx: AppContext, studentId: string) {
  await assertStudentAccess(ctx, studentId)
  return ctx.db.sportsTeamMember.findMany({
    where: { studentId },
    select: {
      id: true,
      isCaptain: true,
      position: true,
      team: { select: { name: true, sport: { select: { name: true } } } },
    },
  })
}
