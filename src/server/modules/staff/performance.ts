import { subDays } from 'date-fns'
import type { AppContext } from '@/server/context'
import { attendanceDate } from '@/lib/dates'

/**
 * Performance, assembled from what the school already records.
 *
 * Nothing here is a new judgement — it is attendance actually marked, lessons
 * actually logged, syllabus actually planned and feedback actually given. A
 * separate "performance score" typed by a manager would be an appraisal, and
 * that lives in its own table with the reasoning attached.
 *
 * Every figure carries its own denominator, because a teacher with three
 * marked days and one absence is not a 67% attender in any useful sense.
 */
export async function staffPerformance(ctx: AppContext, staffId: string, days = 89) {
  ctx.require('staff.view')

  const to = attendanceDate(new Date())
  const from = attendanceDate(subDays(new Date(), days))

  // Marks are stamped with the *user* who entered them, not the staff row, so
  // counting them needs the linked account. A staff member with no login has
  // entered none by definition.
  const staff = await ctx.db.staff.findFirst({
    where: { id: staffId },
    select: { userId: true },
  })

  const [
    attendance,
    markedDays,
    classSubjects,
    classTeacherOf,
    periods,
    classwork,
    homework,
    curricula,
    leave,
    marksEntered,
  ] = await Promise.all([
    ctx.db.staffAttendance.groupBy({
      by: ['status'],
      where: { staffId, onDate: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    ctx.db.staffAttendance
      .findMany({
        where: { onDate: { gte: from, lte: to } },
        distinct: ['onDate'],
        select: { onDate: true },
      })
      .then((r) => r.length),
    ctx.db.classSubject.count({ where: { teacherId: staffId } }),
    ctx.db.section.count({ where: { classTeacherId: staffId, deletedAt: null } }),
    ctx.db.timetableSlot.count({ where: { teacherId: staffId } }),
    ctx.db.classwork.count({
      where: { teacherId: staffId, onDate: { gte: from, lte: to }, deletedAt: null },
    }),
    ctx.db.homework.count({
      where: { teacherId: staffId, assignedOn: { gte: from, lte: to }, deletedAt: null },
    }),
    // How far the syllabus has been *planned* for everything this teacher
    // owns. The product does not track which topics have been taught, so this
    // deliberately reports planning depth rather than pretending to measure
    // coverage.
    ctx.db.curriculum.findMany({
      where: { classSubject: { teacherId: staffId }, deletedAt: null },
      select: {
        id: true,
        isPublished: true,
        classSubject: {
          select: {
            subject: { select: { name: true } },
            classLevel: { select: { name: true } },
          },
        },
        chapters: {
          where: { deletedAt: null },
          select: { id: true, topics: { where: { deletedAt: null }, select: { id: true } } },
        },
      },
    }),
    ctx.db.leaveRequest.groupBy({
      by: ['status'],
      where: { staffId, applicantType: 'STAFF', fromDate: { gte: from } },
      _count: { _all: true },
    }),
    staff?.userId
      ? ctx.db.mark.count({ where: { enteredById: staff.userId } })
      : Promise.resolve(0),
  ])

  const count = (status: string) => attendance.find((a) => a.status === status)?._count._all ?? 0
  const present = count('PRESENT')
  const late = count('LATE')
  const half = count('HALF_DAY')
  const onLeave = count('LEAVE')
  const absent = count('ABSENT')
  const marked = present + late + half + onLeave + absent

  const topics = curricula.flatMap((c) => c.chapters.flatMap((ch) => ch.topics))
  const chapters = curricula.flatMap((c) => c.chapters)

  const leaveAt = (status: string) => leave.find((l) => l.status === status)?._count._all ?? 0

  return {
    window: { from, to, days },
    attendance: {
      marked,
      present,
      late,
      halfDay: half,
      leave: onLeave,
      absent,
      percent: marked > 0 ? Math.round(((present + late + half) / marked) * 1000) / 10 : null,
      /** School days the register ran but this person has no row on. */
      unmarked: Math.max(0, markedDays - marked),
    },
    teaching: {
      subjects: classSubjects,
      classTeacherOf,
      periodsPerWeek: periods,
      classworkLogged: classwork,
      homeworkSet: homework,
      marksEntered,
    },
    syllabus: {
      /** Subjects this person teaches that have a syllabus at all. */
      plans: curricula.length,
      published: curricula.filter((c) => c.isPublished).length,
      chapters: chapters.length,
      topics: topics.length,
      bySubject: curricula.map((c) => ({
        id: c.id,
        label: `${c.classSubject.classLevel.name} · ${c.classSubject.subject.name}`,
        chapters: c.chapters.length,
        topics: c.chapters.reduce((sum, ch) => sum + ch.topics.length, 0),
        isPublished: c.isPublished,
      })),
    },
    leave: {
      pending: leaveAt('PENDING'),
      approved: leaveAt('APPROVED'),
      rejected: leaveAt('REJECTED'),
    },
  }
}

/**
 * Student feedback about one teacher.
 *
 * Withheld below the campaign's own minimum-response threshold, the same rule
 * the teacher's own view applies. A rating built from two responses is not an
 * assessment of teaching, it is an assessment of two children's afternoon,
 * and showing it to a manager would be worse than showing nothing.
 */
export async function staffFeedback(ctx: AppContext, staffId: string) {
  ctx.require('staff.view')

  const assignments = await ctx.db.feedbackAssignment.findMany({
    where: { targetStaffId: staffId, status: 'SUBMITTED' },
    include: {
      campaign: { select: { name: true, minimumResponses: true, isAnonymousToTarget: true } },
      subject: { select: { name: true } },
      responses: {
        include: {
          answers: {
            include: { question: { select: { label: true, category: true, type: true } } },
          },
        },
      },
    },
  })

  const pending = await ctx.db.feedbackAssignment.count({
    where: { targetStaffId: staffId, status: 'PENDING' },
  })

  const responses = assignments.flatMap((a) => a.responses)
  const minimum = assignments.length
    ? Math.max(...assignments.map((a) => a.campaign.minimumResponses), 5)
    : 5

  if (responses.length < minimum) {
    return {
      available: false as const,
      responseCount: responses.length,
      minimum,
      pending,
      categories: [],
      comments: [],
    }
  }

  const byCategory = new Map<string, number[]>()
  const comments: { category: string; text: string }[] = []

  for (const response of responses) {
    for (const answer of response.answers) {
      const category = answer.question.category ?? 'Overall'
      if (answer.rating) {
        byCategory.set(category, [...(byCategory.get(category) ?? []), answer.rating])
      }
      // Only moderated-and-approved comments reach a manager's screen.
      if (answer.question.type.endsWith('TEXT') && answer.value?.trim()) {
        comments.push({ category, text: answer.value.trim() })
      }
    }
  }

  const approved = comments.length
    ? await ctx.db.feedbackModeration.findMany({
        where: { status: 'APPROVED', answer: { response: { assignment: { targetStaffId: staffId } } } },
        select: { answer: { select: { value: true } } },
      })
    : []
  const approvedText = new Set(approved.map((m) => m.answer.value?.trim()).filter(Boolean))

  return {
    available: true as const,
    responseCount: responses.length,
    minimum,
    pending,
    categories: [...byCategory.entries()]
      .map(([name, values]) => ({
        name,
        average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
        count: values.length,
      }))
      .sort((a, b) => b.average - a.average),
    comments: comments.filter((c) => approvedText.has(c.text)).slice(0, 20),
  }
}

/** Staff leave awaiting a decision — the approvals queue. */
export async function pendingStaffApprovals(ctx: AppContext, staffId?: string) {
  ctx.require('leave.view')

  return ctx.db.leaveRequest.findMany({
    where: {
      applicantType: 'STAFF',
      status: 'PENDING',
      ...(staffId ? { staffId } : {}),
    },
    orderBy: { fromDate: 'asc' },
    take: 100,
    include: {
      staff: {
        select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true },
      },
      leaveType: { select: { name: true, isPaid: true } },
    },
  })
}
