import { DIFFICULTIES, type DifficultyKey } from '@/lib/questions'

/** Largest-remainder allocation so percentages always sum to `total`. */
export function allocateByPercent(
  total: number,
  parts: { key: string; percent: number }[],
): Record<string, number> {
  if (total <= 0 || parts.length === 0) return {}
  const positive = parts.filter((p) => p.percent > 0)
  if (positive.length === 0) return {}
  const sumPct = positive.reduce((s, p) => s + p.percent, 0) || 100
  const raw = positive.map((p) => {
    const exact = (total * p.percent) / sumPct
    return { key: p.key, floor: Math.floor(exact), frac: exact - Math.floor(exact) }
  })
  let remaining = total - raw.reduce((s, r) => s + r.floor, 0)
  raw.sort((a, b) => b.frac - a.frac)
  for (const row of raw) {
    if (remaining <= 0) break
    row.floor += 1
    remaining -= 1
  }
  return Object.fromEntries(raw.map((r) => [r.key, r.floor]))
}

export type DifficultyMix = { easy: number; medium: number; hard: number }

/** Normalise teacher mix to EASY/MEDIUM/HARD counts. Falls back to single difficulty. */
export function allocateDifficultyCounts(
  total: number,
  mix: DifficultyMix | undefined,
  fallback: DifficultyKey,
): Record<DifficultyKey, number> {
  if (!mix) {
    return { EASY: 0, MEDIUM: 0, HARD: 0, [fallback]: total } as Record<DifficultyKey, number>
  }
  const allocated = allocateByPercent(total, [
    { key: 'EASY', percent: mix.easy },
    { key: 'MEDIUM', percent: mix.medium },
    { key: 'HARD', percent: mix.hard },
  ])
  return {
    EASY: allocated.EASY ?? 0,
    MEDIUM: allocated.MEDIUM ?? 0,
    HARD: allocated.HARD ?? 0,
  }
}

export function mixIsBalanced(mix: DifficultyMix): boolean {
  const sum = mix.easy + mix.medium + mix.hard
  return sum === 100
}

export function emptyDifficultyCounts(): Record<DifficultyKey, number> {
  return Object.fromEntries(DIFFICULTIES.map((d) => [d, 0])) as Record<DifficultyKey, number>
}
