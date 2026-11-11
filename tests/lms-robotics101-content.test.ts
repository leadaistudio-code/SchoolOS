import { describe, expect, it } from 'vitest'
import { BADGES, LESSONS, MODULES, RESOURCES, earnedBadges, resourcesFor } from '@/lib/lms/robotics101'
import { lessonContent, planSync, type ExistingLesson } from '@/lib/lms/robotics101/plan'
import { gradeQuiz, publicQuiz } from '@/lib/lms/options'
import { activityIds, blankIsRight, videoForViewer } from '@/lib/lms/rich'
import { HOTSPOT_BOARDS, hotspotSpot } from '@/lib/lms/robotics101/hotspots'

const NO_MEDIA = { videos: {} }

describe('Robotics 101 curriculum', () => {
  it('has 4 modules and 15 lessons, 3–4 hours in total', () => {
    expect(MODULES).toHaveLength(4)
    expect(LESSONS).toHaveLength(15)
    const minutes = LESSONS.reduce((n, l) => n + l.minutes, 0)
    expect(minutes).toBeGreaterThanOrEqual(180)
    expect(minutes).toBeLessThanOrEqual(240)
    expect(new Set(LESSONS.map((l) => l.slug)).size).toBe(15)
  })

  it('every lesson validates and has the full lesson structure', () => {
    for (const def of LESSONS) {
      const content = lessonContent(def, NO_MEDIA)
      expect(content.intro.length, def.slug).toBeGreaterThan(40)
      expect(content.objectives.length, def.slug).toBeGreaterThanOrEqual(2)
      expect(content.summary.length, def.slug).toBeGreaterThanOrEqual(2)
      expect(content.next, def.slug).toBeTruthy()
      if (def.kind === 'INTERACTIVE') expect(activityIds(content).length, def.slug).toBeGreaterThan(0)
      if (def.slug !== 'r101-15-final-assessment') expect(content.video, def.slug).toBeDefined()
      expect(new Set(activityIds(content)).size, `${def.slug} activity ids are unique`).toBe(activityIds(content).length)
    }
  })

  it('graded checks pass at 80% and have exactly the right number of correct answers', () => {
    for (const def of LESSONS.filter((l) => l.kind !== 'PROJECT')) {
      expect(def.quiz?.questions.length, def.slug).toBeGreaterThanOrEqual(def.kind === 'QUIZ' ? 10 : 3)
      expect(def.passPercent ?? 80).toBe(80)
      for (const q of def.quiz!.questions) {
        const right = q.options.filter((o) => o.correct).length
        expect(right, `${def.slug} ${q.id}`).toBeGreaterThanOrEqual(1)
        if (!q.multiple) expect(right, `${def.slug} ${q.id}`).toBe(1)
      }
      const perfect = Object.fromEntries(def.quiz!.questions.map((q) => [q.id, q.options.filter((o) => o.correct).map((o) => o.id)]))
      expect(gradeQuiz(def.quiz!, perfect, 80).passed).toBe(true)
      expect(gradeQuiz(def.quiz!, {}, 80).passed).toBe(false)
    }
  })

  it('never sends answers to the learner', () => {
    for (const def of LESSONS.filter((l) => l.quiz)) {
      const json = JSON.stringify(publicQuiz(def.quiz!))
      expect(json).not.toContain('"correct"')
      expect(json).not.toContain('explanation')
    }
  })

  it('every code-lab blank accepts its own first answer', () => {
    for (const def of LESSONS) {
      for (const block of lessonContent(def, NO_MEDIA).blocks) {
        if (block.type !== 'code-lab') continue
        for (const task of block.tasks) {
          for (const blank of task.blanks) {
            expect(task.code, `${task.id} uses {{${blank.id}}}`).toContain(`{{${blank.id}}}`)
            expect(blankIsRight(blank.answers, blank.answers[0]!)).toBe(true)
          }
        }
      }
    }
  })

  it('hotspot answers are real spots, and no two spots overlap', () => {
    const boards = new Set<string>()
    for (const def of LESSONS) {
      for (const block of lessonContent(def, NO_MEDIA).blocks) {
        if (block.type !== 'hotspot') continue
        boards.add(block.board)
        for (const q of block.questions) for (const s of q.spots) expect(hotspotSpot(block.board, s), `${block.id} ${q.id} → ${s}`).toBeDefined()
      }
    }
    expect([...boards].sort()).toEqual(['ir-module', 'l298n', 'uno'])
    for (const [board, { spots, view }] of Object.entries(HOTSPOT_BOARDS)) {
      const [vx, vy, vw, vh] = view
      expect(new Set(spots.map((s) => s.id)).size, board).toBe(spots.length)
      for (const a of spots) {
        expect(a.x >= vx && a.y >= vy && a.x + a.w <= vx + vw && a.y + a.h <= vy + vh, `${board} ${a.id} inside the view`).toBe(true)
        for (const b of spots) {
          if (a === b) continue
          const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0
          expect(overlap, `${board}: ${a.id} overlaps ${b.id}`).toBe(false)
        }
      }
    }
  })

  it('hides unrendered videos from learners but not from staff', () => {
    const video = lessonContent(LESSONS[0]!, NO_MEDIA).video
    expect(video?.status).toBe('draft')
    expect(videoForViewer(video, false)).toBeNull()
    expect(videoForViewer(video, true)).not.toBeNull()
    const ready = lessonContent(LESSONS[0]!, { videos: { v01: { src: '/v.mp4', poster: '/p.jpg', captions: '/c.vtt', durationSeconds: 120, verified: true } } }).video
    expect(ready?.status).toBe('ready')
    expect(videoForViewer(ready, false)?.src).toBe('/v.mp4')
  })

  it('awards badges only when every lesson in them is complete', () => {
    expect(BADGES.map((b) => b.name)).toEqual(['Robot Explorer', 'Sensor Detective', 'Circuit Builder', 'Code Creator', 'Robot Engineer', 'Line-Follower Champion'])
    for (const b of BADGES) for (const s of b.lessons) expect(LESSONS.some((l) => l.slug === s)).toBe(true)
    const some = earnedBadges(new Set(['r101-04-ir-sensors']))
    expect(some.find((b) => b.id === 'sensor-detective')?.earned).toBe(false)
    const all = earnedBadges(new Set(LESSONS.map((l) => l.slug)))
    expect(all.every((b) => b.earned)).toBe(true)
  })

  it('lists 12 resources and keeps the teacher guide out of student downloads', () => {
    expect(RESOURCES).toHaveLength(12)
    const student = LESSONS.flatMap((l) => resourcesFor(l.slug))
    expect(student.some((r) => r.title === 'Teacher guide')).toBe(false)
  })
})

describe('Robotics 101 content sync plan', () => {
  const modules = [
    { id: 'm-a', title: 'How robots work', position: 1 },
    { id: 'm-b', title: 'Build the robot', position: 2 },
  ]
  const lesson = (id: string, title: string, moduleId: string, extra: Partial<ExistingLesson> = {}): ExistingLesson => ({
    id,
    title,
    moduleId,
    slug: null,
    archivedAt: null,
    content: null,
    contentVersion: 1,
    ...extra,
  })
  const existing = [
    lesson('l1', 'Sense, think, act', 'm-a'),
    lesson('l2', 'Quick check', 'm-a'),
    lesson('l3', 'Video: How a robot sees the line', 'm-b'),
    lesson('l4', 'Video: Driving the motors', 'm-b'),
    lesson('l5', 'Quiz: Sensors and motors', 'm-b'),
    lesson('l6', 'Reading the IR sensor', 'm-b'),
    lesson('l7', 'Project: follow the line', 'm-b'),
  ]

  it('reuses the old lessons (and their progress) and archives the rest', () => {
    const plan = planSync(modules, existing, NO_MEDIA)
    expect(plan.moduleOps.map((m) => m.existingId)).toEqual(['m-a', 'm-b', null, null])
    const reused = Object.fromEntries(plan.lessonOps.filter((l) => l.existingId).map((l) => [l.existingId, l.def.slug]))
    expect(reused).toEqual({
      l1: 'r101-02-sense-think-act',
      l3: 'r101-04-ir-sensors',
      l4: 'r101-05-motors',
      l6: 'r101-09-read-sensors',
      l7: 'r101-14-final-challenge',
    })
    expect(plan.archive.sort()).toEqual(['l2', 'l5'])
    expect(plan.lessonOps).toHaveLength(15)
  })

  it('is idempotent: a second run matches by slug and changes nothing', () => {
    const first = planSync(modules, existing, NO_MEDIA)
    const after: ExistingLesson[] = first.lessonOps.map((l, i) =>
      lesson(l.existingId ?? `new-${i}`, l.def.title, 'm', { slug: l.def.slug, content: JSON.parse(JSON.stringify(l.content)) }),
    )
    const renamed = first.moduleOps.map((m, i) => ({ id: m.existingId ?? `mod-${i}`, title: m.title, position: m.position }))
    const second = planSync(renamed, [...after, lesson('l2', 'Quick check', 'm-a', { archivedAt: new Date() })], NO_MEDIA)
    expect(second.lessonOps.every((l) => l.existingId && !l.contentChanged)).toBe(true)
    expect(second.archive).toEqual([])
    expect(second.moduleOps.every((m) => m.existingId)).toBe(true)
  })
})
