'use client'

import * as React from 'react'
import { Check, Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PIXEL_PUZZLES, PIXEL_SIZE } from '@/lib/lms/ai101/lab-data'
import { cn } from '@/lib/utils'
import { ActivityCard, Feedback, Pill } from '../robotics/activity-kit'
import { useLessonState } from '../robotics/lesson-state'
import { useResult, type Of } from './use-result'

const empty = () => Array.from({ length: PIXEL_SIZE * PIXEL_SIZE }, () => 0)

/** Paint a grid and watch it become numbers; then decode two secret pictures from their numbers. */
export function PixelLab({ block }: { block: Of<'pixel-lab'> }) {
  const { result, record } = useResult(block.id)
  const { get, set } = useLessonState()
  const solved = get<string[]>(`pixels:${block.id}`, [])
  const [mode, setMode] = React.useState<'draw' | string>('draw')
  const [cells, setCells] = React.useState<number[]>(empty)
  const [checked, setChecked] = React.useState<{ wrong: number } | null>(null)
  const painting = React.useRef<number | null>(null)
  const puzzle = PIXEL_PUZZLES.find((p) => p.id === mode)
  const target = puzzle ? puzzle.rows.join('').split('').map(Number) : null
  const ones = cells.filter(Boolean).length

  function paint(i: number, value: number) {
    setChecked(null)
    setCells((c) => {
      const next = [...c]
      next[i] = value
      return next
    })
  }

  function switchTo(m: string) {
    setMode(m)
    setCells(empty())
    setChecked(null)
  }

  function check() {
    if (!target || !puzzle) return
    const wrong = cells.filter((v, i) => v !== target[i]).length
    setChecked({ wrong })
    if (wrong === 0 && !solved.includes(puzzle.id)) {
      const next = [...solved, puzzle.id]
      set(`pixels:${block.id}`, next)
      const all = PIXEL_PUZZLES.every((p) => next.includes(p.id))
      record({ done: all, score: Math.round((next.length / PIXEL_PUZZLES.length) * 100) })
    }
  }

  return (
    <ActivityCard kicker="Pixel lab" title="Pictures are numbers" done={result?.done}>
      <p className="text-sm text-ink-muted">
        Click or drag on the grid to paint pixels. Each black square is stored as 1, each white one as 0. Then crack the two secret pictures: paint the grid so it matches the numbers.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Choose a mode">
        <Pill active={mode === 'draw'} onClick={() => switchTo('draw')}>
          Free draw
        </Pill>
        {PIXEL_PUZZLES.map((p) => (
          <Pill key={p.id} active={mode === p.id} onClick={() => switchTo(p.id)}>
            {solved.includes(p.id) ? <Check className="size-3.5" aria-hidden /> : null}
            {p.title}
          </Pill>
        ))}
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{puzzle ? 'Paint it here' : 'Your picture'}</p>
          <div
            className="grid w-full max-w-[320px] touch-none select-none border border-ink"
            style={{ gridTemplateColumns: `repeat(${PIXEL_SIZE}, 1fr)` }}
            onPointerUp={() => (painting.current = null)}
            onPointerLeave={() => (painting.current = null)}
          >
            {cells.map((v, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Row ${Math.floor(i / PIXEL_SIZE) + 1}, column ${(i % PIXEL_SIZE) + 1}: ${v ? 'black' : 'white'}`}
                aria-pressed={!!v}
                className={cn('aspect-square border border-[#d6d6d6] focus-visible:outline-2 focus-visible:outline-[var(--brand-500)]', v ? 'bg-ink' : 'bg-white')}
                onPointerDown={(e) => {
                  e.currentTarget.releasePointerCapture(e.pointerId)
                  const value = v ? 0 : 1
                  painting.current = value
                  paint(i, value)
                }}
                onPointerEnter={() => {
                  if (painting.current !== null) paint(i, painting.current)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    paint(i, v ? 0 : 1)
                  }
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={() => setCells(empty())}>
              <Eraser /> Clear
            </Button>
            {puzzle ? (
              <Button size="sm" onClick={check}>
                <Check /> Check my picture
              </Button>
            ) : null}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{puzzle ? 'The secret numbers' : 'What the computer stores'}</p>
          <pre className="w-fit rounded-[var(--radius)] bg-surface-2 p-3 font-mono text-[13px] leading-6 text-ink" aria-label="Pixel numbers, row by row">
            {Array.from({ length: PIXEL_SIZE }, (_, r) =>
              (target ?? cells)
                .slice(r * PIXEL_SIZE, (r + 1) * PIXEL_SIZE)
                .join(' '),
            ).join('\n')}
          </pre>
          {!puzzle ? (
            <p className="mt-2 text-sm text-ink-muted" role="status">
              {ones} black pixel{ones === 1 ? '' : 's'} and {cells.length - ones} white: {cells.length} numbers in all.
            </p>
          ) : null}
        </div>
      </div>

      {checked && puzzle ? (
        checked.wrong === 0 ? (
          <Feedback tone="right">
            <p className="font-medium">You decoded it!</p>
            <p className="mt-0.5">You turned numbers back into a picture, exactly what your screen does millions of times a second.</p>
          </Feedback>
        ) : (
          <Feedback tone="wrong">
            {checked.wrong} square{checked.wrong === 1 ? ' is' : 's are'} not right yet. Read the numbers row by row: 1 is black, 0 is white.
          </Feedback>
        )
      ) : null}
      {result?.done && mode === 'draw' ? <Feedback tone="right">Both secret pictures decoded. You can keep drawing for fun.</Feedback> : null}
    </ActivityCard>
  )
}
