import { describe, expect, it } from 'vitest'
import { capacityProblems, solveTimetable, type SolverInput, type SolverSlot } from '@/lib/timetable-solver'

const periods = [
  { id: 'p1', isBreak: false },
  { id: 'p2', isBreak: false },
  { id: 'brk', isBreak: true },
  { id: 'p3', isBreak: false },
  { id: 'p4', isBreak: false },
]
const days = [1, 2, 3, 4, 5]

function noClashes(slots: SolverSlot[]) {
  const section = new Set<string>()
  const teacher = new Set<string>()
  for (const s of slots) {
    const sk = `${s.sectionId}|${s.day}|${s.periodId}`
    expect(section.has(sk), `section clash ${sk}`).toBe(false)
    section.add(sk)
    if (s.teacherId) {
      const tk = `${s.teacherId}|${s.day}|${s.periodId}`
      expect(teacher.has(tk), `teacher clash ${tk}`).toBe(false)
      teacher.add(tk)
    }
  }
}

function base(over: Partial<SolverInput> = {}): SolverInput {
  return {
    days,
    periods,
    demands: [
      // Two sections share the maths and English teachers: 20 periods each, exactly full.
      ...['A', 'B'].flatMap((sec) => [
        { sectionId: sec, classSubjectId: 'maths', teacherId: 'tMaths', perWeek: 6, maxPerDay: 2, double: false },
        { sectionId: sec, classSubjectId: 'eng', teacherId: 'tEng', perWeek: 5, maxPerDay: null, double: false },
        { sectionId: sec, classSubjectId: 'sci', teacherId: `tSci${sec}`, perWeek: 4, maxPerDay: null, double: true },
        { sectionId: sec, classSubjectId: 'art', teacherId: `tArt${sec}`, perWeek: 5, maxPerDay: null, double: false },
      ]),
    ],
    fixed: [],
    teacherMaxPerDay: {},
    teacherUnavailable: {},
    ...over,
  }
}

describe('timetable solver', () => {
  it('fills a full week for two sections without any clash', () => {
    const r = solveTimetable(base(), { seed: 3 })
    expect(r.placed).toBe(r.wanted)
    expect(r.unplaced).toEqual([])
    noClashes(r.slots)
  })

  it('places double periods back to back and never across a break', () => {
    const r = solveTimetable(base(), { seed: 5 })
    const order = periods.map((p) => p.id)
    for (const sec of ['A', 'B']) {
      for (const day of days) {
        const sci = r.slots.filter((s) => s.sectionId === sec && s.day === day && s.classSubjectId === 'sci').map((s) => order.indexOf(s.periodId)).sort()
        if (sci.length === 0) continue
        expect(sci.length).toBe(2)
        expect(sci[1]! - sci[0]!).toBe(1)
      }
    }
  })

  it('respects a subject’s daily cap', () => {
    const r = solveTimetable(base(), { seed: 7 })
    for (const day of days) {
      expect(r.slots.filter((s) => s.sectionId === 'A' && s.day === day && s.classSubjectId === 'maths').length).toBeLessThanOrEqual(2)
    }
  })

  it('keeps fixed lessons and teacher blocks off limits', () => {
    const fixed: SolverSlot[] = [{ sectionId: 'Z', day: 1, periodId: 'p1', classSubjectId: 'x', teacherId: 'tMaths' }]
    const r = solveTimetable(base({ fixed, teacherUnavailable: { tEng: ['2:p1', '2:p2'] } }), { seed: 11 })
    noClashes([...fixed, ...r.slots])
    expect(r.slots.some((s) => s.teacherId === 'tEng' && s.day === 2 && (s.periodId === 'p1' || s.periodId === 'p2'))).toBe(false)
  })

  it('reports what it cannot fit instead of double-booking', () => {
    const r = solveTimetable(
      base({ demands: [{ sectionId: 'A', classSubjectId: 'maths', teacherId: 't', perWeek: 30, maxPerDay: 10, double: false }] }),
      { seed: 1, attempts: 3 },
    )
    expect(r.placed).toBe(20)
    expect(r.unplaced).toEqual([{ sectionId: 'A', classSubjectId: 'maths', missing: 10 }])
  })

  it('gives the same answer for the same seed, so apply matches the preview', () => {
    const a = solveTimetable(base(), { seed: 42 })
    const b = solveTimetable(base(), { seed: 42 })
    expect(b.slots).toEqual(a.slots)
  })

  it('warns about impossible loads before solving', () => {
    const problems = capacityProblems({
      days: 5,
      teachingPeriods: 4,
      sections: [{ id: 'A', label: '6 A', demand: 22 }],
      teachers: [{ id: 't', label: 'Mrs Rao', load: 18, maxPerDay: 3, unavailable: 0 }],
    })
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('6 A needs 22')
    expect(problems[1]).toContain('at most 15')
  })
})
