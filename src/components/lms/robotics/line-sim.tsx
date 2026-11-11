'use client'

import * as React from 'react'
import { Check, Pause, Pencil, Play, RotateCcw, Trophy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RichBlock } from '@/lib/lms/rich'
import {
  DEFAULT_SETTINGS,
  TRACKS,
  WORLD,
  customTrack,
  distanceToTrack,
  judge,
  progressAlong,
  sensorPositions,
  step,
  type Action,
  type MotorCommand,
  type Point,
  type Reading,
  type Robot,
  type SimSettings,
  type Track,
} from '@/lib/lms/robot'
import { cn } from '@/lib/utils'
import { ActivityCard, Feedback, Pill } from './activity-kit'
import { AMBER, BLUE, INK, PAPER, RED } from './diagrams'
import { useLessonState } from './lesson-state'

type Of<T extends RichBlock['type']> = Extract<RichBlock, { type: T }>

export type SimRecord = {
  finished: Record<string, { seconds: number; baseSpeed: number; at: string }>
  experiments: string[]
}

type Experiment = {
  id: string
  title: string
  brief: string
  setup: Partial<SimSettings['algorithm']> & { track: string; sensitivity?: number; lineWidth?: number }
  /** Locked controls keep the experiment about one variable. */
  locks?: ('track' | 'turn' | 'both')[]
  goal: (o: { track: string; settings: SimSettings; status: Status }) => boolean
  success: string
  predict?: { question: string; options: { id: Status; text: string }[]; answer: Status }
}

type Status = 'ready' | 'running' | 'paused' | 'finished' | 'lost' | 'stopped'

const EXPERIMENTS: Experiment[] = [
  {
    id: 'speed',
    title: '1. Speed test',
    brief: 'Raise the speed step by step. At some point gentle turns cannot keep up on the S-curve. Find a way to finish it at speed 200 or more.',
    setup: { track: 's-curve', baseSpeed: 120, turnStyle: 'gentle', bothOnLine: 'STOP' },
    locks: ['track'],
    goal: ({ track, settings, status }) => track === 's-curve' && status === 'finished' && settings.algorithm.baseSpeed >= 200,
    success: 'A faster robot travels further before each correction takes effect, so it needs sharper turns. Pivot turns correct quickly enough.',
  },
  {
    id: 'calibration',
    title: '2. Sensor calibration',
    brief: 'The sensitivity knob is turned too far: the sensors think everything is black, so the robot stops at once. Lower the sensitivity until it finishes the curve.',
    setup: { track: 'curve', baseSpeed: 150, turnStyle: 'gentle', bothOnLine: 'STOP', sensitivity: 0.95 },
    locks: ['track'],
    goal: ({ track, status, settings }) => track === 'curve' && status === 'finished' && settings.sensitivity <= 0.75,
    success: 'Calibrated! On a real robot you do this with the blue knob, watching the Serial Monitor over black and over white.',
  },
  {
    id: 'difficulty',
    title: '3. Track difficulty',
    brief: 'Sharp 90° corners are much harder than curves. Change the turn style and speed until the robot completes the sharp-turns track.',
    setup: { track: 'sharp', baseSpeed: 120, turnStyle: 'gentle', bothOnLine: 'STOP' },
    locks: ['track'],
    goal: ({ track, status }) => track === 'sharp' && status === 'finished',
    success: 'A gentle turn swings too wide for a 90° corner. Spinning the inside wheel backwards (pivot) turns tightly enough.',
  },
  {
    id: 'predict',
    title: '4. Predict the movement',
    brief: 'Before you press Start: the robot uses gentle turns at a fast speed of 220 on the S-curve. What will happen?',
    setup: { track: 's-curve', baseSpeed: 220, turnStyle: 'gentle', bothOnLine: 'STOP' },
    locks: ['track', 'turn', 'both'],
    goal: ({ status }) => status === 'lost',
    success: 'Too fast for gentle turns: by the time a correction takes effect the robot has already left the line.',
    predict: {
      question: 'What will the robot do?',
      options: [
        { id: 'finished', text: 'Finish the track' },
        { id: 'stopped', text: 'Stop at the first bend' },
        { id: 'lost', text: 'Lose the line on a bend' },
      ],
      answer: 'lost',
    },
  },
  {
    id: 'fix',
    title: '5. Fix the wrong algorithm',
    brief: 'Someone swapped the left and right turn rules. Watch what happens, then fix the algorithm and finish the curve.',
    setup: { track: 'curve', baseSpeed: 150, turnStyle: 'gentle', bothOnLine: 'STOP', swapped: true },
    locks: ['track'],
    goal: ({ track, status, settings }) => track === 'curve' && status === 'finished' && !settings.algorithm.swapped,
    success: 'Fixed. With the rules swapped the robot steers away from the line at every bend; the correct rule turns towards the sensor that sees black.',
  },
]

const CHALLENGE_TRACKS = ['s-curve', 'sharp']

const TUTORIAL = [
  'This is the track: a black line on a white mat. The robot starts at the left.',
  'The two orange squares are the IR sensors. They turn red when they see black.',
  'The panel on the right shows what the sensors read, the rule the robot chooses, and each wheel’s speed.',
  'Press Start. Change speed, sensitivity or track, then press Reset and try again.',
]

export function LineSimulator({ block }: { block: Of<'line-sim'> }) {
  const { get, set } = useLessonState()
  const record = get<SimRecord>(`sim:${block.id}`, { finished: {}, experiments: [] })
  const [trackId, setTrackId] = React.useState(block.mode === 'challenge' ? 's-curve' : 'curve')
  const [drawn, setDrawn] = React.useState<Point[]>([])
  const [drawing, setDrawing] = React.useState(false)
  const [settings, setSettings] = React.useState<SimSettings>(DEFAULT_SETTINGS)
  const [status, setStatus] = React.useState<Status>('ready')
  const [tick, setTick] = React.useState(0)
  const [timeScale, setTimeScale] = React.useState(1)
  const [experiment, setExperiment] = React.useState<Experiment | null>(null)
  const [prediction, setPrediction] = React.useState<Status | null>(null)
  const [tutorial, setTutorial] = React.useState(block.tutorial && !get<boolean>(`sim:${block.id}:tutorial`, false) ? 0 : -1)

  const track: Track | null = trackId === 'custom' ? customTrack(drawn) : TRACKS.find((t) => t.id === trackId) ?? TRACKS[0]!
  const sim = React.useRef<{ robot: Robot; trail: Point[]; progress: number; seconds: number; stoppedFor: number; last: { reading: Reading; action: Action; motors: MotorCommand; coverage: { left: number; right: number } } | null }>({
    robot: track ? { ...track.start } : { x: 0, y: 0, heading: 0 },
    trail: [],
    progress: 0,
    seconds: 0,
    stoppedFor: 0,
    last: null,
  })
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const raf = React.useRef<number | null>(null)

  const reset = React.useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = null
    sim.current = { robot: track ? { ...track.start } : { x: 0, y: 0, heading: 0 }, trail: [], progress: 0, seconds: 0, stoppedFor: 0, last: null }
    setStatus('ready')
    setTick((t) => t + 1)
  }, [track])

  // A new track or setting starts a fresh run.
  const trackKey = track ? `${track.id}:${track.points.length}` : 'none'
  React.useEffect(() => {
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey])

  const finish = React.useCallback(
    (outcome: Status) => {
      setStatus(outcome)
      if (!track) return
      const next: SimRecord = { finished: { ...record.finished }, experiments: [...record.experiments] }
      let changed = false
      if (outcome === 'finished' && track.id !== 'custom') {
        const prev = next.finished[track.id]
        if (!prev || prev.seconds > sim.current.seconds) {
          next.finished[track.id] = { seconds: Math.round(sim.current.seconds * 10) / 10, baseSpeed: settings.algorithm.baseSpeed, at: new Date().toISOString() }
          changed = true
        }
      }
      if (experiment && experiment.goal({ track: track.id, settings, status: outcome }) && !next.experiments.includes(experiment.id)) {
        if (!experiment.predict || prediction === experiment.predict.answer) {
          next.experiments.push(experiment.id)
          changed = true
        }
      }
      if (changed) {
        set(`sim:${block.id}`, next)
        const challengeDone = CHALLENGE_TRACKS.every((t) => next.finished[t])
        const experimentsDone = EXPERIMENTS.every((e) => next.experiments.includes(e.id))
        if ((block.mode === 'challenge' && challengeDone) || (block.mode === 'experiments' && experimentsDone) || (block.mode === 'explore' && Object.keys(next.finished).length > 0)) {
          set(`a:${block.id}`, { done: true, score: 100 })
        }
      }
    },
    [track, record, settings, experiment, prediction, set, block.id, block.mode],
  )

  const run = React.useCallback(() => {
    if (!track) return
    setStatus('running')
    let prev = performance.now()
    const dt = 1 / 120
    let acc = 0
    const loop = (now: number) => {
      acc += Math.min(0.1, (now - prev) / 1000) * timeScale
      prev = now
      const s = sim.current
      while (acc >= dt) {
        acc -= dt
        const r = step(s.robot, track, settings, dt)
        s.robot = r.robot
        s.last = { reading: r.reading, action: r.action, motors: r.motors, coverage: r.coverage }
        s.seconds += dt
        if (s.trail.length === 0 || Math.hypot(s.robot.x - s.trail[s.trail.length - 1]!.x, s.robot.y - s.trail[s.trail.length - 1]!.y) > 4) s.trail.push({ x: s.robot.x, y: s.robot.y })
        s.progress = Math.max(s.progress, progressAlong(s.robot, track))
        s.stoppedFor = r.action === 'STOP' ? s.stoppedFor + dt : 0
        const outcome = judge(s.robot, track, s.progress, distanceToTrack(s.robot, track), r.action)
        if (outcome || s.stoppedFor > 1.2 || s.seconds > 60) {
          raf.current = null
          draw()
          setTick((t) => t + 1)
          finish(outcome ?? (s.stoppedFor > 1.2 ? 'stopped' : 'lost'))
          return
        }
      }
      draw()
      setTick((t) => (t + 1) % 1_000_000)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, settings, timeScale, finish])

  const pause = () => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = null
    setStatus('paused')
  }

  React.useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current)
  }, [])

  /* ----------------------------------------------------------- drawing */

  const draw = React.useCallback(() => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth
    const h = (w * WORLD.height) / WORLD.width
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    const k = (w / WORLD.width) * dpr
    ctx.setTransform(k, 0, 0, k, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, WORLD.width, WORLD.height)
    ctx.strokeStyle = '#ece9e1'
    ctx.lineWidth = 1
    for (let x = 0; x <= WORLD.width; x += 50) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, WORLD.height)
      ctx.stroke()
    }
    for (let y = 0; y <= WORLD.height; y += 50) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(WORLD.width, y)
      ctx.stroke()
    }
    const pts = trackId === 'custom' ? drawn : track?.points ?? []
    if (pts.length > 1) {
      ctx.strokeStyle = INK
      ctx.lineWidth = settings.lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      if (track?.closed) ctx.closePath()
      ctx.stroke()
    } else if (pts.length === 1) {
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.arc(pts[0]!.x, pts[0]!.y, settings.lineWidth / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    if (!track) return
    // finish flag
    if (!track.closed) {
      const end = track.points[track.points.length - 1]!
      ctx.fillStyle = '#2e9e6a'
      ctx.beginPath()
      ctx.arc(end.x, end.y, 9, 0, Math.PI * 2)
      ctx.fill()
    }
    const s = sim.current
    if (s.trail.length > 1) {
      ctx.strokeStyle = 'rgba(47,95,179,0.55)'
      ctx.lineWidth = 3
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      s.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.lineTo(s.robot.x, s.robot.y)
      ctx.stroke()
      ctx.setLineDash([])
    }
    const r = s.robot
    ctx.save()
    ctx.translate(r.x, r.y)
    ctx.rotate(r.heading)
    ctx.fillStyle = INK
    ctx.fillRect(-14, -36, 26, 10)
    ctx.fillRect(-14, 26, 26, 10)
    ctx.fillStyle = BLUE
    ctx.strokeStyle = INK
    ctx.lineWidth = 2.5
    roundRect(ctx, -22, -28, 52, 56, 10)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, -10, -12, 22, 24, 3)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    const sp = sensorPositions(r, settings)
    const reading = s.last?.reading ?? { left: false, right: false }
    for (const side of ['left', 'right'] as const) {
      ctx.fillStyle = reading[side] ? RED : AMBER
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(sp[side].x, sp[side].y, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }, [track, trackId, drawn, settings])

  React.useEffect(() => {
    draw()
  }, [draw, tick])

  React.useEffect(() => {
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * WORLD.width, y: ((e.clientY - rect.top) / rect.height) * WORLD.height }
  }

  function startExperiment(x: Experiment) {
    if (raf.current) cancelAnimationFrame(raf.current)
    setExperiment(x)
    setPrediction(null)
    setTrackId(x.setup.track)
    setSettings({
      ...DEFAULT_SETTINGS,
      sensitivity: x.setup.sensitivity ?? DEFAULT_SETTINGS.sensitivity,
      lineWidth: x.setup.lineWidth ?? DEFAULT_SETTINGS.lineWidth,
      algorithm: {
        baseSpeed: x.setup.baseSpeed ?? 150,
        turnStyle: x.setup.turnStyle ?? 'gentle',
        bothOnLine: x.setup.bothOnLine ?? 'STOP',
        swapped: x.setup.swapped ?? false,
      },
    })
    setTimeout(() => reset(), 0)
  }

  const locked = (what: 'track' | 'turn' | 'both') => !!experiment?.locks?.includes(what)
  const algo = settings.algorithm
  const last = sim.current.last
  const running = status === 'running'
  const needsPrediction = !!experiment?.predict && !prediction
  const met = experiment && track && experiment.goal({ track: track.id, settings, status }) && (!experiment.predict || prediction === experiment.predict.answer)

  const kicker = block.mode === 'challenge' ? 'Challenge' : block.mode === 'experiments' ? 'Experiments' : 'Simulator'
  const title = block.mode === 'challenge' ? 'Line-follower challenge' : block.mode === 'experiments' ? 'Line-follower experiments' : 'Line-following simulator'
  const done =
    block.mode === 'challenge'
      ? CHALLENGE_TRACKS.every((t) => record.finished[t])
      : block.mode === 'experiments'
        ? EXPERIMENTS.every((e) => record.experiments.includes(e.id))
        : Object.keys(record.finished).length > 0

  return (
    <ActivityCard kicker={kicker} title={title} done={done}>
      {block.mode === 'challenge' ? (
        <p className="mb-3 text-sm text-ink-muted">Finish both the S-curve and the sharp-turns track. Your best times are saved and can be attached to your final challenge as virtual-pathway evidence.</p>
      ) : block.mode === 'experiments' ? (
        <div className="mb-3">
          <p className="text-sm text-ink-muted">Five experiments. Pick one: it sets up the track and settings, and tells you what to find out.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXPERIMENTS.map((x) => (
              <Pill key={x.id} active={experiment?.id === x.id} onClick={() => startExperiment(x)}>
                {record.experiments.includes(x.id) ? <Check className="size-3.5" aria-label="Done" /> : null}
                {x.title}
              </Pill>
            ))}
          </div>
        </div>
      ) : (
        <p className="mb-3 text-sm text-ink-muted">A virtual robot with the same rules as your real one. Watch the sensors, change the settings and see what happens.</p>
      )}

      {experiment ? (
        <div className="mb-3 rounded-[var(--radius)] border border-line bg-surface-2 px-3 py-2 text-sm">
          <p className="font-medium text-ink">{experiment.title}</p>
          <p className="mt-0.5 text-ink-muted">{experiment.brief}</p>
          {experiment.predict ? (
            <div className="mt-2" role="radiogroup" aria-label={experiment.predict.question}>
              <p className="text-xs font-semibold text-ink">Your prediction:</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {experiment.predict.options.map((o) => (
                  <Pill key={o.id} role="radio" aria-checked={prediction === o.id} active={prediction === o.id} disabled={!!prediction} onClick={() => setPrediction(o.id)}>
                    {o.text}
                  </Pill>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="relative">
          <canvas
            ref={canvas}
            className={cn('block w-full touch-none rounded-[var(--radius)] border border-line bg-white', drawing && 'cursor-crosshair')}
            style={{ aspectRatio: `${WORLD.width} / ${WORLD.height}` }}
            role="img"
            aria-label={`Simulator. Track: ${track?.name ?? 'none yet'}. Status: ${status}.`}
            onPointerDown={(e) => {
              if (!drawing) return
              setDrawn((d) => [...d, canvasPoint(e)])
            }}
          />
          {tutorial >= 0 ? (
            <div className="absolute inset-x-3 bottom-3 rounded-[var(--radius)] border border-line bg-surface p-3 text-sm shadow-lg" role="dialog" aria-label="Simulator tutorial">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                Quick tour · {tutorial + 1} of {TUTORIAL.length}
              </p>
              <p className="mt-1 text-ink">{TUTORIAL[tutorial]}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (tutorial + 1 >= TUTORIAL.length) {
                      setTutorial(-1)
                      set(`sim:${block.id}:tutorial`, true)
                    } else setTutorial(tutorial + 1)
                  }}
                >
                  {tutorial + 1 >= TUTORIAL.length ? 'Got it' : 'Next'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTutorial(-1)
                    set(`sim:${block.id}:tutorial`, true)
                  }}
                >
                  <X /> Skip
                </Button>
              </div>
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {running ? (
              <Button size="sm" variant="secondary" onClick={pause}>
                <Pause /> Pause
              </Button>
            ) : (
              <Button size="sm" onClick={() => (status === 'ready' || status === 'paused' ? run() : (reset(), setTimeout(run, 0)))} disabled={!track || drawing || needsPrediction}>
                <Play /> {status === 'paused' ? 'Resume' : status === 'ready' ? 'Start' : 'Run again'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw /> Reset
            </Button>
            <label className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
              Sim speed
              <select value={timeScale} onChange={(e) => setTimeScale(Number(e.target.value))} className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface px-1 text-xs">
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
            </label>
          </div>
          <div aria-live="polite" className="mt-2">
            {status === 'finished' ? (
              <Feedback tone="right">
                Finished in {sim.current.seconds.toFixed(1)} s at speed {algo.baseSpeed}!
                {record.finished[track?.id ?? ''] ? ` Best: ${record.finished[track!.id]!.seconds}s.` : ''}
              </Feedback>
            ) : status === 'lost' ? (
              <Feedback tone="wrong">The robot lost the line. Try a lower speed, sharper turns or a different sensitivity.</Feedback>
            ) : status === 'stopped' ? (
              <Feedback tone="wrong">The robot stopped: both sensors saw black. On sharp corners, try “keep going” for the both-on-black rule.</Feedback>
            ) : null}
            {experiment && met && status !== 'running' ? (
              <Feedback tone="right">
                <p className="font-medium">Experiment complete</p>
                <p className="mt-0.5">{experiment.success}</p>
              </Feedback>
            ) : null}
            {experiment?.predict && prediction && status !== 'ready' && status !== 'running' && prediction !== experiment.predict.answer ? (
              <Feedback tone="info">Your prediction was different from what happened. Why do you think the robot did that? Reset and choose the experiment again to retry.</Feedback>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <section aria-label="Decision panel" className="rounded-[var(--radius)] bg-[#0f172a] p-3 font-mono text-xs text-slate-200">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Sensors</p>
            <p>
              L: <SensorValue on={last?.reading.left} /> · R: <SensorValue on={last?.reading.right} />
            </p>
            <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-400">Rule</p>
            <p className="text-sm font-bold text-white">{last ? actionLabel(last.action, algo.swapped) : '—'}</p>
            <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-400">Motors (PWM)</p>
            <p>
              left {last?.motors.left ?? 0} · right {last?.motors.right ?? 0}
            </p>
            <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-400">Run</p>
            <p>
              {sim.current.seconds.toFixed(1)} s · {Math.round(sim.current.progress * 100)}% of track
            </p>
          </section>

          <div className="space-y-2.5">
            <Field label="Track">
              <select
                value={trackId}
                disabled={locked('track') || running}
                onChange={(e) => {
                  setTrackId(e.target.value)
                  setDrawing(e.target.value === 'custom' && drawn.length < 2)
                }}
                className="h-9 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm"
              >
                {TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                <option value="custom">Draw your own</option>
              </select>
            </Field>
            {trackId === 'custom' ? (
              <div className="flex flex-wrap gap-1.5">
                <Pill active={drawing} onClick={() => setDrawing((d) => !d)}>
                  <Pencil className="size-3.5" aria-hidden /> {drawing ? 'Done drawing' : 'Draw'}
                </Pill>
                <Pill
                  onClick={() => {
                    setDrawn([])
                    setDrawing(true)
                  }}
                >
                  Clear
                </Pill>
                <p className="w-full text-xs text-ink-subtle">Click on the mat to add points, from start to finish.</p>
              </div>
            ) : null}
            <Range label="Speed (BASE_SPEED)" value={algo.baseSpeed} min={60} max={255} step={5} disabled={running} onChange={(v) => setSettings((s) => ({ ...s, algorithm: { ...s.algorithm, baseSpeed: v } }))} />
            <Range label="Sensor sensitivity" value={Math.round(settings.sensitivity * 100)} min={5} max={95} step={5} suffix="%" disabled={running} onChange={(v) => setSettings((s) => ({ ...s, sensitivity: v / 100 }))} />
            <Range label="Line width" value={settings.lineWidth} min={12} max={40} step={2} suffix=" mm" disabled={running} onChange={(v) => setSettings((s) => ({ ...s, lineWidth: v }))} />
            <Field label="Turn style">
              <select value={algo.turnStyle} disabled={locked('turn') || running} onChange={(e) => setSettings((s) => ({ ...s, algorithm: { ...s.algorithm, turnStyle: e.target.value as 'gentle' | 'pivot' } }))} className="h-9 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm">
                <option value="gentle">Gentle: slow the inside wheel</option>
                <option value="pivot">Pivot: reverse the inside wheel</option>
              </select>
            </Field>
            <Field label="Both sensors on black">
              <select value={algo.bothOnLine} disabled={locked('both') || running} onChange={(e) => setSettings((s) => ({ ...s, algorithm: { ...s.algorithm, bothOnLine: e.target.value as 'STOP' | 'FORWARD' } }))} className="h-9 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm">
                <option value="STOP">Stop</option>
                <option value="FORWARD">Keep going</option>
              </select>
            </Field>
            {experiment?.setup.swapped !== undefined || algo.swapped ? (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={!algo.swapped} disabled={running} onChange={(e) => setSettings((s) => ({ ...s, algorithm: { ...s.algorithm, swapped: !e.target.checked } }))} className="size-4" />
                Turn towards the sensor that sees black
              </label>
            ) : null}
          </div>
        </div>
      </div>

      {Object.keys(record.finished).length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <Trophy className="size-4 text-[var(--warning)]" aria-hidden />
          Tracks finished:
          {Object.entries(record.finished).map(([id, r]) => (
            <span key={id} className="rounded-full bg-surface-2 px-2 py-0.5">
              {TRACKS.find((t) => t.id === id)?.name ?? id}: {r.seconds}s at {r.baseSpeed}
            </span>
          ))}
        </div>
      ) : null}
    </ActivityCard>
  )
}

function actionLabel(a: Action, swapped?: boolean) {
  const base = a === 'FORWARD' ? 'Go forward' : a === 'LEFT' ? 'Turn left' : a === 'RIGHT' ? 'Turn right' : 'Stop'
  return swapped && (a === 'LEFT' || a === 'RIGHT') ? `${base} (swapped!)` : base
}

function SensorValue({ on }: { on?: boolean }) {
  if (on === undefined) return <span className="text-slate-500">—</span>
  return <span className={on ? 'text-rose-300' : 'text-slate-100'}>{on ? 'BLACK' : 'WHITE'}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = React.useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink">
        {label}
      </label>
      {React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id }) : children}
    </div>
  )
}

function Range({ label, value, min, max, step, suffix = '', disabled, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; disabled?: boolean; onChange: (v: number) => void }) {
  const id = React.useId()
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-xs font-medium text-ink">
          {label}
        </label>
        <span className="font-mono text-xs text-ink-muted">
          {value}
          {suffix}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--brand-500)]" />
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export { PAPER as SIM_PAPER }
