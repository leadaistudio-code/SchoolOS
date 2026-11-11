'use client'

import * as React from 'react'
import { ArrowDown, ArrowUp, Check, ClipboardCheck, Lightbulb, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RichBlock } from '@/lib/lms/rich'
import { TRUTH_TABLE, type Action } from '@/lib/lms/robot'
import { PIN_MAP } from '@/lib/lms/robotics101-sketches'
import { cn } from '@/lib/utils'
import { ActivityCard, Feedback, Pill, RetryButton, seededShuffle } from './activity-kit'
import { useLessonState } from './lesson-state'

type Of<T extends RichBlock['type']> = Extract<RichBlock, { type: T }>
export type ActivityResult = { done: boolean; score?: number; tries?: number }

function useResult(id: string) {
  const { get, set } = useLessonState()
  const result = get<ActivityResult | null>(`a:${id}`, null)
  const record = (r: Omit<ActivityResult, 'tries'>) => set(`a:${id}`, { ...r, tries: (result?.tries ?? 0) + 1, done: r.done || !!result?.done })
  return { result, record }
}

/* ------------------------------------------------------------ quick check */

export function QuickCheck({ block }: { block: Of<'check'> }) {
  const { result, record } = useResult(block.id)
  const [choice, setChoice] = React.useState<string | null>(null)
  const [showHint, setShowHint] = React.useState(false)
  const picked = block.options.find((o) => o.id === choice)
  return (
    <ActivityCard kicker="Quick check" title={block.prompt} done={result?.done}>
      <div className="grid gap-2" role="group" aria-label="Answers">
        {block.options.map((o) => (
          <Pill
            key={o.id}
            className="justify-start rounded-[var(--radius)] px-3 py-2 text-left"
            active={choice === o.id && !picked}
            tone={choice === o.id ? (o.correct ? 'right' : 'wrong') : undefined}
            disabled={!!picked?.correct}
            onClick={() => {
              setChoice(o.id)
              record({ done: o.correct, score: o.correct ? 100 : 0 })
            }}
          >
            {o.text}
          </Pill>
        ))}
      </div>
      {picked ? (
        <Feedback tone={picked.correct ? 'right' : 'wrong'}>
          <p className="font-medium">{picked.correct ? 'Correct!' : 'Not quite.'}</p>
          {picked.feedback ? <p className="mt-0.5">{picked.feedback}</p> : null}
          {picked.correct ? <p className="mt-1 text-ink-muted">{block.explanation}</p> : <p className="mt-1 text-ink-muted">Try another answer.</p>}
        </Feedback>
      ) : block.hint ? (
        <div className="mt-3">
          {showHint ? (
            <Feedback tone="info">{block.hint}</Feedback>
          ) : (
            <button type="button" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink" onClick={() => setShowHint(true)}>
              <Lightbulb className="size-3.5" aria-hidden /> Show a hint
            </button>
          )}
        </div>
      ) : null}
    </ActivityCard>
  )
}

/* ------------------------------------------------------------------- sort */

export function SortActivity({ block }: { block: Of<'sort'> }) {
  const { result, record } = useResult(block.id)
  const items = React.useMemo(() => seededShuffle(block.items, block.id), [block.items, block.id])
  const [placed, setPlaced] = React.useState<Record<string, string>>({})
  const [checked, setChecked] = React.useState(false)
  const allPlaced = items.every((i) => placed[i.id])
  const right = items.filter((i) => placed[i.id] === i.bin).length

  function check() {
    setChecked(true)
    const score = Math.round((right / items.length) * 100)
    record({ done: score === 100, score })
  }

  return (
    <ActivityCard kicker="Sort it" title={block.title} done={result?.done}>
      <p className="text-sm text-ink-muted">{block.prompt}</p>
      <ul className="mt-3 divide-y divide-line rounded-[var(--radius)] border border-line">
        {items.map((item) => {
          const ok = checked ? placed[item.id] === item.bin : undefined
          return (
            <li key={item.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-medium text-ink">{item.text}</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Where does ${item.text} go?`}>
                {block.bins.map((bin) => (
                  <Pill
                    key={bin.id}
                    role="radio"
                    aria-checked={placed[item.id] === bin.id}
                    active={placed[item.id] === bin.id && !checked}
                    tone={checked && placed[item.id] === bin.id ? (ok ? 'right' : 'wrong') : undefined}
                    disabled={checked && ok}
                    onClick={() => {
                      setPlaced((p) => ({ ...p, [item.id]: bin.id }))
                      if (checked) setChecked(false)
                    }}
                  >
                    {bin.label}
                  </Pill>
                ))}
              </div>
              {checked ? <p className={cn('text-xs sm:basis-full', ok ? 'text-success' : 'text-[var(--danger)]')}>{item.why}</p> : null}
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={check} disabled={!allPlaced || checked}>
          <Check /> Check my sorting
        </Button>
        {checked ? (
          <span className="text-sm text-ink-muted" role="status">
            {right} of {items.length} right{right === items.length ? '. Brilliant!' : '. Change the red ones and check again.'}
          </span>
        ) : null}
      </div>
    </ActivityCard>
  )
}

/* -------------------------------------------------------------- sequence */

export function SequenceActivity({ block }: { block: Of<'sequence'> }) {
  const { result, record } = useResult(block.id)
  const [order, setOrder] = React.useState(() => seededShuffle(block.steps, block.id))
  const [checked, setChecked] = React.useState(false)
  const right = order.filter((s, i) => s.id === block.steps[i]!.id).length

  function move(i: number, d: -1 | 1) {
    const j = i + d
    if (j < 0 || j >= order.length) return
    setChecked(false)
    setOrder((o) => {
      const n = [...o]
      ;[n[i], n[j]] = [n[j]!, n[i]!]
      return n
    })
  }

  return (
    <ActivityCard kicker="Put in order" title={block.title} done={result?.done}>
      <p className="text-sm text-ink-muted">{block.prompt}</p>
      <ol className="mt-3 space-y-2">
        {order.map((s, i) => {
          const ok = checked ? s.id === block.steps[i]!.id : undefined
          return (
            <li
              key={s.id}
              className={cn(
                'flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2',
                ok === true && 'border-[var(--success)] bg-success-bg',
                ok === false && 'border-[var(--danger)] bg-danger-bg',
                ok === undefined && 'border-line bg-surface',
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
              <span className="flex-1 text-sm text-ink">{s.text}</span>
              <span className="flex gap-1">
                <button type="button" className="grid size-8 place-items-center rounded-full border border-line hover:bg-surface-2 disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move “${s.text}” up`}>
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button type="button" className="grid size-8 place-items-center rounded-full border border-line hover:bg-surface-2 disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move “${s.text}” down`}>
                  <ArrowDown className="size-4" aria-hidden />
                </button>
              </span>
            </li>
          )
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={checked}
          onClick={() => {
            setChecked(true)
            record({ done: right === order.length, score: Math.round((right / order.length) * 100) })
          }}
        >
          <Check /> Check the order
        </Button>
      </div>
      {checked ? (
        <Feedback tone={right === order.length ? 'right' : 'wrong'}>
          {right === order.length ? (
            <>
              <p className="font-medium">Perfect order!</p>
              <p className="mt-0.5">{block.explanation}</p>
            </>
          ) : (
            <p>
              {right} of {order.length} are in the right place. Move the red steps and check again.
            </p>
          )}
        </Feedback>
      ) : null}
    </ActivityCard>
  )
}

/* ------------------------------------------------------------------ match */

export function MatchActivity({ block }: { block: Of<'match'> }) {
  const { result, record } = useResult(block.id)
  const rights = React.useMemo(() => seededShuffle(block.pairs, `${block.id}:r`), [block.pairs, block.id])
  const [picks, setPicks] = React.useState<Record<string, string>>({})
  const [checked, setChecked] = React.useState(false)
  const all = block.pairs.every((p) => picks[p.id])
  const right = block.pairs.filter((p) => picks[p.id] === p.id).length
  return (
    <ActivityCard kicker="Match up" title={block.title} done={result?.done}>
      <p className="text-sm text-ink-muted">{block.prompt}</p>
      <div className="mt-3 space-y-2">
        {block.pairs.map((p) => {
          const ok = checked ? picks[p.id] === p.id : undefined
          const selectId = `${block.id}-${p.id}`
          return (
            <div key={p.id} className="grid gap-1.5 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center">
              <label htmlFor={selectId} className="text-sm font-medium text-ink">
                {p.left}
              </label>
              <select
                id={selectId}
                value={picks[p.id] ?? ''}
                onChange={(e) => {
                  setChecked(false)
                  setPicks((s) => ({ ...s, [p.id]: e.target.value }))
                }}
                className={cn(
                  'h-10 w-full rounded-[var(--radius)] border bg-surface px-2 text-sm text-ink',
                  ok === true ? 'border-[var(--success)]! bg-success-bg' : ok === false ? 'border-[var(--danger)]! bg-danger-bg' : 'border-line',
                )}
              >
                <option value="">Choose…</option>
                {rights.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.right}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
      <div className="mt-3">
        <Button
          size="sm"
          disabled={!all || checked}
          onClick={() => {
            setChecked(true)
            record({ done: right === block.pairs.length, score: Math.round((right / block.pairs.length) * 100) })
          }}
        >
          <Check /> Check my matches
        </Button>
      </div>
      {checked ? (
        <Feedback tone={right === block.pairs.length ? 'right' : 'wrong'}>
          {right === block.pairs.length ? block.explanation : `${right} of ${block.pairs.length} right. Fix the red ones and check again.`}
        </Feedback>
      ) : null}
    </ActivityCard>
  )
}

/* -------------------------------------------------------------- checklist */

export function ChecklistActivity({ block }: { block: Of<'checklist'> }) {
  const { get, set, readOnly } = useLessonState()
  const ticked = get<string[]>(`cl:${block.id}`, [])
  const done = block.items.every((i) => ticked.includes(i.id))
  return (
    <ActivityCard kicker={block.teacher ? 'Adult check' : 'Checklist'} title={block.title} done={done}>
      {block.teacher ? (
        <p className="mb-3 flex items-start gap-2 rounded-[var(--radius)] bg-warning-bg px-3 py-2 text-sm text-ink">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          An adult (teacher or parent) goes through this list with you before the battery is connected.
        </p>
      ) : null}
      <ul className="space-y-1.5">
        {block.items.map((item) => {
          const on = ticked.includes(item.id)
          const id = `${block.id}-${item.id}`
          return (
            <li key={item.id}>
              <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-3 rounded-[var(--radius)] px-2 py-2 hover:bg-surface-2', on && 'text-ink-muted')}>
                <input
                  id={id}
                  type="checkbox"
                  checked={on}
                  onChange={() => set(`cl:${block.id}`, on ? ticked.filter((x) => x !== item.id) : [...ticked, item.id])}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--success)]"
                />
                <span className="text-sm">
                  <span className={cn('text-ink', on && 'line-through decoration-ink-subtle')}>{item.text}</span>
                  {item.detail ? <span className="block text-xs text-ink-subtle">{item.detail}</span> : null}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-subtle" role="status">
        {ticked.filter((t) => block.items.some((i) => i.id === t)).length} of {block.items.length} done{readOnly ? ' · preview: not saved' : ''}
      </p>
    </ActivityCard>
  )
}

/* ------------------------------------------------------------------ steps */

export function StepsBlock({ block }: { block: Of<'steps'> }) {
  return (
    <ActivityCard kicker="Step by step" title={block.title}>
      <ol className="space-y-3">
        {block.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink text-sm font-bold text-ink">{i + 1}</span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-ink">{s.title}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{s.body}</p>
              {s.tip ? <p className="mt-1.5 rounded-[var(--radius-sm)] bg-surface-2 px-2.5 py-1.5 text-xs text-ink">Tip: {s.tip}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </ActivityCard>
  )
}

/* --------------------------------------------------------------- missions */

export function MissionsActivity({ block }: { block: Of<'missions'> }) {
  const { get, set } = useLessonState()
  const solved = get<string[]>(`ms:${block.id}`, [])
  const [picks, setPicks] = React.useState<Record<string, string>>({})
  return (
    <ActivityCard kicker="Troubleshooting" title={block.title} done={solved.length === block.missions.length}>
      <p className="mb-3 text-sm text-ink-muted" role="status">
        Missions solved: {solved.length} of {block.missions.length}
      </p>
      <ol className="space-y-3">
        {block.missions.map((m, i) => {
          const pick = m.options.find((o) => o.id === picks[m.id])
          const isSolved = solved.includes(m.id) || !!pick?.correct
          return (
            <li key={m.id} className="rounded-[var(--radius)] border border-line p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Mission {i + 1}</p>
              <p className="mt-1 text-sm font-medium text-ink">“{m.symptom}”</p>
              <p className="mt-2 text-xs text-ink-muted">What is the most likely cause?</p>
              <div className="mt-1.5 grid gap-1.5">
                {m.options.map((o) => (
                  <Pill
                    key={o.id}
                    className="justify-start rounded-[var(--radius)] px-3 py-1.5 text-left"
                    tone={picks[m.id] === o.id ? (o.correct ? 'right' : 'wrong') : undefined}
                    disabled={isSolved && !o.correct}
                    onClick={() => {
                      setPicks((p) => ({ ...p, [m.id]: o.id }))
                      if (o.correct && !solved.includes(m.id)) set(`ms:${block.id}`, [...solved, m.id])
                    }}
                  >
                    {o.text}
                  </Pill>
                ))}
              </div>
              {pick && !pick.correct && pick.feedback ? <Feedback tone="wrong">{pick.feedback}</Feedback> : null}
              {isSolved ? (
                <Feedback tone="right">
                  <p className="font-medium">How to fix it</p>
                  <p className="mt-0.5">{m.fix}</p>
                </Feedback>
              ) : null}
            </li>
          )
        })}
      </ol>
    </ActivityCard>
  )
}

/* ------------------------------------------------------------ truth table */

const ACTIONS: { value: Action; label: string }[] = [
  { value: 'FORWARD', label: 'Go forward' },
  { value: 'LEFT', label: 'Turn left' },
  { value: 'RIGHT', label: 'Turn right' },
  { value: 'STOP', label: 'Stop' },
]

export function TruthTableActivity({ block }: { block: Of<'truth-table'> }) {
  const { result, record } = useResult(block.id)
  const [picks, setPicks] = React.useState<Record<number, Action>>({})
  const [checked, setChecked] = React.useState(false)
  const right = TRUTH_TABLE.filter((r, i) => picks[i] === r.action).length
  return (
    <ActivityCard kicker="Truth table" title="What should the robot do?" done={result?.done}>
      <p className="text-sm text-ink-muted">Two sensors, two possible readings each: four rows. Choose the action for every row.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-subtle">
              <th scope="col" className="border-b border-line py-2 pr-3">Left sensor</th>
              <th scope="col" className="border-b border-line py-2 pr-3">Right sensor</th>
              <th scope="col" className="border-b border-line py-2">Robot action</th>
            </tr>
          </thead>
          <tbody>
            {TRUTH_TABLE.map((row, i) => {
              const ok = checked ? picks[i] === row.action : undefined
              return (
                <tr key={i} className="align-top">
                  <td className="border-b border-line py-2 pr-3">
                    <Surface black={row.reading.left} />
                  </td>
                  <td className="border-b border-line py-2 pr-3">
                    <Surface black={row.reading.right} />
                  </td>
                  <td className="border-b border-line py-2">
                    <select
                      aria-label={`Action when left is ${row.reading.left ? 'black' : 'white'} and right is ${row.reading.right ? 'black' : 'white'}`}
                      value={picks[i] ?? ''}
                      onChange={(e) => {
                        setChecked(false)
                        setPicks((p) => ({ ...p, [i]: e.target.value as Action }))
                      }}
                      className={cn(
                        'h-9 w-full rounded-[var(--radius)] border bg-surface px-2 text-sm',
                        ok === true ? 'border-[var(--success)]! bg-success-bg' : ok === false ? 'border-[var(--danger)]! bg-danger-bg' : 'border-line',
                      )}
                    >
                      <option value="">Choose…</option>
                      {ACTIONS.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    {checked ? <p className={cn('mt-1 text-xs', ok ? 'text-success' : 'text-[var(--danger)]')}>{ok ? row.why : 'Think about where the line is.'}</p> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <Button
          size="sm"
          disabled={Object.keys(picks).length < 4 || checked}
          onClick={() => {
            setChecked(true)
            record({ done: right === 4, score: right * 25 })
          }}
        >
          <Check /> Check the table
        </Button>
      </div>
      {checked && right === 4 ? <Feedback tone="right">That is the complete line-following algorithm. Four rules, and your robot can follow any line.</Feedback> : null}
    </ActivityCard>
  )
}

function Surface({ black }: { black: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('size-4 rounded-sm border border-ink', black ? 'bg-ink' : 'bg-white')} aria-hidden />
      {black ? 'Black (on line)' : 'White'}
    </span>
  )
}

/* ----------------------------------------------------------------- wiring */

const PIN_CHOICES = ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', '5V', 'GND']

export function WiringActivity({ block }: { block: Of<'wiring'> }) {
  const { result, record } = useResult(block.id)
  const [picks, setPicks] = React.useState<Record<string, string>>({})
  const [checked, setChecked] = React.useState(false)
  const right = PIN_MAP.filter((p) => picks[p.name] === p.pin).length
  return (
    <ActivityCard kicker="Wiring exercise" title="Connect each signal to its Arduino pin" done={result?.done}>
      <p className="text-sm text-ink-muted">Use the pin map above. Every sketch in this course expects exactly these pins.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {PIN_MAP.map((p) => {
          const ok = checked ? picks[p.name] === p.pin : undefined
          const id = `${block.id}-${p.name}`
          return (
            <div key={p.name} className={cn('flex items-center justify-between gap-2 rounded-[var(--radius)] border px-3 py-2', ok === true ? 'border-[var(--success)] bg-success-bg' : ok === false ? 'border-[var(--danger)] bg-danger-bg' : 'border-line')}>
              <label htmlFor={id} className="text-sm text-ink">
                {p.signal}
              </label>
              <select
                id={id}
                value={picks[p.name] ?? ''}
                onChange={(e) => {
                  setChecked(false)
                  setPicks((s) => ({ ...s, [p.name]: e.target.value }))
                }}
                className="h-9 w-24 shrink-0 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm"
              >
                <option value="">Pin…</option>
                {PIN_CHOICES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
      <div className="mt-3">
        <Button
          size="sm"
          disabled={Object.keys(picks).length < PIN_MAP.length || checked}
          onClick={() => {
            setChecked(true)
            record({ done: right === PIN_MAP.length, score: Math.round((right / PIN_MAP.length) * 100) })
          }}
        >
          <ClipboardCheck /> Check my wiring
        </Button>
      </div>
      {checked ? (
        <Feedback tone={right === PIN_MAP.length ? 'right' : 'wrong'}>
          {right === PIN_MAP.length
            ? 'All eight connections are right. Now ask an adult to check the real wiring with the checklist below.'
            : `${right} of ${PIN_MAP.length} right. Speed pins (ENA, ENB) must be PWM pins marked ~.`}
        </Feedback>
      ) : null}
    </ActivityCard>
  )
}

/* -------------------------------------------------------------- resources */

export function ResourcesBlock({ block }: { block: Of<'resources'> }) {
  return (
    <ActivityCard kicker="Downloads" title="Resources for this lesson">
      <ul className="divide-y divide-line">
        {block.items.map((r) => (
          <li key={r.href} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm">
              <span className="font-medium text-ink">{r.title}</span>
              {r.note ? <span className="block text-xs text-ink-subtle">{r.note}</span> : null}
            </span>
            <a href={r.href} download className="text-sm font-medium text-[var(--brand-600)] underline-offset-4 hover:underline">
              Download
            </a>
          </li>
        ))}
      </ul>
    </ActivityCard>
  )
}

export { RetryButton }
