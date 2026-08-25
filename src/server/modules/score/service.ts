import type { AppContext } from '@/server/context'
import { studentScopeWhere } from '@/server/scope'
import {
  averageScore,
  bandCounts,
  bandFor,
  composeScore,
  metricsFor,
  type ComposedScore,
  type MetricReading,
  type ScoreBand,
  type WeightSetting,
} from '@/lib/score'
import { getWeights } from './weights'

/**
 * The scoring engine.
 *
 * Everything in here is batched. Scoring a school of two thousand children is
 * about a dozen aggregate queries in total, not a dozen per child — the naive
 * per-student version is the reason dashboards like this normally end up as a
 * nightly job nobody trusts the freshness of. Because it is cheap, the score is
 * computed live at the moment it is read, so it is never stale and there is no
 * "last calculated" caveat to explain.
 *
 * `ScoreSnapshot` exists only for the one question live computation cannot
 * answer: whether the number is moving.
 */

export type ScoredStudent = {
  studentId: string
  admissionNo: string
  firstName: string
  lastName: string
  photoUrl: string | null
  classLevelId: string
  className: string
  sectionId: string
  sectionName: string
  rollNumber: number | null
  composed: ComposedScore
}

export type ScoredGroup = {
  id: string
  name: string
  /** Students on the roll, whether or not each could be scored. */
  size: number
  /** Students that produced a score. `size - counted` had nothing to read. */
  counted: number
  score: number | null
  band: ScoreBand | null
  bands: Record<ScoreBand, number>
  /** Mean of each metric across the group, for the strength/weakness read. */
  metricAverages: { metric: string; label: string; score: number | null; counted: number }[]
}

export type SchoolScore = {
  sessionName: string | null
  score: number | null
  band: ScoreBand | null
  coverage: number
  studentsOnRoll: number
  studentsScored: number
  bands: Record<ScoreBand, number>
  metricAverages: ScoredGroup['metricAverages']
  classes: ScoredGroup[]
  sections: ScoredGroup[]
  /** The lowest-scoring students, which is the list a principal acts on. */
  needsAttention: ScoredStudent[]
}

type Period = { sessionId: string; sessionName: string; from: Date; to: Date }

/** Severity of a discipline record, in points off a clean 100. */
const SEVERITY_PENALTY: Record<string, number> = {
  MINOR: 5,
  MAJOR: 12,
  SEVERE: 25,
  CRITICAL: 25,
}
const DEFAULT_SEVERITY_PENALTY = 8

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return (numerator / denominator) * 100
}

/**
 * The window every date-scoped metric is measured over.
 *
 * Ends today rather than on the session's last day: measuring a running year
 * against its full length would score every school down in April purely for the
 * months that have not happened yet.
 */
async function currentPeriod(ctx: AppContext): Promise<Period | null> {
  const session = await ctx.db.academicSession.findFirst({
    where: { isCurrent: true },
    select: { id: true, name: true, startsOn: true, endsOn: true },
  })
  if (!session) return null

  const today = new Date()
  return {
    sessionId: session.id,
    sessionName: session.name,
    from: session.startsOn,
    to: today < session.endsOn ? today : session.endsOn,
  }
}

/* -------------------------------------------------------------------------- */
/* Students                                                                    */
/* -------------------------------------------------------------------------- */

export async function scoreStudents(
  ctx: AppContext,
  filter: { classLevelId?: string; sectionId?: string; studentId?: string } = {},
): Promise<{ students: ScoredStudent[]; weights: WeightSetting[]; period: Period | null }> {
  ctx.require('score.view')

  const period = await currentPeriod(ctx)
  const weights = await getWeights(ctx, 'STUDENT')
  if (!period) return { students: [], weights, period: null }

  const scope = await studentScopeWhere(ctx)

  const enrollments = await ctx.db.enrollment.findMany({
    where: {
      sessionId: period.sessionId,
      isCurrent: true,
      ...(filter.classLevelId ? { classLevelId: filter.classLevelId } : {}),
      ...(filter.sectionId ? { sectionId: filter.sectionId } : {}),
      ...(filter.studentId ? { studentId: filter.studentId } : {}),
      student: { deletedAt: null, status: 'ACTIVE', ...scope },
    },
    select: {
      rollNumber: true,
      classLevelId: true,
      sectionId: true,
      classLevel: { select: { name: true, numeric: true } },
      section: { select: { name: true } },
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
        },
      },
    },
  })

  const ids = enrollments.map((e) => e.student.id)
  if (ids.length === 0) return { students: [], weights, period }

  // Which metrics are actually weighted decides what gets queried at all: a
  // school that has switched transport off should not pay for the query.
  const live = new Set(weights.filter((w) => w.isEnabled && w.weight > 0).map((w) => w.metric))
  const dateRange = { gte: period.from, lte: period.to }

  const [
    attendance,
    results,
    homework,
    invoicesTotal,
    invoicesOverdue,
    discipline,
    disciplineTotal,
    boarding,
    loans,
  ] = await Promise.all([
    live.has('ATTENDANCE') || live.has('PUNCTUALITY')
      ? ctx.db.studentAttendance.groupBy({
          by: ['studentId', 'status'],
          where: { studentId: { in: ids }, sessionId: period.sessionId },
          _count: { _all: true },
        })
      : [],

    live.has('ACADEMICS')
      ? ctx.db.result.groupBy({
          by: ['studentId'],
          where: {
            studentId: { in: ids },
            publishedAt: { not: null },
            exam: { sessionId: period.sessionId },
          },
          _avg: { percentage: true },
          _count: { _all: true },
        })
      : [],

    live.has('HOMEWORK')
      ? ctx.db.homeworkSubmission.groupBy({
          by: ['studentId', 'status'],
          where: { studentId: { in: ids }, homework: { assignedOn: dateRange } },
          _count: { _all: true },
        })
      : [],

    live.has('FEE_TIMELINESS')
      ? ctx.db.feeInvoice.groupBy({
          by: ['studentId'],
          where: {
            studentId: { in: ids },
            sessionId: period.sessionId,
            status: { notIn: ['DRAFT', 'CANCELLED'] },
          },
          _count: { _all: true },
        })
      : [],

    live.has('FEE_TIMELINESS')
      ? ctx.db.feeInvoice.groupBy({
          by: ['studentId'],
          where: {
            studentId: { in: ids },
            sessionId: period.sessionId,
            status: { notIn: ['DRAFT', 'CANCELLED'] },
            balanceMinor: { gt: 0 },
            dueOn: { lt: new Date() },
          },
          _count: { _all: true },
        })
      : [],

    live.has('BEHAVIOUR')
      ? ctx.db.disciplineRecord.groupBy({
          by: ['studentId', 'severity'],
          where: { studentId: { in: ids }, occurredOn: dateRange },
          _count: { _all: true },
        })
      : [],

    // Distinguishes "this school does not record conduct" from "this child has
    // a clean record". Without it, a school that has never opened the discipline
    // module would hand every child a free 100 on behaviour.
    live.has('BEHAVIOUR') ? ctx.db.disciplineRecord.count() : 0,

    live.has('TRANSPORT')
      ? ctx.db.transportBoardingLog.groupBy({
          by: ['studentId', 'event'],
          where: { studentId: { in: ids }, occurredAt: dateRange },
          _count: { _all: true },
        })
      : [],

    // Two dates have to be compared against each other, which an aggregate
    // cannot do; loans are low-volume enough to fold in memory.
    live.has('LIBRARY')
      ? ctx.db.libraryLoan.findMany({
          where: { studentId: { in: ids }, issuedOn: { gte: period.from } },
          select: { studentId: true, dueOn: true, returnedOn: true, status: true },
        })
      : [],
  ])

  /* --- fold the aggregates into per-student tallies --------------------- */

  type Tally = {
    attendance: Record<string, number>
    homework: Record<string, number>
    resultAvg: number | null
    resultCount: number
    invoices: number
    invoicesOverdue: number
    penalty: number
    incidents: number
    boarded: number
    missedBus: number
    loansClosed: number
    loansOnTime: number
  }

  const blank = (): Tally => ({
    attendance: {},
    homework: {},
    resultAvg: null,
    resultCount: 0,
    invoices: 0,
    invoicesOverdue: 0,
    penalty: 0,
    incidents: 0,
    boarded: 0,
    missedBus: 0,
    loansClosed: 0,
    loansOnTime: 0,
  })

  const tally = new Map<string, Tally>(ids.map((id) => [id, blank()]))
  // Insert on miss rather than handing back a throwaway: a caller mutating a
  // detached object would lose the write silently, and every fold below writes
  // through this.
  const get = (id: string) => {
    const existing = tally.get(id)
    if (existing) return existing
    const fresh = blank()
    tally.set(id, fresh)
    return fresh
  }

  for (const row of attendance) {
    get(row.studentId).attendance[row.status] = row._count._all
  }
  for (const row of results) {
    const t = get(row.studentId)
    t.resultAvg = row._avg.percentage
    t.resultCount = row._count._all
  }
  for (const row of homework) {
    get(row.studentId).homework[row.status] = row._count._all
  }
  for (const row of invoicesTotal) {
    get(row.studentId).invoices = row._count._all
  }
  for (const row of invoicesOverdue) {
    get(row.studentId).invoicesOverdue = row._count._all
  }
  for (const row of discipline) {
    const t = get(row.studentId)
    const penalty = SEVERITY_PENALTY[row.severity.toUpperCase()] ?? DEFAULT_SEVERITY_PENALTY
    t.penalty += penalty * row._count._all
    t.incidents += row._count._all
  }
  for (const row of boarding) {
    const t = get(row.studentId)
    if (row.event === 'BOARDED') t.boarded += row._count._all
    if (row.event === 'ABSENT') t.missedBus += row._count._all
  }
  for (const loan of loans) {
    if (!loan.studentId) continue
    const t = get(loan.studentId)
    if (loan.returnedOn) {
      t.loansClosed += 1
      if (loan.returnedOn <= loan.dueOn) t.loansOnTime += 1
    } else if (loan.status === 'OVERDUE') {
      // Still out and already late: counts against, and counts as closed for
      // the denominator. A book that is out but not yet due is not evidence
      // either way and is left out entirely.
      t.loansClosed += 1
    }
  }

  const schoolRecordsConduct = disciplineTotal > 0

  const students: ScoredStudent[] = enrollments.map((enrollment) => {
    const t = get(enrollment.student.id)
    const readings = studentReadings(t, schoolRecordsConduct)

    return {
      studentId: enrollment.student.id,
      admissionNo: enrollment.student.admissionNo,
      firstName: enrollment.student.firstName,
      lastName: enrollment.student.lastName,
      photoUrl: enrollment.student.photoUrl,
      classLevelId: enrollment.classLevelId,
      className: enrollment.classLevel.name,
      sectionId: enrollment.sectionId,
      sectionName: enrollment.section.name,
      rollNumber: enrollment.rollNumber,
      composed: composeScore(readings, weights),
    }
  })

  students.sort(
    (a, b) =>
      (b.composed.score ?? -1) - (a.composed.score ?? -1) ||
      a.firstName.localeCompare(b.firstName),
  )

  return { students, weights, period }
}

/** Turns one student's tallies into a reading per metric. */
function studentReadings(
  t: {
    attendance: Record<string, number>
    homework: Record<string, number>
    resultAvg: number | null
    resultCount: number
    invoices: number
    invoicesOverdue: number
    penalty: number
    incidents: number
    boarded: number
    missedBus: number
    loansClosed: number
    loansOnTime: number
  },
  schoolRecordsConduct: boolean,
): MetricReading[] {
  const present = t.attendance.PRESENT ?? 0
  const absent = t.attendance.ABSENT ?? 0
  const late = t.attendance.LATE ?? 0
  const half = t.attendance.HALF_DAY ?? 0

  // Approved leave and holidays are excluded from both halves rather than
  // counted as absence: a school that grants leave should not score the child
  // down for having been granted it.
  const marked = present + absent + late + half
  const credited = present + late + half * 0.5
  const attended = present + late + half

  const homeworkTotal = Object.values(t.homework).reduce((sum, n) => sum + n, 0)
  const onTime = (t.homework.SUBMITTED ?? 0) + (t.homework.REVIEWED ?? 0)
  const partial = (t.homework.LATE ?? 0) + (t.homework.REDO ?? 0)

  const busTrips = t.boarded + t.missedBus

  return [
    {
      metric: 'ACADEMICS',
      score: t.resultCount > 0 ? (t.resultAvg ?? 0) : null,
      detail:
        t.resultCount > 0
          ? `Mean of ${t.resultCount} published result${t.resultCount === 1 ? '' : 's'}`
          : 'No published results yet',
    },
    {
      metric: 'ATTENDANCE',
      score: pct(credited, marked),
      detail: marked > 0 ? `${present} present, ${late} late, ${absent} absent of ${marked} marked` : 'No attendance marked yet',
    },
    {
      metric: 'PUNCTUALITY',
      score: pct(attended - late, attended),
      detail: attended > 0 ? `Late on ${late} of ${attended} days attended` : 'No attendance marked yet',
    },
    {
      metric: 'HOMEWORK',
      score: pct(onTime + partial * 0.5, homeworkTotal),
      detail:
        homeworkTotal > 0
          ? `${onTime} on time, ${partial} late or to redo, of ${homeworkTotal} set`
          : 'No homework assigned yet',
    },
    {
      metric: 'FEE_TIMELINESS',
      score: pct(t.invoices - t.invoicesOverdue, t.invoices),
      detail:
        t.invoices > 0
          ? t.invoicesOverdue > 0
            ? `${t.invoicesOverdue} of ${t.invoices} invoices past their due date`
            : `All ${t.invoices} invoices in good standing`
          : 'No invoices issued yet',
    },
    {
      metric: 'BEHAVIOUR',
      score: schoolRecordsConduct ? Math.max(0, 100 - t.penalty) : null,
      detail: !schoolRecordsConduct
        ? 'This school does not record conduct'
        : t.incidents === 0
          ? 'Nothing on record'
          : `${t.incidents} record${t.incidents === 1 ? '' : 's'} on file`,
    },
    {
      metric: 'TRANSPORT',
      score: pct(t.boarded, busTrips),
      detail:
        busTrips > 0
          ? `Boarded ${t.boarded} of ${busTrips} recorded trips`
          : 'No bus boarding recorded',
    },
    {
      metric: 'LIBRARY',
      score: pct(t.loansOnTime, t.loansClosed),
      detail:
        t.loansClosed > 0
          ? `${t.loansOnTime} of ${t.loansClosed} books returned on time`
          : 'No completed loans',
    },
  ]
}

/* -------------------------------------------------------------------------- */
/* Aggregation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Rolls student scores up into a group.
 *
 * The group score is the mean of its students, not the mean of its subgroups:
 * averaging class averages would give a class of eight the same say as a class
 * of eighty, and the school figure would stop matching the children in it.
 */
function rollUp(
  id: string,
  name: string,
  members: ScoredStudent[],
  weights: WeightSetting[],
): ScoredGroup {
  const scores = members.map((m) => m.composed.score)
  const { score, counted } = averageScore(scores)

  const metricAverages = weights
    .filter((w) => w.isEnabled && w.weight > 0)
    .map((w) => {
      const values = members
        .map((m) => m.composed.parts.find((p) => p.metric === w.metric)?.score ?? null)
        .filter((v): v is number => v !== null)

      return {
        metric: w.metric,
        label: metricsFor('STUDENT').find((m) => m.key === w.metric)?.label ?? w.metric,
        score: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null,
        counted: values.length,
      }
    })

  return {
    id,
    name,
    size: members.length,
    counted,
    score,
    band: score === null ? null : bandFor(score),
    bands: bandCounts(scores),
    metricAverages,
  }
}

/** The whole health card, in one pass over one scoring run. */
export async function scoreSchool(ctx: AppContext): Promise<SchoolScore> {
  const { students, weights, period } = await scoreStudents(ctx)

  const scores = students.map((s) => s.composed.score)
  const { score, counted } = averageScore(scores)

  const coverages = students.map((s) => s.composed.coverage).filter((c) => c > 0)
  const coverage = coverages.length
    ? coverages.reduce((a, b) => a + b, 0) / coverages.length
    : 0

  const byClass = new Map<string, ScoredStudent[]>()
  const bySection = new Map<string, ScoredStudent[]>()
  for (const student of students) {
    byClass.set(student.classLevelId, [...(byClass.get(student.classLevelId) ?? []), student])
    bySection.set(student.sectionId, [...(bySection.get(student.sectionId) ?? []), student])
  }

  const classes = [...byClass.entries()]
    .map(([id, members]) => rollUp(id, members[0]!.className, members, weights))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

  const sections = [...bySection.entries()]
    .map(([id, members]) =>
      rollUp(id, `${members[0]!.className} ${members[0]!.sectionName}`, members, weights),
    )
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))

  const schoolWide = rollUp('SCHOOL', 'School', students, weights)

  return {
    sessionName: period?.sessionName ?? null,
    score,
    band: score === null ? null : bandFor(score),
    coverage,
    studentsOnRoll: students.length,
    studentsScored: counted,
    bands: bandCounts(scores),
    metricAverages: schoolWide.metricAverages,
    classes,
    sections,
    needsAttention: students
      .filter((s) => s.composed.score !== null)
      .slice(-12)
      .reverse(),
  }
}
