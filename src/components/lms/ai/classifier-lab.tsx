'use client'

import * as React from 'react'
import { Brain, Camera, Eraser, FlaskConical, Pencil, Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  accuracy,
  biggestMixUp,
  CAM_H,
  CAM_W,
  cameraFeatures,
  confusion,
  decode,
  encode,
  GRID,
  knn,
  normaliseInk,
  type Example,
  type Prediction,
  type TestRecord,
} from '@/lib/lms/ai101/ml'
import { cn } from '@/lib/utils'
import { ActivityCard, Feedback, Pill } from '../robotics/activity-kit'
import { useLessonState } from '../robotics/lesson-state'
import { useResult, type Of } from './use-result'

const MAX_PER_CLASS = 15
const PAD = 224
const K = 3

/** Saved per lab as `model:<id>`. Camera pictures are never saved: only their counts. */
export type SavedModel = {
  input: 'draw' | 'camera'
  labels: string[]
  /** Drawings only: label index and 16 × 16 grey levels as hex. */
  examples: { l: number; s: string }[]
  counts: number[]
  trainedOn: number
  tests: TestRecord[]
  /** One entry per finished test round, to show improvement. */
  rounds: { examples: number; tested: number; accuracy: number }[]
}

const blank = (labels: string[], input: SavedModel['input']): SavedModel => ({ input, labels, examples: [], counts: labels.map(() => 0), trainedOn: 0, tests: [], rounds: [] })

/** A camera lab's labels name things to show, not to draw, so drawing mode gets its own pair. */
const DRAW_LABELS = ['Happy face', 'Sad face']

const sameLabels = (a: string[], b: string[]) => a.length === b.length && a.every((l, i) => l === b[i])

export function ClassifierLab({ block }: { block: Of<'classifier-lab'> }) {
  const { result, record } = useResult(block.id)
  const { get, set, readOnly } = useLessonState()
  const key = `model:${block.id}`
  const defaultLabels = (input: SavedModel['input']) => (block.input === 'camera' && input === 'draw' ? DRAW_LABELS : block.labels)
  const [model, setModelState] = React.useState<SavedModel>(() => get<SavedModel | null>(key, null) ?? blank(defaultLabels('draw'), 'draw'))
  const [camExamples, setCamExamples] = React.useState<Example[]>([])
  const [active, setActive] = React.useState(0)
  const [stage, setStage] = React.useState<'collect' | 'try' | 'test'>(model.trainedOn ? 'try' : 'collect')
  const [training, setTraining] = React.useState(false)
  const [tries, setTries] = React.useState(0)
  const minTests = Math.max(6, model.labels.length * 2)

  const save = React.useCallback(
    (next: SavedModel) => {
      setModelState(next)
      set(key, next)
    },
    [key, set],
  )

  const examples: Example[] = React.useMemo(
    () => (model.input === 'draw' ? model.examples.map((e) => ({ label: e.l, v: decode(e.s) })) : camExamples),
    [model.input, model.examples, camExamples],
  )
  const counts = model.labels.map((_, i) => examples.filter((e) => e.label === i).length)
  const enough = counts.every((c) => c >= block.minExamples)
  const trained = model.trainedOn > 0 && model.trainedOn === examples.length && enough
  const stale = model.trainedOn > 0 && model.trainedOn !== examples.length
  const camLost = model.input === 'camera' && model.counts.some(Boolean) && camExamples.length === 0

  function addExample(v: number[]) {
    if (counts[active]! >= MAX_PER_CLASS) return
    if (model.input === 'draw') {
      const next = { ...model, examples: [...model.examples, { l: active, s: encode(v) }] }
      save({ ...next, counts: model.labels.map((_, i) => next.examples.filter((e) => e.l === i).length) })
    } else {
      const nextCam = [...camExamples, { label: active, v }]
      setCamExamples(nextCam)
      save({ ...model, counts: model.labels.map((_, i) => nextCam.filter((e) => e.label === i).length) })
    }
  }

  function removeExample(index: number) {
    if (model.input === 'draw') {
      const nextEx = model.examples.filter((_, i) => i !== index)
      save({ ...model, examples: nextEx, counts: model.labels.map((_, i) => nextEx.filter((e) => e.l === i).length) })
    } else {
      const nextCam = camExamples.filter((_, i) => i !== index)
      setCamExamples(nextCam)
      save({ ...model, counts: model.labels.map((_, i) => nextCam.filter((e) => e.label === i).length) })
    }
  }

  function train() {
    setTraining(true)
    window.setTimeout(() => {
      setTraining(false)
      const finished = model.tests.length >= minTests ? [...model.rounds, { examples: model.trainedOn, tested: model.tests.length, accuracy: accuracy(model.tests) }] : model.rounds
      save({ ...model, trainedOn: examples.length, tests: [], rounds: finished.slice(-6) })
      setStage('try')
    }, 900)
  }

  function startOver(input: SavedModel['input']) {
    setCamExamples([])
    setActive(0)
    setStage('collect')
    const renamed = !sameLabels(model.labels, defaultLabels(model.input))
    save(blank(renamed ? model.labels : defaultLabels(input), input))
  }

  function rename(i: number, name: string) {
    save({ ...model, labels: model.labels.map((l, j) => (j === i ? name.slice(0, 24) : l)) })
  }

  function addGroup() {
    if (model.labels.length >= 4 || examples.length) return
    save({ ...model, labels: [...model.labels, `Group ${String.fromCharCode(65 + model.labels.length)}`], counts: [...model.counts, 0] })
  }

  function removeGroup(i: number) {
    if (model.labels.length <= 2 || examples.length) return
    save({ ...model, labels: model.labels.filter((_, j) => j !== i), counts: model.counts.filter((_, j) => j !== i) })
    setActive(0)
  }

  function onTried() {
    const n = tries + 1
    setTries(n)
    if (!block.test && trained && n >= 3) record({ done: true, score: 100 })
  }

  function addTest(truth: number, predicted: number) {
    const tests = [...model.tests, { truth, predicted }]
    save({ ...model, tests })
    const perClass = model.labels.every((_, c) => tests.some((t) => t.truth === c))
    if (tests.length >= minTests && perClass) record({ done: true, score: accuracy(tests) })
  }

  const predict = React.useCallback((v: number[]) => knn(examples, v, K, model.labels.length), [examples, model.labels.length])

  return (
    <ActivityCard kicker="Model builder" title={block.title} done={result?.done}>
      {readOnly ? <p className="mb-3 text-xs text-ink-subtle">Preview: the model works, but nothing is saved.</p> : null}

      <ol className="mb-4 grid gap-2 sm:grid-cols-3" aria-label="Stages">
        {(
          [
            ['collect', '1. Collect examples', Plus],
            ['try', '2. Train and try', Brain],
            ...(block.test ? [['test', '3. Test fairly', FlaskConical] as const] : []),
          ] as const
        ).map(([id, label, Icon]) => {
          const locked = id !== 'collect' && !trained
          return (
            <li key={id}>
              <button
                type="button"
                disabled={locked}
                onClick={() => setStage(id)}
                aria-current={stage === id ? 'step' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-left text-sm font-medium',
                  stage === id ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:bg-surface-2',
                  locked && 'cursor-not-allowed opacity-50',
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            </li>
          )
        })}
      </ol>

      {block.input === 'camera' ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-muted">Give examples by</span>
          <Pill active={model.input === 'draw'} onClick={() => model.input !== 'draw' && startOver('draw')}>
            <Pencil className="size-3.5" aria-hidden /> Drawing
          </Pill>
          <Pill active={model.input === 'camera'} onClick={() => model.input !== 'camera' && startOver('camera')}>
            <Camera className="size-3.5" aria-hidden /> Camera
          </Pill>
          {examples.length ? <span className="text-xs text-ink-subtle">Switching starts a new model.</span> : null}
        </div>
      ) : null}

      {camLost ? (
        <Feedback tone="info">Camera pictures are never saved, so your camera examples were cleared when you left the page. Add them again and retrain; your earlier test results are kept.</Feedback>
      ) : null}

      {stage === 'collect' || !trained ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-ink">Your groups</p>
            <p className="text-xs text-ink-muted">Rename them to anything. {examples.length ? 'Start a new model to add or remove groups.' : 'You can have 2 to 4.'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {model.labels.map((l, i) => (
                <div key={i} className={cn('flex items-center gap-1 rounded-full border px-1 py-0.5', active === i ? 'border-ink bg-surface-2' : 'border-line')}>
                  <button type="button" className="px-2 text-xs font-semibold text-ink-subtle" onClick={() => setActive(i)} aria-label={`Add examples to ${l}`} aria-pressed={active === i}>
                    {counts[i]}
                  </button>
                  <input
                    value={l}
                    onChange={(e) => rename(i, e.target.value)}
                    onFocus={() => setActive(i)}
                    aria-label={`Name of group ${i + 1}`}
                    className="w-28 bg-transparent py-1 text-sm font-medium text-ink outline-none"
                  />
                  {model.labels.length > 2 && !examples.length ? (
                    <button type="button" onClick={() => removeGroup(i)} aria-label={`Remove ${l}`} className="p-1 text-ink-subtle hover:text-ink">
                      <X className="size-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>
              ))}
              {model.labels.length < 4 && !examples.length ? (
                <Pill onClick={addGroup}>
                  <Plus className="size-3.5" aria-hidden /> Add group
                </Pill>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
            <div>
              <p className="mb-1.5 text-sm text-ink">
                Adding to <strong>{model.labels[active]}</strong> ({counts[active]} of {MAX_PER_CLASS})
              </p>
              {model.input === 'draw' ? (
                <DrawPad actionLabel={`Add to ${model.labels[active]}`} onSubmit={addExample} disabled={counts[active]! >= MAX_PER_CLASS} />
              ) : (
                <CameraPad actionLabel={`Add to ${model.labels[active]}`} onCapture={addExample} burst disabled={counts[active]! >= MAX_PER_CLASS} />
              )}
            </div>
            <ExampleShelf labels={model.labels} examples={examples} input={model.input} onRemove={removeExample} />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <Button onClick={train} disabled={!enough || training} loading={training}>
              <Brain /> {model.trainedOn ? 'Train again' : 'Train my model'}
            </Button>
            <span className="text-sm text-ink-muted" role="status">
              {training
                ? `Learning from ${examples.length} examples…`
                : enough
                  ? stale
                    ? 'You changed the examples. Train again to update your model.'
                    : trained
                      ? 'Trained and up to date.'
                      : 'Ready to train!'
                  : `Add at least ${block.minExamples} examples to every group.`}
            </span>
            {examples.length ? (
              <button type="button" onClick={() => startOver(model.input)} className="ml-auto inline-flex items-center gap-1 text-xs text-ink-subtle hover:text-ink">
                <RotateCcw className="size-3" aria-hidden /> Start a new model
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {stage === 'try' && trained ? (
        <TryStage model={model} input={model.input} predict={predict} examples={examples} onTried={onTried} tries={tries} test={block.test} goTest={() => setStage('test')} />
      ) : null}

      {stage === 'test' && trained ? <TestStage model={model} input={model.input} predict={predict} minTests={minTests} onTest={addTest} onClear={() => save({ ...model, tests: [] })} /> : null}
    </ActivityCard>
  )
}

/* --------------------------------------------------------------- stages */

function Confidence({ labels, p }: { labels: string[]; p: Prediction }) {
  const total = p.votes.reduce((s, v) => s + v, 0) || 1
  return (
    <ul className="space-y-1.5" aria-label="Confidence for each group">
      {labels.map((l, i) => {
        const pct = Math.round((p.votes[i]! / total) * 100)
        return (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="w-24 truncate text-ink">{l}</span>
            <span className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span className={cn('block h-full rounded-full', i === p.label ? 'bg-[var(--success)]' : 'bg-[#9bb6e0]')} style={{ width: `${pct}%` }} />
            </span>
            <span className="w-10 text-right text-xs tabular-nums text-ink-muted">{pct}%</span>
          </li>
        )
      })}
    </ul>
  )
}

function TryStage({
  model,
  input,
  predict,
  examples,
  onTried,
  tries,
  test,
  goTest,
}: {
  model: SavedModel
  input: SavedModel['input']
  predict: (v: number[]) => Prediction | null
  examples: Example[]
  onTried: () => void
  tries: number
  test: boolean
  goTest: () => void
}) {
  const [p, setP] = React.useState<Prediction | null>(null)
  const run = (v: number[]) => {
    const r = predict(v)
    setP(r)
    if (r) onTried()
  }
  return (
    <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
      <div>
        <p className="mb-1.5 text-sm text-ink">{input === 'draw' ? 'Draw something new' : 'Show the camera something'}</p>
        {input === 'draw' ? <DrawPad actionLabel="What is it?" onSubmit={run} clearAfter={false} /> : <CameraPad actionLabel="What is it?" onCapture={run} live />}
      </div>
      <div className="min-w-0 space-y-3">
        {p ? (
          <>
            <div className="rounded-[var(--radius)] border border-line p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                <Sparkles className="size-3.5" aria-hidden /> Prediction
              </p>
              <p className="mt-1 text-xl font-semibold text-ink" role="status">
                {model.labels[p.label]} <span className="text-sm font-normal text-ink-muted">({Math.round(p.confidence * 100)}% of the votes)</span>
              </p>
              <div className="mt-2">
                <Confidence labels={model.labels} p={p} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">The {p.neighbours.length} nearest examples voted</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {p.neighbours.map((i) => (
                  <figure key={i} className="text-center">
                    <Thumb v={examples[i]!.v} input={input} size={48} />
                    <figcaption className="mt-0.5 max-w-16 truncate text-[11px] text-ink-muted">{model.labels[examples[i]!.label]}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
            {p.confidence < 0.67 ? <Feedback tone="info">Not very sure. Add more examples like this one to the right group, then train again.</Feedback> : null}
          </>
        ) : (
          <p className="text-sm text-ink-muted">Your model learned from {examples.length} examples. Give it something it has never seen.</p>
        )}
        {test && tries >= 1 ? (
          <Button size="sm" variant="secondary" onClick={goTest}>
            <FlaskConical /> Now test it fairly
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function TestStage({
  model,
  input,
  predict,
  minTests,
  onTest,
  onClear,
}: {
  model: SavedModel
  input: SavedModel['input']
  predict: (v: number[]) => Prediction | null
  minTests: number
  onTest: (truth: number, predicted: number) => void
  onClear: () => void
}) {
  const [truth, setTruth] = React.useState(0)
  const [last, setLast] = React.useState<{ truth: number; predicted: number } | null>(null)
  const m = confusion(model.tests, model.labels.length)
  const acc = accuracy(model.tests)
  const mix = biggestMixUp(m)
  const missing = model.labels.filter((_, c) => !model.tests.some((t) => t.truth === c))

  function run(v: number[]) {
    const p = predict(v)
    if (!p) return
    setLast({ truth, predicted: p.label })
    onTest(truth, p.label)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Make new examples your model has never seen. First pick what it <strong>really</strong> is, then {input === 'draw' ? 'draw it' : 'show it'}. Test at least {minTests}, with some of every group.
      </p>
      <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="What it really is">
            {model.labels.map((l, i) => (
              <Pill key={i} role="radio" aria-checked={truth === i} active={truth === i} onClick={() => setTruth(i)}>
                {l}
              </Pill>
            ))}
          </div>
          {input === 'draw' ? <DrawPad actionLabel="Test it" onSubmit={run} /> : <CameraPad actionLabel="Test it" onCapture={run} />}
          {last ? (
            <p className={cn('mt-2 text-sm font-medium', last.truth === last.predicted ? 'text-success' : 'text-[var(--danger)]')} role="status">
              {last.truth === last.predicted ? `Right: it said ${model.labels[last.predicted]}.` : `Mistake: it said ${model.labels[last.predicted]}, really ${model.labels[last.truth]}.`}
            </p>
          ) : null}
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-sm text-ink-muted">
              Tested: <strong className="text-ink tabular-nums">{model.tests.length}</strong>
            </p>
            <p className="text-sm text-ink-muted">
              Accuracy: <strong className="text-lg text-ink tabular-nums">{model.tests.length ? `${acc}%` : '–'}</strong>
              {model.tests.length ? <span className="ml-1 text-xs">({model.tests.filter((t) => t.truth === t.predicted).length} of {model.tests.length} right)</span> : null}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm" aria-label="Confusion matrix: rows are the real group, columns the prediction">
              <thead>
                <tr>
                  <th className="p-1 text-left text-[11px] font-semibold uppercase text-ink-subtle">Real ↓ / Said →</th>
                  {model.labels.map((l, i) => (
                    <th key={i} scope="col" className="max-w-20 truncate p-1 text-xs font-medium text-ink">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.map((row, r) => (
                  <tr key={r}>
                    <th scope="row" className="max-w-24 truncate p-1 text-left text-xs font-medium text-ink">
                      {model.labels[r]}
                    </th>
                    {row.map((v, c) => (
                      <td
                        key={c}
                        className={cn(
                          'size-11 border border-line text-center font-semibold tabular-nums',
                          r === c ? 'bg-success-bg text-ink' : v ? 'bg-danger-bg text-ink' : 'text-ink-subtle',
                        )}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mix ? (
            <Feedback tone="info">
              Biggest mix-up: <strong>{model.labels[mix.truth]}</strong> taken for <strong>{model.labels[mix.predicted]}</strong> ({mix.count} time{mix.count === 1 ? '' : 's'}). Add more varied {model.labels[mix.truth]} examples and train again.
            </Feedback>
          ) : null}
          {model.tests.length >= minTests && !missing.length ? (
            <Feedback tone="right">Test complete. To improve, go back to Collect, add better examples and train again: your new test will be compared with this one.</Feedback>
          ) : missing.length && model.tests.length ? (
            <p className="text-xs text-ink-muted">Still to test: {missing.join(', ')}.</p>
          ) : null}
          {model.rounds.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Earlier test rounds</p>
              <ul className="mt-1 space-y-0.5 text-sm text-ink">
                {model.rounds.map((r, i) => (
                  <li key={i}>
                    Round {i + 1}: {r.accuracy}% on {r.tested} tests, trained on {r.examples} examples
                  </li>
                ))}
                <li className="text-ink-muted">Now: {model.tests.length ? `${acc}% on ${model.tests.length} tests` : 'not tested yet'}, trained on {model.trainedOn} examples</li>
              </ul>
            </div>
          ) : null}
          {model.tests.length ? (
            <button type="button" onClick={onClear} className="inline-flex items-center gap-1 text-xs text-ink-subtle hover:text-ink">
              <Trash2 className="size-3" aria-hidden /> Clear test results
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- input pads */

function DrawPad({ actionLabel, onSubmit, disabled, clearAfter = true }: { actionLabel: string; onSubmit: (v: number[]) => void; disabled?: boolean; clearAfter?: boolean }) {
  const ref = React.useRef<HTMLCanvasElement>(null)
  const last = React.useRef<{ x: number; y: number } | null>(null)
  const [ink, setInk] = React.useState(false)

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * PAD, y: ((e.clientY - r.top) / r.height) * PAD }
  }
  function line(to: { x: number; y: number }) {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#0b0b0d'
    ctx.lineWidth = 13
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    const from = last.current ?? to
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x + 0.01, to.y)
    ctx.stroke()
    last.current = to
    setInk(true)
  }
  function clear() {
    ref.current?.getContext('2d')?.clearRect(0, 0, PAD, PAD)
    setInk(false)
  }
  function submit() {
    const ctx = ref.current?.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const data = ctx.getImageData(0, 0, PAD, PAD).data
    const alpha = new Uint8ClampedArray(PAD * PAD)
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!
    const v = normaliseInk(alpha, PAD)
    if (!v) return
    onSubmit(v)
    if (clearAfter) clear()
  }

  return (
    <div className="w-[224px] max-w-full">
      <canvas
        ref={ref}
        width={PAD}
        height={PAD}
        aria-label="Drawing area. Draw with your mouse, finger or pen."
        className="aspect-square w-full touch-none rounded-[var(--radius)] border-2 border-ink bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          last.current = null
          line(point(e))
        }}
        onPointerMove={(e) => {
          if (e.buttons || e.pointerType === 'touch') {
            if (last.current) line(point(e))
          }
        }}
        onPointerUp={() => (last.current = null)}
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={submit} disabled={!ink || disabled}>
          {actionLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={clear} disabled={!ink}>
          <Eraser /> Clear
        </Button>
      </div>
    </div>
  )
}

function CameraPad({ actionLabel, onCapture, burst, live, disabled }: { actionLabel: string; onCapture: (v: number[]) => void; burst?: boolean; live?: boolean; disabled?: boolean }) {
  const video = React.useRef<HTMLVideoElement>(null)
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = React.useState<'off' | 'starting' | 'on' | 'denied' | 'unsupported'>('off')
  const [auto, setAuto] = React.useState(false)
  const holding = React.useRef<number | null>(null)
  const stream = React.useRef<MediaStream | null>(null)

  React.useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop())
      if (holding.current) window.clearInterval(holding.current)
    },
    [],
  )

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) return setStatus('unsupported')
    setStatus('starting')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false })
      stream.current = s
      if (video.current) {
        video.current.srcObject = s
        await video.current.play()
      }
      setStatus('on')
    } catch {
      setStatus('denied')
    }
  }

  const grab = React.useCallback(() => {
    const v = video.current
    const c = canvas.current
    if (!v || !c || !v.videoWidth) return
    const w = 96
    const h = 72
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(v, 0, 0, w, h)
    onCapture(cameraFeatures(ctx.getImageData(0, 0, w, h).data, w, h))
  }, [onCapture])

  React.useEffect(() => {
    if (!live || !auto || status !== 'on') return
    const t = window.setInterval(grab, 400)
    return () => window.clearInterval(t)
  }, [live, auto, status, grab])

  function stopHold() {
    if (holding.current) window.clearInterval(holding.current)
    holding.current = null
  }

  return (
    <div className="w-[224px] max-w-full">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius)] border-2 border-ink bg-surface-2">
        <video ref={video} muted playsInline className={cn('size-full -scale-x-100 object-cover', status !== 'on' && 'hidden')} />
        {status !== 'on' ? (
          <div className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-ink-muted">
            {status === 'denied'
              ? 'Camera blocked or not available. Allow it in your browser, or switch to drawing.'
              : status === 'unsupported'
                ? 'This browser cannot use a camera here. Switch to drawing.'
                : status === 'starting'
                  ? 'Starting camera…'
                  : 'The camera stays on this device. Nothing is uploaded.'}
          </div>
        ) : null}
      </div>
      <canvas ref={canvas} className="hidden" />
      <div className="mt-2 flex flex-wrap gap-2">
        {status !== 'on' ? (
          <Button size="sm" onClick={start} loading={status === 'starting'} disabled={status === 'unsupported'}>
            <Camera /> {status === 'denied' ? 'Try camera again' : 'Turn on camera'}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              disabled={disabled}
              onClick={burst ? undefined : grab}
              onPointerDown={
                burst
                  ? () => {
                      grab()
                      holding.current = window.setInterval(grab, 180)
                    }
                  : undefined
              }
              onPointerUp={burst ? stopHold : undefined}
              onPointerLeave={burst ? stopHold : undefined}
              onKeyDown={burst ? (e) => (e.key === 'Enter' || e.key === ' ') && grab() : undefined}
            >
              {actionLabel}
            </Button>
            {live ? (
              <Pill active={auto} onClick={() => setAuto((a) => !a)}>
                {auto ? 'Live: on' : 'Live: off'}
              </Pill>
            ) : null}
          </>
        )}
      </div>
      {burst && status === 'on' ? <p className="mt-1 text-[11px] text-ink-subtle">Hold the button to add several, moving a little each time.</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------ examples */

function Thumb({ v, input, size = 36 }: { v: number[]; input: SavedModel['input']; size?: number }) {
  const ref = React.useRef<HTMLCanvasElement>(null)
  const w = input === 'draw' ? GRID : CAM_W
  const h = input === 'draw' ? GRID : CAM_H
  React.useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(w, h)
    for (let i = 0; i < w * h; i++) {
      if (input === 'draw') {
        const g = 255 - Math.round(v[i]! * 255)
        img.data.set([g, g, g, 255], i * 4)
      } else {
        img.data.set([Math.min(255, v[i * 3]! * 510), Math.min(255, v[i * 3 + 1]! * 510), Math.min(255, v[i * 3 + 2]! * 510), 255], i * 4)
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [v, w, h, input])
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      aria-hidden
      className={cn('rounded border border-line bg-white [image-rendering:pixelated]', input === 'camera' && '-scale-x-100')}
      style={{ width: size, height: input === 'draw' ? size : (size * CAM_H) / CAM_W }}
    />
  )
}

function ExampleShelf({ labels, examples, input, onRemove }: { labels: string[]; examples: Example[]; input: SavedModel['input']; onRemove: (index: number) => void }) {
  return (
    <div className="min-w-0 space-y-2">
      {labels.map((l, c) => {
        const mine = examples.map((e, i) => ({ e, i })).filter((x) => x.e.label === c)
        return (
          <div key={c}>
            <p className="text-xs font-semibold text-ink">
              {l} <span className="font-normal text-ink-muted">· {mine.length}</span>
            </p>
            <div className="mt-1 flex min-h-10 flex-wrap gap-1">
              {mine.length ? (
                mine.map(({ e, i }) => (
                  <button key={i} type="button" onClick={() => onRemove(i)} title="Remove this example" aria-label={`Remove example ${i + 1} from ${l}`} className="rounded hover:opacity-60">
                    <Thumb v={e.v} input={input} />
                  </button>
                ))
              ) : (
                <span className="text-xs text-ink-subtle">No examples yet</span>
              )}
            </div>
          </div>
        )
      })}
      {examples.length ? <p className="text-[11px] text-ink-subtle">Tap an example to remove it. This is what your model sees: a tiny {input === 'draw' ? '16 × 16 grey' : '12 × 9 colour'} picture.</p> : null}
    </div>
  )
}
