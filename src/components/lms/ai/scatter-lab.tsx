'use client'

import * as React from 'react'
import { Check, Map as MapIcon, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { biasFixed, FRUIT, FRUIT_LABELS, LEAF_BATCHES, LEAF_GROUPS, LEAF_LABELS, leafTrain, type Dot } from '@/lib/lms/ai101/lab-data'
import { distance, knn, type Example } from '@/lib/lms/ai101/ml'
import { cn } from '@/lib/utils'
import { ActivityCard, Feedback, Pill } from '../robotics/activity-kit'
import { useLessonState } from '../robotics/lesson-state'
import { useResult, type Of } from './use-result'

const W = 480
const H = 320
const PADDING = 28
const sx = (x: number) => PADDING + (x / 10) * (W - PADDING * 2)
const sy = (y: number) => H - PADDING - (y / 10) * (H - PADDING * 2)
const COLORS = ['#f0a63c', '#2e9e6a']
const FILLS = ['rgba(240,166,60,0.16)', 'rgba(46,158,106,0.14)']

const toExamples = (dots: Dot[]): Example[] => dots.map((d) => ({ label: d.label, v: [d.x, d.y] }))

function BoundaryMap({ examples, k }: { examples: Example[]; k: number }) {
  const cols = 30
  const rows = 20
  const cells = React.useMemo(() => {
    const out: { x: number; y: number; label: number }[] = []
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const x = ((c + 0.5) / cols) * 10
        const y = ((r + 0.5) / rows) * 10
        out.push({ x: c, y: r, label: knn(examples, [x, y], k, 2)?.label ?? 0 })
      }
    return out
  }, [examples, k])
  const cw = (W - PADDING * 2) / cols
  const ch = (H - PADDING * 2) / rows
  return (
    <g aria-hidden>
      {cells.map((c, i) => (
        <rect key={i} x={PADDING + c.x * cw} y={H - PADDING - (c.y + 1) * ch} width={cw + 0.5} height={ch + 0.5} fill={FILLS[c.label]} />
      ))}
    </g>
  )
}

function Axes({ x, y }: { x: string; y: string }) {
  return (
    <g aria-hidden>
      <line x1={PADDING} y1={H - PADDING} x2={W - PADDING / 2} y2={H - PADDING} stroke="#0b0b0d" strokeWidth={1.5} />
      <line x1={PADDING} y1={H - PADDING} x2={PADDING} y2={PADDING / 2} stroke="#0b0b0d" strokeWidth={1.5} />
      <text x={W / 2} y={H - 6} fontSize={12} textAnchor="middle" fill="#5b5f68">
        {x} →
      </text>
      <text x={12} y={H / 2} fontSize={12} textAnchor="middle" fill="#5b5f68" transform={`rotate(-90 12 ${H / 2})`}>
        {y} →
      </text>
    </g>
  )
}

function Mark({ d, shape, faded }: { d: Dot; shape?: 'circle' | 'diamond'; faded?: boolean }) {
  const x = sx(d.x)
  const y = sy(d.y)
  const common = { fill: COLORS[d.label], stroke: '#0b0b0d', strokeWidth: 1.5, opacity: faded ? 0.35 : 1 }
  return shape === 'diamond' ? <path d={`M${x},${y - 8} L${x + 8},${y} L${x},${y + 8} L${x - 8},${y} z`} {...common} /> : <circle cx={x} cy={y} r={6.5} {...common} />
}

export function ScatterLab({ block }: { block: Of<'scatter-lab'> }) {
  return block.mode === 'knn' ? <KnnLab id={block.id} /> : <BiasLab id={block.id} />
}

function KnnLab({ id }: { id: string }) {
  const { result, record } = useResult(id)
  const { get, set } = useLessonState()
  const tasks = get<string[]>(`scatter:${id}`, [])
  const [k, setK] = React.useState(3)
  const [q, setQ] = React.useState<{ x: number; y: number } | null>(null)
  const [map, setMap] = React.useState(false)
  const examples = React.useMemo(() => toExamples(FRUIT), [])
  const p = q ? knn(examples, [q.x, q.y], k, 2) : null
  const radius = p && q ? distance([q.x, q.y], examples[p.neighbours.at(-1)!]!.v) : 0

  function place(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(10, (((e.clientX - r.left) / r.width) * W - PADDING) / ((W - PADDING * 2) / 10)))
    const y = Math.max(0, Math.min(10, ((H - PADDING - ((e.clientY - r.top) / r.height) * H) / (H - PADDING * 2)) * 10))
    setQ({ x, y })
    const one = knn(examples, [x, y], 1, 2)!.label
    const five = knn(examples, [x, y], 5, 2)!.label
    const next = new Set(tasks)
    next.add('placed')
    if (one !== five) next.add('disagree')
    if (next.size !== tasks.length) {
      const list = [...next]
      set(`scatter:${id}`, list)
      record({ done: list.includes('placed') && list.includes('disagree'), score: Math.round((list.length / 2) * 100) })
    }
  }

  return (
    <ActivityCard kicker="Nearest-neighbour lab" title="Ask the neighbours" done={result?.done}>
      <p className="text-sm text-ink-muted">Click anywhere on the chart to drop a new fruit. The k nearest fruits vote on what it is. Change k and watch the vote.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink">k =</span>
        {[1, 3, 5, 7].map((n) => (
          <Pill key={n} active={k === n} onClick={() => setK(n)}>
            {n}
          </Pill>
        ))}
        <Pill active={map} onClick={() => setMap((m) => !m)}>
          <MapIcon className="size-3.5" aria-hidden /> {map ? 'Hide the map' : 'Show the map'}
        </Pill>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair rounded-[var(--radius)] border border-line bg-white" onClick={place} role="img" aria-label="Fruit chart: sweetness across, size up. Click to drop a new fruit.">
          {map ? <BoundaryMap examples={examples} k={k} /> : null}
          <Axes x="Sweetness" y="Size" />
          {q && p ? (
            <>
              <circle cx={sx(q.x)} cy={sy(q.y)} r={(radius / 10) * (W - PADDING * 2)} fill="none" stroke="#2f5fb3" strokeDasharray="5 5" strokeWidth={1.5} />
              {p.neighbours.map((i) => (
                <line key={i} x1={sx(q.x)} y1={sy(q.y)} x2={sx(FRUIT[i]!.x)} y2={sy(FRUIT[i]!.y)} stroke="#2f5fb3" strokeWidth={1.5} />
              ))}
            </>
          ) : null}
          {FRUIT.map((d, i) => (
            <Mark key={i} d={d} />
          ))}
          {q ? (
            <g>
              <circle cx={sx(q.x)} cy={sy(q.y)} r={10} fill="#fff" stroke="#2f5fb3" strokeWidth={3} />
              <text x={sx(q.x)} y={sy(q.y) + 4} fontSize={12} fontWeight={800} textAnchor="middle" fill="#2f5fb3">
                ?
              </text>
            </g>
          ) : null}
        </svg>
        <div className="space-y-3 text-sm">
          <div className="flex gap-3">
            {FRUIT_LABELS.map((l, i) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-full border border-ink" style={{ background: COLORS[i] }} /> {l}
              </span>
            ))}
          </div>
          {p ? (
            <div className="rounded-[var(--radius)] border border-line p-3" role="status">
              <p className="text-ink-muted">
                Votes: {FRUIT_LABELS.map((l, i) => `${p.votes[i]} ${l.toLowerCase()}${p.votes[i] === 1 ? '' : 's'}`).join(', ')}
              </p>
              <p className="mt-1 text-lg font-semibold text-ink">It is a {FRUIT_LABELS[p.label]!.toLowerCase()}!</p>
            </div>
          ) : (
            <p className="text-ink-muted">Drop a fruit to see the vote.</p>
          )}
          <ul className="space-y-1">
            <li className={cn('flex items-start gap-1.5', tasks.includes('placed') ? 'text-success' : 'text-ink')}>
              <Check className={cn('mt-0.5 size-4 shrink-0', !tasks.includes('placed') && 'opacity-20')} aria-hidden /> Drop a fruit and read the vote
            </li>
            <li className={cn('flex items-start gap-1.5', tasks.includes('disagree') ? 'text-success' : 'text-ink')}>
              <Check className={cn('mt-0.5 size-4 shrink-0', !tasks.includes('disagree') && 'opacity-20')} aria-hidden /> Find a spot where k = 1 and k = 5 give different answers
            </li>
          </ul>
          {result?.done ? (
            <Feedback tone="right">Both found! The answers flip near the border between the groups, where the neighbours are mixed.</Feedback>
          ) : tasks.includes('placed') ? (
            <p className="text-xs text-ink-muted">Hint: try near the middle, where mangoes and lemons mix. Turn on the map to see the border.</p>
          ) : null}
        </div>
      </div>
    </ActivityCard>
  )
}

function BiasLab({ id }: { id: string }) {
  const { result, record } = useResult(id)
  const { get, set } = useLessonState()
  const batches = get<number>(`bias:${id}`, 0)
  const [map, setMap] = React.useState(false)
  const train = React.useMemo(() => leafTrain(batches), [batches])
  const { a, b, fixed } = biasFixed(batches)
  const neem = train.filter((d) => d.group === 1).length

  function addBatch() {
    const next = Math.min(LEAF_BATCHES, batches + 1)
    set(`bias:${id}`, next)
    const r = biasFixed(next)
    record({ done: r.fixed, score: r.b })
  }

  return (
    <ActivityCard kicker="Fairness lab" title="The unfair leaf checker" done={result?.done}>
      <p className="text-sm text-ink-muted">
        A farm app checks leaf photos for disease, using spots and yellowness. It was trained on {train.length - neem} mango leaves but only {neem} neem leaves. Neem leaves are naturally paler, so a healthy neem leaf can look like a sick mango leaf. Test it, then fix it.
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-[var(--radius)] border border-line bg-white" role="img" aria-label="Training leaves: spots across, yellowness up. Circles are mango leaves, diamonds are neem leaves.">
          {map ? <BoundaryMap examples={toExamples(train)} k={3} /> : null}
          <Axes x="Spots" y="Yellowness" />
          {train.map((d, i) => (
            <Mark key={i} d={d} shape={d.group === 1 ? 'diamond' : 'circle'} />
          ))}
        </svg>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            {LEAF_LABELS.map((l, i) => (
              <p key={l} className="inline-flex w-full items-center gap-1.5">
                <span className="size-3 rounded-full border border-ink" style={{ background: COLORS[i] }} /> {l}
              </p>
            ))}
            <p className="text-xs text-ink-muted">● {LEAF_GROUPS[0]} · ◆ {LEAF_GROUPS[1]}</p>
          </div>
          <div className="rounded-[var(--radius)] border border-line p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Test accuracy (20 new leaves each)</p>
            {[
              [LEAF_GROUPS[0], a],
              [LEAF_GROUPS[1], b],
            ].map(([label, value]) => (
              <div key={label as string} className="mt-2">
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <strong className="tabular-nums">{value}%</strong>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div className={cn('h-full rounded-full', (value as number) >= 80 ? 'bg-[var(--success)]' : 'bg-[var(--danger)]')} style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={addBatch} disabled={batches >= LEAF_BATCHES}>
              <Plus /> Add 10 neem leaves
            </Button>
            <Pill active={map} onClick={() => setMap((m) => !m)}>
              <MapIcon className="size-3.5" aria-hidden /> Map
            </Pill>
            {batches ? (
              <button type="button" className="inline-flex items-center gap-1 text-xs text-ink-subtle hover:text-ink" onClick={() => set(`bias:${id}`, 0)}>
                <RotateCcw className="size-3" aria-hidden /> Start again
              </button>
            ) : null}
          </div>
          {fixed ? (
            <Feedback tone="right">Fairer! With enough neem leaves in the data, the model learned what healthy neem looks like. The fix was better data, not a cleverer model.</Feedback>
          ) : batches === 0 ? (
            <Feedback tone="info">The overall accuracy looks fine, but look at neem leaves. Who would this app let down?</Feedback>
          ) : (
            <p className="text-xs text-ink-muted" role="status">
              Better. Keep going until both groups are above 80% and close together.
            </p>
          )}
          {result?.done && !fixed ? <p className="text-xs text-ink-subtle">You fixed it before. Add the neem leaves again to see it.</p> : null}
        </div>
      </div>
    </ActivityCard>
  )
}
