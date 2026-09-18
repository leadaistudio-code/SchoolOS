import { describe, expect, it } from 'vitest'
import {
  allocateByPercent,
  allocateDifficultyCounts,
  mixIsBalanced,
} from '@/server/modules/ai-assessment/allocate'

describe('allocateByPercent', () => {
  it('sums exactly to total', () => {
    const result = allocateByPercent(10, [
      { key: 'a', percent: 30 },
      { key: 'b', percent: 50 },
      { key: 'c', percent: 20 },
    ])
    expect(result.a! + result.b! + result.c!).toBe(10)
    expect(result.a).toBe(3)
    expect(result.b).toBe(5)
    expect(result.c).toBe(2)
  })

  it('handles rounding on odd totals', () => {
    const result = allocateByPercent(7, [
      { key: 'EASY', percent: 30 },
      { key: 'MEDIUM', percent: 50 },
      { key: 'HARD', percent: 20 },
    ])
    expect(result.EASY! + result.MEDIUM! + result.HARD!).toBe(7)
  })
})

describe('allocateDifficultyCounts', () => {
  it('uses fallback when mix omitted', () => {
    expect(allocateDifficultyCounts(5, undefined, 'HARD')).toEqual({
      EASY: 0,
      MEDIUM: 0,
      HARD: 5,
    })
  })

  it('respects mix', () => {
    const counts = allocateDifficultyCounts(10, { easy: 30, medium: 50, hard: 20 }, 'MEDIUM')
    expect(counts.EASY + counts.MEDIUM + counts.HARD).toBe(10)
  })
})

describe('mixIsBalanced', () => {
  it('requires 100', () => {
    expect(mixIsBalanced({ easy: 30, medium: 50, hard: 20 })).toBe(true)
    expect(mixIsBalanced({ easy: 30, medium: 50, hard: 10 })).toBe(false)
  })
})
