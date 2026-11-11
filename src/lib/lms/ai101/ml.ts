/**
 * The machine learning behind the AI for Young Builders labs. Small, exact and
 * dependency-free, so it runs in the browser and can be tested here.
 */

/* ------------------------------------------------------ nearest neighbours */

export type Example = { label: number; v: number[] }

export function distance(a: number[], b: number[]) {
  let s = 0
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    s += d * d
  }
  return Math.sqrt(s)
}

export type Prediction = {
  label: number
  /** Share of the k votes the winner got, 0–1. */
  confidence: number
  votes: number[]
  /** Indexes into the examples, nearest first. */
  neighbours: number[]
}

/** k-nearest neighbours. Ties go to the label whose voters are nearest in total. */
export function knn(examples: Example[], q: number[], k: number, classes: number): Prediction | null {
  if (!examples.length) return null
  const ranked = examples.map((e, i) => ({ i, d: distance(e.v, q), label: e.label })).sort((a, b) => a.d - b.d || a.i - b.i)
  const near = ranked.slice(0, Math.max(1, Math.min(k, ranked.length)))
  const votes = Array.from({ length: classes }, () => 0)
  const reach = Array.from({ length: classes }, () => 0)
  for (const n of near) {
    votes[n.label] = (votes[n.label] ?? 0) + 1
    reach[n.label] = (reach[n.label] ?? 0) + n.d
  }
  let label = 0
  for (let c = 1; c < classes; c++) {
    if (votes[c]! > votes[label]! || (votes[c] === votes[label] && votes[c]! > 0 && reach[c]! < reach[label]!)) label = c
  }
  return { label, confidence: votes[label]! / near.length, votes, neighbours: near.map((n) => n.i) }
}

/* ---------------------------------------------------- drawings and images */

export const GRID = 16

/** Pixel values 0–1 stored as one hex digit each (16 grey levels), so a drawing is 256 characters. */
export function encode(v: number[]) {
  return v.map((x) => Math.max(0, Math.min(15, Math.round(x * 15))).toString(16)).join('')
}

export function decode(s: string) {
  return [...s].map((c) => parseInt(c, 16) / 15)
}

/**
 * Ink from a square drawing (alpha 0–255 per pixel, row by row) cropped to its
 * bounding box, centred and scaled into a GRID × GRID square, so the same shape
 * drawn big, small or off-centre gives similar numbers.
 */
export function normaliseInk(alpha: ArrayLike<number>, size: number): number[] | null {
  let minX = size
  let minY = size
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if ((alpha[y * size + x] ?? 0) > 40) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  if (maxX < 0) return null
  const box = Math.max(maxX - minX + 1, maxY - minY + 1, size / 8)
  const cx = (minX + maxX + 1) / 2
  const cy = (minY + maxY + 1) / 2
  const pad = box * 0.12
  const span = box + pad * 2
  const x0 = cx - span / 2
  const y0 = cy - span / 2
  const out: number[] = []
  const cell = span / GRID
  const samples = 4
  for (let gy = 0; gy < GRID; gy++)
    for (let gx = 0; gx < GRID; gx++) {
      let sum = 0
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++) {
          const px = Math.floor(x0 + (gx + (sx + 0.5) / samples) * cell)
          const py = Math.floor(y0 + (gy + (sy + 0.5) / samples) * cell)
          if (px >= 0 && py >= 0 && px < size && py < size) sum += (alpha[py * size + px] ?? 0) / 255
        }
      out.push(Math.min(1, (sum / (samples * samples)) * 1.6))
    }
  return out
}

/** Camera frame (RGBA, w × h) to a small colour grid, values 0–1, brightness-balanced so lighting matters less. */
export const CAM_W = 12
export const CAM_H = 9
export function cameraFeatures(rgba: ArrayLike<number>, w: number, h: number): number[] {
  const out: number[] = []
  for (let gy = 0; gy < CAM_H; gy++)
    for (let gx = 0; gx < CAM_W; gx++) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      const xa = Math.floor((gx * w) / CAM_W)
      const xb = Math.floor(((gx + 1) * w) / CAM_W)
      const ya = Math.floor((gy * h) / CAM_H)
      const yb = Math.floor(((gy + 1) * h) / CAM_H)
      for (let y = ya; y < yb; y += 2)
        for (let x = xa; x < xb; x += 2) {
          const i = (y * w + x) * 4
          r += rgba[i] ?? 0
          g += rgba[i + 1] ?? 0
          b += rgba[i + 2] ?? 0
          n++
        }
      out.push(r / n / 255, g / n / 255, b / n / 255)
    }
  const mean = out.reduce((s, x) => s + x, 0) / out.length || 1
  return out.map((x) => Math.max(0, Math.min(1, (x / mean) * 0.5)))
}

/* ------------------------------------------------------------- testing */

export type TestRecord = { truth: number; predicted: number }

export function confusion(tests: TestRecord[], classes: number) {
  const m = Array.from({ length: classes }, () => Array.from({ length: classes }, () => 0))
  for (const t of tests) if (m[t.truth] && t.predicted < classes) m[t.truth]![t.predicted]!++
  return m
}

export function accuracy(tests: TestRecord[]) {
  return tests.length ? Math.round((tests.filter((t) => t.truth === t.predicted).length / tests.length) * 100) : 0
}

/** The most frequent mistake, if any: real class and what it was taken for. */
export function biggestMixUp(m: number[][]) {
  let best: { truth: number; predicted: number; count: number } | null = null
  m.forEach((row, truth) =>
    row.forEach((count, predicted) => {
      if (truth !== predicted && count > 0 && (!best || count > best.count)) best = { truth, predicted, count }
    }),
  )
  return best as { truth: number; predicted: number; count: number } | null
}

/* ----------------------------------------------------- next-word model */

export type Bigrams = Record<string, Record<string, number>>

export function words(text: string) {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z\s.]/g, ' ')
    .replace(/\./g, ' . ')
    .split(/\s+/)
    .filter(Boolean)
}

export function trainBigrams(text: string): Bigrams {
  const w = words(text)
  const model: Bigrams = {}
  for (let i = 0; i + 1 < w.length; i++) {
    const a = w[i]!
    const b = w[i + 1]!
    if (a === '.') continue
    model[a] ??= {}
    model[a]![b] = (model[a]![b] ?? 0) + 1
  }
  return model
}

/** Next-word chances after `word`, most likely first. */
export function nextWords(model: Bigrams, word: string) {
  const counts = model[word.toLowerCase()] ?? {}
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  return Object.entries(counts)
    .map(([w, n]) => ({ word: w, chance: n / total }))
    .sort((a, b) => b.chance - a.chance || a.word.localeCompare(b.word))
}

/** Weighted pick; `r` in [0, 1) so tests can be exact. */
export function pickNext(options: { word: string; chance: number }[], r: number) {
  let acc = 0
  for (const o of options) {
    acc += o.chance
    if (r < acc) return o.word
  }
  return options.at(-1)?.word
}

/* ------------------------------------------------------- word scores */

export function sentimentScore(sentence: string, scores: Record<string, number>, flipAfterNot: boolean) {
  let total = 0
  let flip = false
  for (const w of words(sentence)) {
    if (w === 'not' || w === 'never' || w === 'no') {
      flip = flipAfterNot
      continue
    }
    const s = scores[w] ?? 0
    total += flip && s !== 0 ? -s : s
    if (s !== 0) flip = false
  }
  return total
}

/* ------------------------------------------------------ decision tree */

export type TreeNode = { q: string; yes: TreeNode | string; no: TreeNode | string } | string

export function classify(tree: TreeNode, item: object): string {
  let node = tree
  while (typeof node !== 'string') node = (item as Record<string, unknown>)[node.q] === true ? node.yes : node.no
  return node
}
