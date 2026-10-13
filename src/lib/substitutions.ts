/**
 * Who should cover a lesson. Pure so the ranking can be tested and explained:
 * every suggestion carries the reasons it scored the way it did.
 */

export type CoverCandidate = {
  id: string
  name: string
  /** Subjects this teacher teaches anywhere in the school. */
  subjectIds: Set<string>
  /** Classes this teacher already teaches. */
  classLevelIds: Set<string>
  /** Periods on this day already taken by their own lessons or other cover. */
  busyPeriodIds: Set<string>
  lessonsToday: number
  coverToday: number
  coverThisWeek: number
  maxPerDay: number | null
}

export type CoverLesson = {
  periodId: string
  subjectId: string | null
  classLevelId: string
}

export type RankedCandidate = {
  id: string
  name: string
  score: number
  reasons: string[]
}

export function rankSubstitutes(
  lesson: CoverLesson,
  candidates: CoverCandidate[],
  /** Teachers already handed a lesson in this period during the same run. */
  takenThisPeriod: Set<string> = new Set(),
): RankedCandidate[] {
  const ranked: RankedCandidate[] = []

  for (const c of candidates) {
    if (c.busyPeriodIds.has(lesson.periodId) || takenThisPeriod.has(c.id)) continue
    const dayLoad = c.lessonsToday + c.coverToday
    if (c.maxPerDay != null && dayLoad >= c.maxPerDay) continue

    let score = 0
    const reasons: string[] = []
    if (lesson.subjectId && c.subjectIds.has(lesson.subjectId)) {
      score += 50
      reasons.push('Teaches this subject')
    }
    if (c.classLevelIds.has(lesson.classLevelId)) {
      score += 15
      reasons.push('Knows this class')
    }
    score -= c.coverThisWeek * 6 + c.coverToday * 10 + c.lessonsToday * 2
    reasons.push(
      c.coverThisWeek === 0 ? 'No cover yet this week' : `${c.coverThisWeek} cover this week`,
    )
    reasons.push(`${dayLoad} period${dayLoad === 1 ? '' : 's'} today`)

    ranked.push({ id: c.id, name: c.name, score, reasons })
  }

  return ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

export type AutoAssignLesson = CoverLesson & { key: string }

/**
 * Hands every uncovered lesson to its best free teacher, one lesson at a time,
 * updating each teacher's load as it goes so the work spreads out. Lessons in
 * the busiest periods go first: they have the fewest free teachers.
 */
export function planAutoCover(
  lessons: AutoAssignLesson[],
  candidates: CoverCandidate[],
): Map<string, string> {
  const pool = candidates.map((c) => ({ ...c, busyPeriodIds: new Set(c.busyPeriodIds) }))
  const freeIn = (periodId: string) => pool.filter((c) => !c.busyPeriodIds.has(periodId)).length
  const order = [...lessons].sort((a, b) => freeIn(a.periodId) - freeIn(b.periodId))

  const plan = new Map<string, string>()
  for (const lesson of order) {
    const [best] = rankSubstitutes(lesson, pool)
    if (!best) continue
    plan.set(lesson.key, best.id)
    const chosen = pool.find((c) => c.id === best.id)!
    chosen.busyPeriodIds.add(lesson.periodId)
    chosen.coverToday += 1
    chosen.coverThisWeek += 1
  }
  return plan
}
