import { describe, expect, it } from 'vitest'
import { FEATURE } from '@/lib/features'
import { QuotaExceededError } from '@/server/entitlements'
import { AI_USAGE_KIND } from '@/server/modules/ai-assessment/usage'

describe('AI usage kinds', () => {
  it('uses stable event kind strings', () => {
    expect(AI_USAGE_KIND.EVAL_PAGES).toBe('evaluation.pages')
    expect(AI_USAGE_KIND.GENERATE).toBe('question.generate')
  })
})

describe('AI plan limit keys', () => {
  it('exposes eval and generate monthly limits', () => {
    expect(FEATURE.LIMIT_AI_EVAL_PAGES_PER_MONTH).toBe('limit.ai_eval_pages_month')
    expect(FEATURE.LIMIT_AI_GENERATE_PER_MONTH).toBe('limit.ai_generate_month')
  })
})

describe('QuotaExceededError', () => {
  it('carries feature, limit and current for API mapping', () => {
    const err = new QuotaExceededError(FEATURE.LIMIT_AI_EVAL_PAGES_PER_MONTH, 100, 100)
    expect(err.status).toBe(402)
    expect(err.feature).toBe(FEATURE.LIMIT_AI_EVAL_PAGES_PER_MONTH)
    expect(err.limit).toBe(100)
    expect(err.current).toBe(100)
    expect(err.message).toContain('100')
  })
})

describe('usage remaining math', () => {
  it('clamps remaining at zero when over limit', () => {
    const limit = 200
    const used = 250
    const remaining = limit == null ? null : Math.max(0, limit - used)
    expect(remaining).toBe(0)
  })

  it('reports null remaining when unlimited', () => {
    const limit: number | null = null
    const used = 999
    const remaining = limit == null ? null : Math.max(0, limit - used)
    expect(remaining).toBeNull()
  })
})
