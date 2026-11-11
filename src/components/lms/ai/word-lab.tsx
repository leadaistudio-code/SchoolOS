'use client'

import * as React from 'react'
import { Check, Minus, Plus, X } from 'lucide-react'
import { FIXED_SCORES, REVIEWS, SCORE_WORDS } from '@/lib/lms/ai101/lab-data'
import { sentimentScore, words } from '@/lib/lms/ai101/ml'
import { cn } from '@/lib/utils'
import { ActivityCard, Feedback, Pill } from '../robotics/activity-kit'
import { useLessonState } from '../robotics/lesson-state'
import { useResult, type Of } from './use-result'

type Saved = { scores: Record<string, number>; flip: boolean }
const LIMIT = 2

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

export function WordLab({ block }: { block: Of<'word-lab'> }) {
  const { result, record } = useResult(block.id)
  const { get, set } = useLessonState()
  const saved = get<Saved>(`words:${block.id}`, { scores: {}, flip: false })
  const scores = { ...saved.scores, ...FIXED_SCORES }

  const judged = REVIEWS.map((r) => {
    const total = sentimentScore(r.text, scores, saved.flip)
    return { ...r, total, right: total !== 0 && total > 0 === r.happy }
  })
  const right = judged.filter((r) => r.right).length
  const plainRight = judged.filter((r) => !r.not && r.right).length
  const plainTotal = judged.filter((r) => !r.not).length

  function save(next: Saved) {
    set(`words:${block.id}`, next)
    const s = { ...next.scores, ...FIXED_SCORES }
    const n = REVIEWS.filter((r) => {
      const t = sentimentScore(r.text, s, next.flip)
      return t !== 0 && t > 0 === r.happy
    }).length
    if (n === REVIEWS.length && !result?.done) record({ done: true, score: 100 })
  }

  function nudge(word: string, by: number) {
    const v = Math.max(-LIMIT, Math.min(LIMIT, (saved.scores[word] ?? 0) + by))
    save({ ...saved, scores: { ...saved.scores, [word]: v } })
  }

  return (
    <ActivityCard kicker="Word score lab" title="Teach the canteen AI to read reviews" done={result?.done}>
      <p className="text-sm text-ink-muted">
        Give each word a score from {signed(-LIMIT)} (very unhappy) to {signed(LIMIT)} (very happy). The AI adds up the scores in each review. Above zero means happy, below zero means unhappy, exactly zero means it cannot tell. It already knows “good” (+1) and “bad” (−1).
      </p>
      <div className="mt-3 grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ul className="grid grid-cols-2 gap-1.5 self-start lg:grid-cols-1">
          {SCORE_WORDS.map((w) => {
            const v = saved.scores[w] ?? 0
            return (
              <li key={w} className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-line px-2 py-1">
                <span className="text-sm font-medium text-ink">{w}</span>
                <span className="inline-flex items-center gap-1">
                  <button type="button" className="rounded-full border border-line p-1 hover:bg-surface-2 disabled:opacity-30" onClick={() => nudge(w, -1)} disabled={v <= -LIMIT} aria-label={`Lower the score for ${w}`}>
                    <Minus className="size-3" aria-hidden />
                  </button>
                  <span className={cn('w-7 text-center text-sm font-semibold tabular-nums', v > 0 && 'text-success', v < 0 && 'text-[var(--danger)]')} aria-live="polite">
                    {signed(v)}
                  </span>
                  <button type="button" className="rounded-full border border-line p-1 hover:bg-surface-2 disabled:opacity-30" onClick={() => nudge(w, 1)} disabled={v >= LIMIT} aria-label={`Raise the score for ${w}`}>
                    <Plus className="size-3" aria-hidden />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Reviews: {right} of {REVIEWS.length} right
          </p>
          <ul className="mt-2 space-y-1.5">
            {judged.map((r) => (
              <li key={r.text} className="flex items-start gap-2 rounded-[var(--radius)] border border-line px-2.5 py-1.5 text-sm">
                {r.right ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Right" /> : <X className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" aria-label="Wrong" />}
                <span className="min-w-0 flex-1">
                  {words(r.text).map((w, i) => {
                    const s = scores[w]
                    return (
                      <span key={i} className={cn(s && s > 0 && 'rounded bg-success-bg px-0.5', s && s < 0 && 'rounded bg-danger-bg px-0.5', w === 'not' && saved.flip && 'font-semibold underline')}>
                        {i ? ' ' : ''}
                        {w}
                      </span>
                    )
                  })}
                  <span className="block text-xs text-ink-subtle">
                    Really {r.happy ? 'happy' : 'unhappy'} · total {signed(r.total)} → AI says {r.total > 0 ? 'happy' : r.total < 0 ? 'unhappy' : 'cannot tell'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill active={saved.flip} onClick={() => save({ ...saved, flip: !saved.flip })}>
              {saved.flip ? 'Rule on:' : 'Add a rule:'} “not” flips the next scored word
            </Pill>
          </div>
          {right === REVIEWS.length ? (
            <Feedback tone="right">All {REVIEWS.length} right! Word scores handle simple reviews, and one extra rule handles “not”. Real language AI learns millions of patterns like this from data.</Feedback>
          ) : plainRight === plainTotal && !saved.flip ? (
            <Feedback tone="info">The plain reviews all work, but “not good” and “not bad” fool the AI. Adding up word scores misses how words change each other. Try adding a rule.</Feedback>
          ) : (
            <p className="mt-3 text-xs text-ink-muted" role="status">
              Hint: happy words need positive scores and unhappy words negative ones. Look at the reviews the AI gets wrong.
            </p>
          )}
        </div>
      </div>
    </ActivityCard>
  )
}
