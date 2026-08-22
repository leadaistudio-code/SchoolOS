import type { AppContext } from '@/server/context'
import {
  averageScore,
  bandCounts,
  bandFor,
  composeScore,
  type ComposedScore,
  type MetricReading,
  type ScoreBand,
  type WeightSetting,
} from '@/lib/score'
import { getWeights } from './weights'

/**
 * Staff scoring.
 *
 * A deliberately narrower instrument than the student score, and it should stay
 * that way. Everything here is either an attendance fact or a judgement a human
 * already made and signed off in an appraisal — nothing tries to infer teaching
 * quality from results, because a teacher handed a weak class would then score
 * badly for it, and the number would start doing harm.
 *
 * The same composition rules apply: a signal with nothing behind it is dropped
 * and its weight shared out, never counted as a zero.
 */

export type ScoredStaff = {
  staffId: string
  employeeCode: string
  firstName: string
  lastName: string
  photoUrl: string | null
  designation: string | null
  department: string | null
  staffType: string
  composed: ComposedScore
}

export type StaffScoreSummary = {
  staff: ScoredStaff[]
  weights: WeightSetting[]
  score: number | null
  band: ScoreBand | null
  bands: Record<ScoreBand, number>
  counted: number
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return (numerator / denominator) * 100
}

export async function scoreStaff(ctx: AppContext): Promise<StaffScoreSummary> {
  ctx.require('score.view')
  // Staff scores are personnel data, not school-performance data: seeing the
  // school's health card does not entitle anyone to a ranked list of teachers.
  ctx.require('staff.view')

  const weights = await getWeights(ctx, 'STAFF')

  const session = await ctx.db.academicSession.findFirst({
    where: { isCurrent: true },
    select: { startsOn: true, endsOn: true },
  })

  const people = await ctx.db.staff.findMany({
    where: { deletedAt: null, leftOn: null },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      photoUrl: true,
      designation: true,
      department: true,
      staffType: true,
    },
  })

  const ids = people.map((p) => p.id)
  if (ids.length === 0) {
    return {
      staff: [],
      weights,
      score: null,
      band: null,
      bands: { EXCELLENT: 0, GOOD: 0, FAIR: 0, AT_RISK: 0 },
      counted: 0,
    }
  }

  const today = new Date()
  const from = session?.startsOn ?? new Date(today.getFullYear(), 0, 1)
  const to = session && today > session.endsOn ? session.endsOn : today
  const live = new Set(weights.filter((w) => w.isEnabled && w.weight > 0).map((w) => w.metric))

  const [attendance, appraisals] = await Promise.all([
    live.has('STAFF_ATTENDANCE') || live.has('STAFF_PUNCTUALITY')
      ? ctx.db.staffAttendance.groupBy({
          by: ['staffId', 'status'],
          where: { staffId: { in: ids }, onDate: { gte: from, lte: to } },
          _count: { _all: true },
        })
      : [],

    // Only completed cycles count. A draft appraisal is a work in progress, and
    // scoring somebody on a half-written review would be indefensible.
    live.has('STAFF_APPRAISAL')
      ? ctx.db.staffAppraisal.findMany({
          where: {
            staffId: { in: ids },
            status: 'COMPLETED',
            overallRating: { not: null },
          },
          orderBy: { periodTo: 'desc' },
          select: { staffId: true, overallRating: true, cycleName: true, periodTo: true },
        })
      : [],
  ])

  // Marking load has to be attributed to the teacher who set the work, which
  // groupBy cannot reach across the relation — so it is counted separately.
  const reviewByTeacher = live.has('STAFF_REVIEW')
    ? await ctx.db.homework.findMany({
        where: { teacherId: { in: ids }, assignedOn: { gte: from, lte: to }, deletedAt: null },
        select: {
          teacherId: true,
          submissions: { select: { status: true } },
        },
      })
    : []

  const attendanceBy = new Map<string, Record<string, number>>()
  for (const row of attendance) {
    const current = attendanceBy.get(row.staffId) ?? {}
    current[row.status] = row._count._all
    attendanceBy.set(row.staffId, current)
  }

  // The list is ordered newest first, so the first entry per person wins.
  const appraisalBy = new Map<string, { rating: number; cycle: string }>()
  for (const row of appraisals) {
    if (appraisalBy.has(row.staffId) || row.overallRating === null) continue
    appraisalBy.set(row.staffId, { rating: row.overallRating, cycle: row.cycleName })
  }

  const markingBy = new Map<string, { handedIn: number; marked: number }>()
  for (const homework of reviewByTeacher) {
    const current = markingBy.get(homework.teacherId) ?? { handedIn: 0, marked: 0 }
    for (const submission of homework.submissions) {
      // Work never handed in is not the teacher's to mark.
      if (submission.status === 'PENDING') continue
      current.handedIn += 1
      if (submission.status === 'REVIEWED') current.marked += 1
    }
    markingBy.set(homework.teacherId, current)
  }

  const staff: ScoredStaff[] = people.map((person) => {
    const days = attendanceBy.get(person.id) ?? {}
    const present = days.PRESENT ?? 0
    const absent = days.ABSENT ?? 0
    const late = days.LATE ?? 0
    const half = days.HALF_DAY ?? 0
    const marked = present + absent + late + half
    const attended = present + late + half

    const appraisal = appraisalBy.get(person.id)
    const marking = markingBy.get(person.id)

    const readings: MetricReading[] = [
      {
        metric: 'STAFF_ATTENDANCE',
        score: pct(present + late + half * 0.5, marked),
        detail: marked > 0 ? `${present} present of ${marked} days marked` : 'No attendance marked yet',
      },
      {
        metric: 'STAFF_PUNCTUALITY',
        score: pct(attended - late, attended),
        detail: attended > 0 ? `Late on ${late} of ${attended} days attended` : 'No attendance marked yet',
      },
      {
        metric: 'STAFF_APPRAISAL',
        // 1-5 maps onto 0-100 with 1 at the floor: the scale's lowest rating is
        // its lowest, not 20%.
        score: appraisal ? ((appraisal.rating - 1) / 4) * 100 : null,
        detail: appraisal
          ? `${appraisal.rating.toFixed(1)} of 5 in ${appraisal.cycle}`
          : 'No completed appraisal yet',
      },
      {
        metric: 'STAFF_REVIEW',
        score: marking ? pct(marking.marked, marking.handedIn) : null,
        detail: marking?.handedIn
          ? `${marking.marked} of ${marking.handedIn} submissions marked`
          : 'No homework handed in to mark',
      },
    ]

    return {
      staffId: person.id,
      employeeCode: person.employeeCode,
      firstName: person.firstName,
      lastName: person.lastName,
      photoUrl: person.photoUrl,
      designation: person.designation,
      department: person.department,
      staffType: person.staffType,
      composed: composeScore(readings, weights),
    }
  })

  staff.sort(
    (a, b) =>
      (b.composed.score ?? -1) - (a.composed.score ?? -1) ||
      a.firstName.localeCompare(b.firstName),
  )

  const scores = staff.map((s) => s.composed.score)
  const { score, counted } = averageScore(scores)

  return {
    staff,
    weights,
    score,
    band: score === null ? null : bandFor(score),
    bands: bandCounts(scores),
    counted,
  }
}
