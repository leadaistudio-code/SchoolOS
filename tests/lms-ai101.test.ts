import { describe, expect, it } from 'vitest'
import { AI_101 } from '@/lib/lms/ai101'
import { biasFixed, ANIMALS_TEST, ANIMALS_TRAIN, FIXED_SCORES, FRUIT, LEAF_BATCHES, PIXEL_PUZZLES, PIXEL_SIZE, REVIEWS, STORIES } from '@/lib/lms/ai101/lab-data'
import {
  accuracy,
  biggestMixUp,
  classify,
  confusion,
  decode,
  encode,
  GRID,
  knn,
  nextWords,
  normaliseInk,
  pickNext,
  sentimentScore,
  trainBigrams,
  type TreeNode,
} from '@/lib/lms/ai101/ml'
import { CURRICULA, playerOptionsFor } from '@/lib/lms/curricula'
import { curriculumLessons } from '@/lib/lms/curriculum'
import { lessonContent } from '@/lib/lms/curriculum/plan'
import { gradeQuiz, publicQuiz } from '@/lib/lms/options'
import { activityIds } from '@/lib/lms/rich'
import { virtualEvidence } from '@/server/modules/lms/projects'
import { personalDetail, unsafeTopic } from '@/server/modules/lms/ai-chat'

const NO_MEDIA = { videos: {} }
const LESSONS = curriculumLessons(AI_101)

describe('AI for Young Builders curriculum', () => {
  it('has 4 modules and 15 lessons, 3–4 hours, free, for Classes 5–8', () => {
    expect(AI_101.modules).toHaveLength(4)
    expect(LESSONS).toHaveLength(15)
    const minutes = LESSONS.reduce((n, l) => n + l.minutes, 0)
    expect(minutes).toBeGreaterThanOrEqual(180)
    expect(minutes).toBeLessThanOrEqual(260)
    expect(AI_101.course).toMatchObject({ category: 'AI', gradeFrom: 5, gradeTo: 8, academyPriceMinor: 0 })
  })

  it('every lesson validates, has a full structure and a video except the final assessment', () => {
    for (const def of LESSONS) {
      const content = lessonContent(AI_101, def, NO_MEDIA)
      expect(content.intro.length, def.slug).toBeGreaterThan(40)
      expect(content.objectives.length, def.slug).toBeGreaterThanOrEqual(2)
      expect(content.summary.length, def.slug).toBeGreaterThanOrEqual(2)
      if (def.kind === 'INTERACTIVE') expect(activityIds(content).length, def.slug).toBeGreaterThan(0)
      if (def.kind !== 'QUIZ') expect(AI_101.videoById(def.videoId), def.slug).toBeDefined()
      expect(new Set(activityIds(content)).size, `${def.slug} activity ids are unique`).toBe(activityIds(content).length)
    }
    expect(AI_101.videos).toHaveLength(14)
  })

  it('graded checks pass at 80% and never leak answers', () => {
    for (const def of LESSONS.filter((l) => l.kind !== 'PROJECT')) {
      expect(def.quiz?.questions.length, def.slug).toBeGreaterThanOrEqual(def.kind === 'QUIZ' ? 10 : 3)
      for (const q of def.quiz!.questions) if (!q.multiple) expect(q.options.filter((o) => o.correct).length, `${def.slug} ${q.id}`).toBe(1)
      const perfect = Object.fromEntries(def.quiz!.questions.map((q) => [q.id, q.options.filter((o) => o.correct).map((o) => o.id)]))
      expect(gradeQuiz(def.quiz!, perfect, 80).passed).toBe(true)
      expect(JSON.stringify(publicQuiz(def.quiz!))).not.toContain('"correct"')
    }
  })

  it('slugs and video ids are unique across every curriculum', () => {
    const slugs = CURRICULA.flatMap((c) => curriculumLessons(c).map((l) => l.slug))
    const videos = CURRICULA.flatMap((c) => c.videos.map((v) => v.id))
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(videos).size).toBe(videos.length)
  })

  it('lesson player options follow the course', () => {
    expect(playerOptionsFor('r101-14-final-challenge').capstone).toBe(true)
    expect(playerOptionsFor('ai101-14-project').capstone).toBeFalsy()
    expect(playerOptionsFor('ai101-14-project').projectUploads).toBeTruthy()
  })

  it('badges and resources point at real lessons and files', () => {
    const slugs = new Set(LESSONS.map((l) => l.slug))
    for (const b of AI_101.badges) for (const s of b.lessons) expect(slugs.has(s), `${b.id} ${s}`).toBe(true)
    for (const l of LESSONS) for (const r of AI_101.resourcesFor(l.slug)) expect(r.href.startsWith(AI_101.mediaBase)).toBe(true)
  })
})

describe('AI lab maths', () => {
  it('k-nearest neighbours votes and breaks ties by distance', () => {
    const ex = [
      { label: 0, v: [0, 0] },
      { label: 0, v: [0, 1] },
      { label: 1, v: [5, 5] },
    ]
    expect(knn(ex, [0.2, 0.2], 1, 2)!.label).toBe(0)
    expect(knn(ex, [4, 4], 1, 2)!.label).toBe(1)
    expect(knn(ex, [4, 4], 3, 2)!.label).toBe(0)
    expect(knn([], [0, 0], 3, 2)).toBeNull()
  })

  it('k = 1 and k = 5 disagree somewhere on the fruit chart', () => {
    const ex = FRUIT.map((d) => ({ label: d.label, v: [d.x, d.y] }))
    let found = false
    for (let x = 0; x <= 10 && !found; x += 0.25) for (let y = 0; y <= 10 && !found; y += 0.25) found = knn(ex, [x, y], 1, 2)!.label !== knn(ex, [x, y], 5, 2)!.label
    expect(found).toBe(true)
  })

  it('a drawing is the same wherever and however big it is drawn', () => {
    const size = 64
    const square = (x0: number, y0: number, s: number) => {
      const a = new Uint8Array(size * size)
      for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) if (x === x0 || y === y0 || x === x0 + s - 1 || y === y0 + s - 1) a[y * size + x] = 255
      return a
    }
    const a = normaliseInk(square(4, 4, 20), size)!
    const b = normaliseInk(square(30, 20, 30), size)!
    expect(a).toHaveLength(GRID * GRID)
    const diff = a.reduce((s, v, i) => s + Math.abs(v - b[i]!), 0) / a.length
    expect(diff).toBeLessThan(0.15)
    expect(normaliseInk(new Uint8Array(size * size), size)).toBeNull()
    expect(decode(encode([0, 0.5, 1]))).toEqual([0, 8 / 15, 1])
  })

  it('confusion matrix, accuracy and the biggest mix-up', () => {
    const tests = [
      { truth: 0, predicted: 0 },
      { truth: 0, predicted: 1 },
      { truth: 1, predicted: 1 },
      { truth: 1, predicted: 0 },
      { truth: 1, predicted: 0 },
    ]
    const m = confusion(tests, 2)
    expect(m).toEqual([
      [1, 1],
      [2, 1],
    ])
    expect(accuracy(tests)).toBe(40)
    expect(biggestMixUp(m)).toEqual({ truth: 1, predicted: 0, count: 2 })
  })

  it('the bias lab starts unfair and adding neem leaves fixes it', () => {
    const start = biasFixed(0)
    expect(start.a - start.b).toBeGreaterThanOrEqual(30)
    expect(start.fixed).toBe(false)
    expect(biasFixed(LEAF_BATCHES).fixed).toBe(true)
  })

  it('a good animal tree is perfect on training and misses an unusual animal', () => {
    const tree: TreeNode = { q: 'feathers', yes: 'Bird', no: { q: 'fur', yes: 'Mammal', no: 'Fish' } }
    expect(ANIMALS_TRAIN.every((a) => classify(tree, a) === a.kind)).toBe(true)
    expect(ANIMALS_TEST.some((a) => classify(tree, a) !== a.kind)).toBe(true)
  })

  it('word scores get the plain reviews right and need the “not” rule for the rest', () => {
    const scores = { delicious: 2, tasty: 2, fresh: 1, love: 2, great: 2, cold: -1, stale: -2, soggy: -1, boring: -1, awful: -2, ...FIXED_SCORES }
    const right = (flip: boolean) => REVIEWS.filter((r) => { const t = sentimentScore(r.text, scores, flip); return t !== 0 && t > 0 === r.happy }).length
    expect(right(false)).toBe(REVIEWS.filter((r) => !r.not).length)
    expect(right(true)).toBe(REVIEWS.length)
  })

  it('the next-word model counts what follows and picks by chance', () => {
    const model = trainBigrams('The cat sat. The cat ran. The dog sat.')
    const after = nextWords(model, 'the')
    expect(after[0]).toEqual({ word: 'cat', chance: 2 / 3 })
    expect(pickNext(after, 0)).toBe('cat')
    expect(pickNext(after, 0.99)).toBe('dog')
    for (const s of STORIES) expect(nextWords(trainBigrams(s.text), 'the').length, s.id).toBeGreaterThan(3)
  })

  it('pixel puzzles are the right size', () => {
    for (const p of PIXEL_PUZZLES) {
      expect(p.rows).toHaveLength(PIXEL_SIZE)
      for (const r of p.rows) expect(r).toMatch(new RegExp(`^[01]{${PIXEL_SIZE}}$`))
    }
  })
})

describe('AI project evidence', () => {
  it('summarises a trained model from saved state, only for labs in the lesson', () => {
    const content = { blocks: [{ type: 'classifier-lab', id: 'project-model', title: 'My model', labels: ['Cat', 'Dog'] }] }
    const state = {
      'model:project-model': { counts: [8, 9], trainedOn: 17, tests: [{ truth: 0, predicted: 0 }, { truth: 1, predicted: 0 }], rounds: [{ examples: 17, tested: 2, accuracy: 50 }] },
      'model:not-in-lesson': { counts: [99], trainedOn: 99, tests: [], rounds: [] },
    }
    const e = virtualEvidence(state, content)
    expect(e.models).toEqual([{ title: 'My model', labels: ['Cat', 'Dog'], examples: [8, 9], tested: 2, accuracy: 50, rounds: [{ examples: 17, tested: 2, accuracy: 50 }] }])
  })
})

describe('Study helper guardrails', () => {
  it('blocks personal details', () => {
    for (const t of ['my phone is 98765 43210', 'email me at a.b@example.com', 'I live at 12 MG Road', 'My name is Riya', 'my password is cat123', 'pincode 560001', '1234 5678 9012'])
      expect(personalDetail(t), t).not.toBeNull()
    for (const t of ['What is 123456 times 2?', 'Explain photosynthesis for Class 6', 'Quiz me on fractions']) expect(personalDetail(t), t).toBeNull()
  })

  it('refuses unsafe topics', () => {
    expect(unsafeTopic('how to make a bomb')).toBe(true)
    expect(unsafeTopic('Explain how rainbows form')).toBe(false)
  })
})
