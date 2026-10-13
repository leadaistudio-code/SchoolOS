export type SolverPeriod = { id: string; isBreak: boolean }

export type SolverDemand = {
  sectionId: string
  classSubjectId: string
  teacherId: string | null
  /** Lessons still to place this week (after any kept lessons). */
  perWeek: number
  maxPerDay: number | null
  double: boolean
}

export type SolverSlot = { sectionId: string; day: number; periodId: string; classSubjectId: string; teacherId: string | null }

export type SolverInput = {
  days: number[]
  /** The whole school day in order, breaks included: a double cannot straddle a break. */
  periods: SolverPeriod[]
  demands: SolverDemand[]
  /** Lessons that stay as they are: kept lessons and other sections' timetables. */
  fixed: SolverSlot[]
  teacherMaxPerDay: Record<string, number | null | undefined>
  /** "day:periodId" keys a teacher cannot take. */
  teacherUnavailable: Record<string, string[] | undefined>
}

export type Unplaced = { sectionId: string; classSubjectId: string; missing: number }

export type SolverResult = {
  slots: SolverSlot[]
  unplaced: Unplaced[]
  placed: number
  wanted: number
  seed: number
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Unit = { demand: SolverDemand; size: 1 | 2; key: string }

const defaultMaxPerDay = (d: SolverDemand, days: number) => d.maxPerDay ?? (d.perWeek > days ? 2 : 1) * (d.double ? 2 : 1)

/** One greedy pass with a given seed, then a swap-based repair for whatever did not fit. */
export function solveOnce(input: SolverInput, seed: number): SolverResult {
  const rand = mulberry32(seed)
  const teaching = input.periods.map((p, i) => ({ ...p, i })).filter((p) => !p.isBreak)
  const dayCount = input.days.length

  const sectionBusy = new Set<string>()
  const teacherBusy = new Set<string>()
  const teacherDay = new Map<string, number>()
  const subjectDay = new Map<string, number>()
  const sectionDay = new Map<string, number>()
  const unavailable = new Map(Object.entries(input.teacherUnavailable).map(([t, keys]) => [t, new Set(keys ?? [])]))
  const capOf = new Map(input.demands.map((d) => [`${d.sectionId}|${d.classSubjectId}`, defaultMaxPerDay(d, dayCount)]))

  const bump = (m: Map<string, number>, k: string, by: number) => m.set(k, (m.get(k) ?? 0) + by)
  const mark = (s: SolverSlot, by: 1 | -1) => {
    const cell = `${s.sectionId}|${s.day}|${s.periodId}`
    if (by > 0) sectionBusy.add(cell)
    else sectionBusy.delete(cell)
    bump(sectionDay, `${s.sectionId}|${s.day}`, by)
    bump(subjectDay, `${s.sectionId}|${s.classSubjectId}|${s.day}`, by)
    if (s.teacherId) {
      const t = `${s.teacherId}|${s.day}|${s.periodId}`
      if (by > 0) teacherBusy.add(t)
      else teacherBusy.delete(t)
      bump(teacherDay, `${s.teacherId}|${s.day}`, by)
    }
  }
  input.fixed.forEach((s) => mark(s, 1))

  /** Whether `size` lessons of this subject can go into these cells on this day. */
  const fits = (sectionId: string, classSubjectId: string, teacherId: string | null, day: number, periodIds: string[]) => {
    const cap = capOf.get(`${sectionId}|${classSubjectId}`) ?? Infinity
    if ((subjectDay.get(`${sectionId}|${classSubjectId}|${day}`) ?? 0) + periodIds.length > cap) return false
    if (teacherId) {
      const tMax = input.teacherMaxPerDay[teacherId]
      if (tMax != null && (teacherDay.get(`${teacherId}|${day}`) ?? 0) + periodIds.length > tMax) return false
      const blocked = unavailable.get(teacherId)
      for (const pid of periodIds) {
        if (teacherBusy.has(`${teacherId}|${day}|${pid}`) || blocked?.has(`${day}:${pid}`)) return false
      }
    }
    return periodIds.every((pid) => !sectionBusy.has(`${sectionId}|${day}|${pid}`))
  }

  const units: Unit[] = []
  const teacherLoad = new Map<string, number>()
  for (const d of input.demands) {
    if (d.perWeek <= 0) continue
    const key = `${d.sectionId}|${d.classSubjectId}`
    const pairs = d.double ? Math.floor(d.perWeek / 2) : 0
    for (let i = 0; i < pairs; i++) units.push({ demand: d, size: 2, key })
    for (let i = 0; i < d.perWeek - pairs * 2; i++) units.push({ demand: d, size: 1, key })
    if (d.teacherId) teacherLoad.set(d.teacherId, (teacherLoad.get(d.teacherId) ?? 0) + d.perWeek)
  }

  // Hardest first: doubles, then the busiest teachers, with a little noise so
  // restarts explore different orders.
  const weight = (u: Unit) => (u.size === 2 ? 1000 : 0) + (u.demand.teacherId ? (teacherLoad.get(u.demand.teacherId) ?? 0) * 10 : 0) + rand() * 15
  const ordered = units.map((u) => ({ u, w: weight(u) })).sort((a, b) => b.w - a.w).map((x) => x.u)

  const slots: (SolverSlot & { paired: boolean })[] = []
  const failed: Unit[] = []

  for (const unit of ordered) {
    const d = unit.demand
    let best: { day: number; ids: string[]; score: number } | null = null
    for (const day of input.days) {
      const already = subjectDay.get(`${d.sectionId}|${d.classSubjectId}|${day}`) ?? 0
      for (let k = 0; k < teaching.length; k++) {
        const run = unit.size === 2 ? [teaching[k], teaching[k + 1]] : [teaching[k]]
        if (run.some((p) => !p)) continue
        if (unit.size === 2 && run[1]!.i !== run[0]!.i + 1) continue
        const ids = run.map((p) => p!.id)
        if (!fits(d.sectionId, d.classSubjectId, d.teacherId, day, ids)) continue
        const score =
          (already === 0 ? 40 : 0) -
          (sectionDay.get(`${d.sectionId}|${day}`) ?? 0) * 3 -
          (d.teacherId ? (teacherDay.get(`${d.teacherId}|${day}`) ?? 0) * 4 : 0) -
          k * 0.5 +
          rand() * 6
        if (!best || score > best.score) best = { day, ids, score }
      }
    }
    if (!best) {
      failed.push(unit)
      continue
    }
    for (const periodId of best.ids) {
      const s = { sectionId: d.sectionId, day: best.day, periodId, classSubjectId: d.classSubjectId, teacherId: d.teacherId, paired: unit.size === 2 }
      mark(s, 1)
      slots.push(s)
    }
  }

  // Repair: a single lesson that found no cell usually fails because its
  // teacher is busy in every period the section still has free. Move one of
  // the section's own single lessons into a free cell, and take its place.
  const missing = new Map<string, number>()
  for (const unit of failed) {
    const d = unit.demand
    let placed = false
    if (unit.size === 1) {
      const freeCells: { day: number; periodId: string }[] = []
      for (const day of input.days) for (const p of teaching) if (!sectionBusy.has(`${d.sectionId}|${day}|${p.id}`)) freeCells.push({ day, periodId: p.id })

      outer: for (const free of freeCells) {
        for (let i = 0; i < slots.length; i++) {
          const x = slots[i]!
          if (x.sectionId !== d.sectionId || x.paired) continue
          mark(x, -1)
          const moved = { ...x, day: free.day, periodId: free.periodId }
          if (fits(x.sectionId, x.classSubjectId, x.teacherId, free.day, [free.periodId])) {
            mark(moved, 1)
            if (fits(d.sectionId, d.classSubjectId, d.teacherId, x.day, [x.periodId])) {
              const s = { sectionId: d.sectionId, day: x.day, periodId: x.periodId, classSubjectId: d.classSubjectId, teacherId: d.teacherId, paired: false }
              mark(s, 1)
              slots[i] = moved
              slots.push(s)
              placed = true
              break outer
            }
            mark(moved, -1)
          }
          mark(x, 1)
        }
      }
    }
    if (!placed) bump(missing, unit.key, unit.size)
  }

  const unplaced: Unplaced[] = [...missing.entries()].map(([key, n]) => {
    const [sectionId, classSubjectId] = key.split('|') as [string, string]
    return { sectionId, classSubjectId, missing: n }
  })
  const wanted = input.demands.reduce((s, d) => s + Math.max(0, d.perWeek), 0)
  return { slots: slots.map(({ paired: _paired, ...s }) => s), unplaced, placed: slots.length, wanted, seed }
}

/**
 * Best of several greedy passes. Deterministic for a given starting seed, so
 * the server can re-run exactly what was previewed instead of trusting a slot
 * list from the browser.
 */
export function solveTimetable(input: SolverInput, opts: { attempts?: number; seed?: number } = {}): SolverResult {
  const attempts = opts.attempts ?? 40
  const base = opts.seed ?? 1
  let best: SolverResult | null = null
  for (let i = 0; i < attempts; i++) {
    const r = solveOnce(input, base + i * 7919)
    if (!best || r.placed > best.placed) best = r
    if (best.placed === best.wanted) break
  }
  return best!
}

/** Hard limits a requirement set breaks before any solving is tried. */
export function capacityProblems(input: {
  days: number
  teachingPeriods: number
  sections: { id: string; label: string; demand: number }[]
  teachers: { id: string; label: string; load: number; maxPerDay: number | null; unavailable: number }[]
}): string[] {
  const out: string[] = []
  const perSection = input.days * input.teachingPeriods
  for (const s of input.sections) {
    if (s.demand > perSection) out.push(`${s.label} needs ${s.demand} lessons but has only ${perSection} periods a week.`)
  }
  for (const t of input.teachers) {
    const cap = Math.min(perSection - t.unavailable, t.maxPerDay != null ? t.maxPerDay * input.days : Infinity)
    if (t.load > cap) out.push(`${t.label} is asked to teach ${t.load} lessons but can take at most ${cap}.`)
  }
  return out
}
