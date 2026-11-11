'use client'

import * as React from 'react'
import { Check, Copy, Download, Lightbulb, RotateCcw, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RichBlock } from '@/lib/lms/rich'
import { drive, type MotorCommand } from '@/lib/lms/robot'
import { cn } from '@/lib/utils'
import { ActivityCard, Feedback, Pill, seededShuffle } from './activity-kit'
import { AMBER, BLUE, BLUE_INK, INK, PAPER, RED } from './diagrams'
import { useLessonState } from './lesson-state'

type Of<T extends RichBlock['type']> = Extract<RichBlock, { type: T }>

/* ----------------------------------------------------------- kit explorer */

const PARTS = [
  { id: 'arduino', name: 'Arduino Uno', job: 'The brain. Its microcontroller runs your program, reads the sensors and tells the motor driver what to do.', group: 'Think', x: 250, y: 120, w: 120, h: 80, fill: BLUE_INK },
  { id: 'driver', name: 'L298N motor driver', job: 'The muscle. It takes small signals from the Arduino and switches battery power to the two motors, forwards or backwards.', group: 'Act', x: 390, y: 120, w: 90, h: 80, fill: RED },
  { id: 'irl', name: 'Left IR sensor', job: 'Shines infrared light at the floor and reports whether it sees black or white, on the left of the line.', group: 'Sense', x: 230, y: 30, w: 60, h: 34, fill: AMBER },
  { id: 'irr', name: 'Right IR sensor', job: 'The same as the left sensor, on the right of the line. Comparing the two tells the robot which way to steer.', group: 'Sense', x: 350, y: 30, w: 60, h: 34, fill: AMBER },
  { id: 'motorl', name: 'Left DC gear motor', job: 'Turns the left wheel. The gearbox makes it slower and stronger.', group: 'Act', x: 150, y: 235, w: 70, h: 44, fill: '#f2d36b' },
  { id: 'motorr', name: 'Right DC gear motor', job: 'Turns the right wheel. Different speeds on the two wheels steer the robot.', group: 'Act', x: 420, y: 235, w: 70, h: 44, fill: '#f2d36b' },
  { id: 'wheel', name: 'Wheel', job: 'Grips the floor. The robot has two driven wheels at the back.', group: 'Body', x: 100, y: 222, w: 40, h: 70, fill: INK },
  { id: 'castor', name: 'Castor wheel', job: 'A small ball wheel at the front. It keeps the robot level and lets it turn smoothly.', group: 'Body', x: 300, y: 72, w: 40, h: 34, fill: '#fff' },
  { id: 'battery', name: 'Battery pack', job: 'Stores the energy for the motors and the electronics. It has a switch to turn the robot off.', group: 'Power', x: 250, y: 230, w: 140, h: 54, fill: '#cfe8da' },
  { id: 'chassis', name: 'Chassis', job: 'The body plate that every part is fixed to.', group: 'Body', x: 500, y: 40, w: 90, h: 50, fill: BLUE },
] as const

export function KitExplorer({ block }: { block: Of<'kit'> }) {
  const { get, set } = useLessonState()
  const seen = get<string[]>(`kit:${block.id}:seen`, [])
  const [active, setActive] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<'explore' | 'quiz'>('explore')
  const order = React.useMemo(() => seededShuffle(PARTS.map((p) => p.id), block.id), [block.id])
  const [qi, setQi] = React.useState(0)
  const [answer, setAnswer] = React.useState<{ id: string; right: boolean } | null>(null)
  const [score, setScore] = React.useState(0)
  const best = get<number>(`kit:${block.id}:best`, 0)
  const allSeen = PARTS.every((p) => seen.includes(p.id))
  const target = PARTS.find((p) => p.id === order[qi])
  const finished = mode === 'quiz' && qi >= order.length

  function pick(id: string) {
    if (mode === 'explore') {
      setActive(id)
      if (!seen.includes(id)) set(`kit:${block.id}:seen`, [...seen, id])
      return
    }
    if (!target || answer?.right) return
    const right = id === target.id
    setAnswer({ id, right })
    if (right && !answer) setScore((s) => s + 1)
  }

  function nextQuestion() {
    const n = qi + 1
    setQi(n)
    setAnswer(null)
    if (n >= order.length) {
      const pct = Math.round((score / order.length) * 100)
      if (pct > best) set(`kit:${block.id}:best`, pct)
      set(`a:${block.id}`, { done: pct >= 80, score: Math.max(pct, best) })
    }
  }

  const info = PARTS.find((p) => p.id === active)
  return (
    <ActivityCard kicker="Interactive diagram" title={block.title} done={best >= 80}>
      <p className="text-sm text-ink-muted">{block.prompt}</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <svg viewBox="0 0 640 310" className="w-full rounded-[var(--radius)] border border-line" role="group" aria-label="Robot kit parts">
          <rect width="640" height="310" fill={PAPER} />
          <rect x={120} y={60} width={380} height={190} rx={26} fill="none" stroke={INK} strokeWidth={2} strokeDasharray="6 6" />
          {PARTS.map((p) => {
            const isActive = active === p.id && mode === 'explore'
            const wrong = answer && !answer.right && answer.id === p.id
            const right = answer?.right && answer.id === p.id
            return (
              <g
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={mode === 'explore' ? `${p.name}${seen.includes(p.id) ? ', seen' : ''}` : `Choose this part`}
                onClick={() => pick(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    pick(p.id)
                  }
                }}
                className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[#2f5fb3] [&:focus-visible>rect]:stroke-[5]"
              >
                <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={8} fill={p.fill} stroke={right ? '#2e9e6a' : wrong ? RED : isActive ? BLUE_INK : INK} strokeWidth={isActive || right || wrong ? 5 : 2.5} />
                {mode === 'explore' && seen.includes(p.id) ? <circle cx={p.x + p.w - 6} cy={p.y + 6} r={7} fill="#2e9e6a" stroke="#fff" strokeWidth={2} /> : null}
              </g>
            )
          })}
        </svg>
        <div className="min-h-40">
          <div className="mb-3 flex gap-1.5">
            <Pill active={mode === 'explore'} onClick={() => setMode('explore')}>
              Explore
            </Pill>
            <Pill
              active={mode === 'quiz'}
              disabled={!allSeen}
              title={allSeen ? undefined : 'Tap every part first'}
              onClick={() => {
                setMode('quiz')
                setQi(0)
                setScore(0)
                setAnswer(null)
              }}
            >
              <Target className="size-3.5" aria-hidden /> Identification challenge
            </Pill>
          </div>
          {mode === 'explore' ? (
            info ? (
              <div aria-live="polite">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{info.group}</p>
                <p className="text-lg font-semibold text-ink">{info.name}</p>
                <p className="mt-1 text-sm text-ink-muted">{info.job}</p>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Tap or press Enter on any part of the robot.</p>
            )
          ) : finished ? (
            <Feedback tone={score / order.length >= 0.8 ? 'right' : 'wrong'}>
              You found {score} of {order.length} parts first time.{' '}
              {score / order.length >= 0.8 ? 'Excellent: you know your kit!' : 'Explore again and retry: you need 8 or more.'}
            </Feedback>
          ) : target ? (
            <div aria-live="polite">
              <p className="text-xs text-ink-subtle">
                Part {qi + 1} of {order.length} · score {score}
              </p>
              <p className="mt-1 text-lg font-semibold text-ink">Find the {target.name.toLowerCase()}</p>
              {answer ? (
                <Feedback tone={answer.right ? 'right' : 'wrong'}>
                  {answer.right ? 'Found it!' : `That is the ${PARTS.find((p) => p.id === answer.id)?.name}. Try again.`}
                </Feedback>
              ) : null}
              {answer?.right ? (
                <Button size="sm" className="mt-3" onClick={nextQuestion}>
                  Next part
                </Button>
              ) : null}
            </div>
          ) : null}
          <p className="mt-3 text-xs text-ink-subtle">
            Seen {seen.filter((s) => PARTS.some((p) => p.id === s)).length} of {PARTS.length}
            {best ? ` · best challenge score ${best}%` : ''}
          </p>
        </div>
      </div>
    </ActivityCard>
  )
}

/* --------------------------------------------------------------- IR lab */

export function IrSimulator({ block }: { block: Of<'ir-sim'> }) {
  const { get, set } = useLessonState()
  const [position, setPosition] = React.useState(20)
  const [height, setHeight] = React.useState(8)
  const [threshold, setThreshold] = React.useState(50)
  const [activeLow, setActiveLow] = React.useState(true)
  const done = get<boolean>(`a:${block.id}:calibrated`, false)

  // Black tape spans 42..58 on a 0..100 strip.
  const onTape = Math.max(0, Math.min(1, 1 - Math.abs(position - 50) / 10))
  const surface = onTape > 0.5 ? 'black' : 'white'
  const heightLoss = Math.max(0, Math.min(1, (height - 4) / 30))
  const reflect = Math.round((1 - heightLoss * 0.75) * (92 - onTape * 82))
  const sees = reflect < threshold ? 'black' : 'white'
  const level = sees === 'black' ? (activeLow ? 'HIGH' : 'LOW') : activeLow ? 'LOW' : 'HIGH'

  const whiteReading = Math.round((1 - heightLoss * 0.75) * 92)
  const blackReading = Math.round((1 - heightLoss * 0.75) * 10)
  const calibrated = blackReading < threshold && whiteReading >= threshold && height <= 12

  React.useEffect(() => {
    if (calibrated && !done) {
      set(`a:${block.id}:calibrated`, true)
      set(`a:${block.id}`, { done: true, score: 100 })
    }
  }, [calibrated, done, set, block.id])

  return (
    <ActivityCard kicker="Experiment" title="IR sensor simulator" done={done || calibrated}>
      <p className="text-sm text-ink-muted">Slide the sensor across the line. Change its height and the threshold knob. Can you calibrate it so it reads correctly over both black and white?</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <svg viewBox="0 0 400 220" className="w-full rounded-[var(--radius)] border border-line" aria-hidden>
          <rect width="400" height="220" fill={PAPER} />
          <rect x={0} y={170} width={400} height={50} fill="#fff" />
          <rect x={168} y={170} width={64} height={50} fill={INK} />
          <g transform={`translate(${position * 4} ${150 - height * 3})`}>
            <rect x={-30} y={-34} width={60} height={30} rx={4} fill={BLUE} stroke={INK} strokeWidth={2} />
            <circle cx={-12} cy={-2} r={6} fill="#fff" stroke={INK} strokeWidth={2} />
            <circle cx={12} cy={-2} r={6} fill={INK} />
            <circle cx={22} cy={-26} r={4} fill={level === 'HIGH' ? '#ef4444' : '#7f1d1d'} />
            <line x1={-12} y1={4} x2={-2} y2={20 + height * 3} stroke={RED} strokeWidth={2} strokeDasharray="4 3" />
            <line x1={2} y1={20 + height * 3} x2={12} y2={4} stroke={RED} strokeWidth={Math.max(0.5, reflect / 25)} opacity={Math.max(0.15, reflect / 100)} strokeDasharray="4 3" />
          </g>
        </svg>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Readout label="Surface below" value={surface === 'black' ? 'Black tape' : 'White floor'} />
          <Readout label="Light returned" value={`${reflect}%`} />
          <Readout label="Sensor decides" value={sees === 'black' ? 'Black' : 'White'} />
          <Readout label="OUT pin" value={level} strong />
        </dl>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Slider label="Sensor position" value={position} min={0} max={100} onChange={setPosition} display={surface === 'black' ? 'over tape' : 'over floor'} />
        <Slider label="Height above floor" value={height} min={2} max={40} onChange={setHeight} display={`${height} mm`} />
        <Slider label="Threshold knob" value={threshold} min={5} max={95} onChange={setThreshold} display={`${threshold}%`} />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={!activeLow} onChange={(e) => setActiveLow(!e.target.checked)} className="size-4" />
        Reversed module (outputs LOW over black)
      </label>
      {calibrated ? (
        <Feedback tone="right">Calibrated: it reads black over the tape and white over the floor. Notice the OUT pin flips when you tick “reversed module”: that is polarity.</Feedback>
      ) : height > 12 ? (
        <Feedback tone="info">The sensor is too high: black and white now return similar amounts of light. Lower it to 5–10 mm.</Feedback>
      ) : (
        <Feedback tone="info">Hint: white returns about {whiteReading}% and black about {blackReading}%. Set the threshold between them.</Feedback>
      )}
    </ActivityCard>
  )
}

function Readout({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-[var(--radius)] bg-surface-2 px-3 py-2">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className={cn('text-ink', strong ? 'font-mono text-lg font-bold' : 'font-medium')} aria-live="polite">
        {value}
      </dd>
    </div>
  )
}

function Slider({ label, value, min, max, onChange, display, step = 1 }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; display: string; step?: number }) {
  const id = React.useId()
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <span className="font-mono text-xs text-ink-muted">{display}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--brand-500)]" />
    </div>
  )
}

/* ------------------------------------------------------------ motor lab */

const MOTOR_CHALLENGES = [
  { id: 'straight', label: 'Drive straight', test: (c: MotorCommand) => c.left > 60 && Math.abs(c.left - c.right) <= 10 },
  { id: 'left', label: 'Curve gently left', test: (c: MotorCommand) => c.right > 60 && c.left >= 0 && c.right - c.left >= 40 },
  { id: 'spin', label: 'Spin right on the spot', test: (c: MotorCommand) => c.left > 60 && c.right < -60 && Math.abs(c.left + c.right) <= 30 },
  { id: 'stop', label: 'Stop', test: (c: MotorCommand) => c.left === 0 && c.right === 0 },
] as const

export function MotorLab({ block }: { block: Of<'motor-lab'> }) {
  const { get, set } = useLessonState()
  const [cmd, setCmd] = React.useState<MotorCommand>({ left: 150, right: 150 })
  const solved = get<string[]>(`ml:${block.id}`, [])

  const path = React.useMemo(() => {
    let r = { x: 200, y: 200, heading: -Math.PI / 2 }
    const pts = [r]
    for (let i = 0; i < 90; i++) {
      r = drive(r, cmd, 1 / 45)
      pts.push(r)
    }
    return pts
  }, [cmd])
  const end = path[path.length - 1]!
  const verdict =
    cmd.left === 0 && cmd.right === 0
      ? 'Stopped'
      : Math.sign(cmd.left) !== Math.sign(cmd.right) && cmd.left !== 0 && cmd.right !== 0
        ? `Spins ${cmd.left > cmd.right ? 'right' : 'left'} on the spot`
        : Math.abs(cmd.left - cmd.right) <= 10
          ? cmd.left > 0
            ? 'Straight forward'
            : 'Straight backward'
          : cmd.left < cmd.right
            ? 'Curves left'
            : 'Curves right'

  React.useEffect(() => {
    const now = MOTOR_CHALLENGES.filter((c) => c.test(cmd) && !solved.includes(c.id)).map((c) => c.id)
    if (now.length) {
      const all = [...solved, ...now]
      set(`ml:${block.id}`, all)
      if (all.length === MOTOR_CHALLENGES.length) set(`a:${block.id}`, { done: true, score: 100 })
    }
  }, [cmd, solved, set, block.id])

  return (
    <ActivityCard kicker="Playground" title="Motor control playground" done={solved.length === MOTOR_CHALLENGES.length}>
      <p className="text-sm text-ink-muted">Set each wheel’s speed from −255 (full backward) to 255 (full forward). The path shows where the robot would go in two seconds.</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <svg viewBox="0 0 400 260" className="w-full rounded-[var(--radius)] border border-line" role="img" aria-label={`Predicted motion: ${verdict}`}>
          <rect width="400" height="260" fill={PAPER} />
          <polyline points={path.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke={BLUE_INK} strokeWidth={3} strokeDasharray="6 5" />
          <g transform={`translate(${end.x} ${end.y}) rotate(${(end.heading * 180) / Math.PI + 90})`}>
            <rect x={-18} y={-22} width={36} height={44} rx={8} fill={BLUE} stroke={INK} strokeWidth={2} />
            <rect x={-24} y={2} width={7} height={16} rx={2} fill={INK} />
            <rect x={17} y={2} width={7} height={16} rx={2} fill={INK} />
            <rect x={-12} y={-28} width={8} height={6} fill={AMBER} stroke={INK} />
            <rect x={4} y={-28} width={8} height={6} fill={AMBER} stroke={INK} />
          </g>
          <circle cx={200} cy={200} r={4} fill={INK} />
        </svg>
        <div className="space-y-4">
          <Slider label="Left motor (ENA)" value={cmd.left} min={-255} max={255} step={5} onChange={(v) => setCmd((c) => ({ ...c, left: v }))} display={String(cmd.left)} />
          <Slider label="Right motor (ENB)" value={cmd.right} min={-255} max={255} step={5} onChange={(v) => setCmd((c) => ({ ...c, right: v }))} display={String(cmd.right)} />
          <p className="rounded-[var(--radius)] bg-surface-2 px-3 py-2 text-sm" aria-live="polite">
            <span className="text-ink-subtle">The robot: </span>
            <span className="font-semibold text-ink">{verdict}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Pill onClick={() => setCmd({ left: 0, right: 0 })}>Stop</Pill>
            <Pill onClick={() => setCmd({ left: 150, right: 150 })}>Forward</Pill>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-ink">Challenges</p>
        <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
          {MOTOR_CHALLENGES.map((c) => (
            <li key={c.id} className={cn('flex items-center gap-2 rounded-[var(--radius)] border px-3 py-1.5 text-sm', solved.includes(c.id) ? 'border-[var(--success)] bg-success-bg' : 'border-line')}>
              {solved.includes(c.id) ? <Check className="size-4 text-success" aria-label="Done" /> : <Target className="size-4 text-ink-subtle" aria-hidden />}
              {c.label}
            </li>
          ))}
        </ul>
      </div>
    </ActivityCard>
  )
}

/* ------------------------------------------------------------ code block */

const KEYWORDS = new Set(['void', 'int', 'const', 'bool', 'if', 'else', 'while', 'for', 'return', 'true', 'false', 'HIGH', 'LOW', 'INPUT', 'OUTPUT', 'LED_BUILTIN'])

export function highlight(code: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|(\b\d+\b)|(\b[A-Za-z_]\w*\b)(?=\s*\()|(\b[A-Za-z_]\w*\b)/gm
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index))
    const [tok] = m
    if (m[1]) out.push(<span key={k++} className="text-slate-400 italic">{tok}</span>)
    else if (m[2]) out.push(<span key={k++} className="text-emerald-300">{tok}</span>)
    else if (m[3]) out.push(<span key={k++} className="text-amber-300">{tok}</span>)
    else if (m[4]) out.push(<span key={k++} className="text-sky-300">{tok}</span>)
    else if (KEYWORDS.has(tok)) out.push(<span key={k++} className="text-fuchsia-300">{tok}</span>)
    else out.push(tok)
    last = m.index + tok.length
  }
  out.push(code.slice(last))
  return out
}

export function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CodeView({ block }: { block: Of<'code'> }) {
  const [copied, setCopied] = React.useState(false)
  const lines = block.code.replace(/\n$/, '').split('\n')
  return (
    <figure className="overflow-hidden rounded-[var(--radius-lg)] border border-line">
      <div className="flex items-center justify-between gap-2 bg-[#111827] px-3 py-2 text-xs text-slate-300">
        <span className="font-mono">{block.download ?? block.language}</span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-white"
            onClick={() =>
              void navigator.clipboard.writeText(block.code).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
            }
          >
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copied ? 'Copied' : 'Copy'}
          </button>
          {block.download ? (
            <button type="button" className="inline-flex items-center gap-1 hover:text-white" onClick={() => downloadText(block.download!, block.code)}>
              <Download className="size-3.5" aria-hidden /> Download .ino
            </button>
          ) : null}
        </span>
      </div>
      <pre className="max-h-[32rem] overflow-auto bg-[#0f172a] py-3 text-[13px] leading-relaxed text-slate-100" tabIndex={0} aria-label="Code">
        <code className="grid grid-cols-[auto_1fr]">
          {lines.map((line, i) => (
            <React.Fragment key={i}>
              <span className="select-none px-3 text-right text-slate-500" aria-hidden>
                {i + 1}
              </span>
              <span className="pr-4 whitespace-pre">{highlight(line)}</span>
            </React.Fragment>
          ))}
        </code>
      </pre>
      {block.caption ? <figcaption className="border-t border-line bg-surface-2 px-3 py-2 text-xs text-ink-muted">{block.caption}</figcaption> : null}
    </figure>
  )
}

/* -------------------------------------------------------------- code lab */

type Task = Of<'code-lab'>['tasks'][number]

function normalise(v: string) {
  return v.trim().replace(/;$/, '').replace(/\s+/g, '').toLowerCase()
}

/** Wheel values a student filled in, read as the robot would. Educational only: not an Arduino emulator. */
function describeMotors(l: string, r: string) {
  const val = (v: string) => (v === 'BASE_SPEED' ? 150 : v === 'TURN_SPEED' ? 40 : Number(v))
  const a = val(l.trim())
  const b = val(r.trim())
  if (Number.isNaN(a) || Number.isNaN(b)) return 'cannot tell (check your values)'
  if (a === 0 && b === 0) return 'stops'
  if (Math.abs(a - b) < 10) return 'goes straight'
  return a < b ? 'turns left' : 'turns right'
}

export function CodeLab({ block }: { block: Of<'code-lab'> }) {
  const { get, set } = useLessonState()
  const saved = get<Record<string, Record<string, string>>>(`code:${block.id}`, {})
  const solved = get<string[]>(`code:${block.id}:solved`, [])
  const levels = [...new Set(block.tasks.map((t) => t.level))].sort()
  const [level, setLevel] = React.useState(levels[0] ?? 1)
  const tasks = block.tasks.filter((t) => t.level === level)

  return (
    <ActivityCard kicker="Code lab" title={block.title} done={solved.length === block.tasks.length}>
      <p className="mb-3 text-xs text-ink-subtle">
        Checks your answers and explains what the code would do. This is a teaching tool, not an Arduino emulator: upload to a real board to run your code.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Levels">
        {levels.map((l) => (
          <Pill key={l} role="tab" aria-selected={level === l} active={level === l} onClick={() => setLevel(l)}>
            Level {l}: {l === 1 ? 'Starter' : l === 2 ? 'Builder' : 'Challenge'}
          </Pill>
        ))}
      </div>
      <div className="space-y-4">
        {tasks.map((task) => (
          <CodeTaskView
            key={task.id}
            task={task}
            initial={saved[task.id] ?? {}}
            solved={solved.includes(task.id)}
            onChange={(answers) => set(`code:${block.id}`, { ...saved, [task.id]: answers })}
            onSolved={() => {
              if (!solved.includes(task.id)) {
                const all = [...solved, task.id]
                set(`code:${block.id}:solved`, all)
                set(`a:${block.id}`, { done: all.length === block.tasks.length, score: Math.round((all.length / block.tasks.length) * 100) })
              }
            }}
          />
        ))}
      </div>
    </ActivityCard>
  )
}

function CodeTaskView({
  task,
  initial,
  solved,
  onChange,
  onSolved,
}: {
  task: Task
  initial: Record<string, string>
  solved: boolean
  onChange: (a: Record<string, string>) => void
  onSolved: () => void
}) {
  const [answers, setAnswers] = React.useState<Record<string, string>>(initial)
  const [checked, setChecked] = React.useState<Record<string, boolean> | null>(null)
  const [choice, setChoice] = React.useState<string | null>(null)
  const [hints, setHints] = React.useState(false)

  const parts = task.code.split(/(\{\{\w+\}\})/g)
  const allRight = checked ? Object.values(checked).every(Boolean) : false
  const filled = task.code.replace(/\{\{(\w+)\}\}/g, (_, id: string) => answers[id] ?? '___')

  function check() {
    const result = Object.fromEntries(task.blanks.map((b) => [b.id, b.answers.some((a) => normalise(a) === normalise(answers[b.id] ?? ''))]))
    setChecked(result)
    if (Object.values(result).every(Boolean)) onSolved()
    else setHints(true)
  }

  const motorLines =
    checked && task.kind === 'complete'
      ? [...task.code.matchAll(/setMotors\(\{\{(\w+)\}\},\s*\{\{(\w+)\}\}\);\s*\/\/\s*(.*)/g)].map((m) => ({
          label: m[3]!.trim(),
          does: describeMotors(answers[m[1]!] ?? '', answers[m[2]!] ?? ''),
        }))
      : []

  return (
    <div className="rounded-[var(--radius)] border border-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-3 py-2">
        <p className="text-sm font-semibold text-ink">{task.title}</p>
        {solved || allRight ? (
          <span className="text-xs font-medium text-success">Solved</span>
        ) : (
          <span className="text-xs text-ink-subtle">{task.kind === 'predict' ? 'Predict' : task.kind === 'pins' ? 'Match the pins' : task.kind === 'condition' ? 'Fix the condition' : task.kind === 'complete' ? 'Complete the code' : 'Fill the blank'}</span>
        )}
      </div>
      <div className="px-3 py-2 text-sm text-ink-muted">{task.prompt}</div>
      <pre className="overflow-x-auto bg-[#0f172a] px-3 py-3 text-[13px] leading-relaxed text-slate-100">
        <code>
          {parts.map((part, i) => {
            const m = part.match(/^\{\{(\w+)\}\}$/)
            if (!m) return <React.Fragment key={i}>{highlight(part)}</React.Fragment>
            const blank = task.blanks.find((b) => b.id === m[1])
            if (!blank) return null
            const ok = checked?.[blank.id]
            return (
              <input
                key={i}
                aria-label={`Blank ${blank.id}`}
                value={answers[blank.id] ?? ''}
                onChange={(e) => {
                  const next = { ...answers, [blank.id]: e.target.value }
                  setAnswers(next)
                  setChecked(null)
                  onChange(next)
                }}
                spellCheck={false}
                autoCapitalize="off"
                className={cn(
                  'mx-0.5 rounded border bg-slate-800 px-1 font-mono text-[13px] text-white outline-none focus:border-sky-400',
                  ok === true ? 'border-emerald-400' : ok === false ? 'border-rose-400' : 'border-slate-500',
                )}
                style={{ width: `${(blank.width ?? 6) + 1.5}ch` }}
              />
            )
          })}
        </code>
      </pre>
      <div className="space-y-2 px-3 py-3">
        {task.kind === 'predict' && task.choices ? (
          <div className="grid gap-1.5">
            {task.choices.map((c) => (
              <Pill
                key={c.id}
                className="justify-start rounded-[var(--radius)] px-3 py-1.5 text-left font-mono text-[13px]"
                tone={choice === c.id ? (c.correct ? 'right' : 'wrong') : undefined}
                onClick={() => {
                  setChoice(c.id)
                  if (c.correct) onSolved()
                }}
              >
                {c.text}
              </Pill>
            ))}
            {choice ? (
              <Feedback tone={task.choices.find((c) => c.id === choice)?.correct ? 'right' : 'wrong'}>
                {task.choices.find((c) => c.id === choice)?.feedback}
                {task.choices.find((c) => c.id === choice)?.correct ? <p className="mt-1 text-ink-muted">{task.explanation}</p> : null}
              </Feedback>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={check} disabled={task.blanks.some((b) => !(answers[b.id] ?? '').trim() && !b.answers.includes(''))}>
              <Check /> Check
            </Button>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
              onClick={() => {
                setAnswers({})
                setChecked(null)
                onChange({})
              }}
            >
              <RotateCcw className="size-3.5" aria-hidden /> Reset
            </button>
            <button type="button" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink" onClick={() => downloadText(`${task.id}.ino`, filled)}>
              <Download className="size-3.5" aria-hidden /> Download
            </button>
            {!hints && task.blanks.some((b) => b.hint) ? (
              <button type="button" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink" onClick={() => setHints(true)}>
                <Lightbulb className="size-3.5" aria-hidden /> Hint
              </button>
            ) : null}
          </div>
        )}
        {checked && !allRight ? (
          <div role="alert" className="rounded-[var(--radius)] border border-[var(--danger)] bg-danger-bg px-3 py-2 text-sm">
            <p className="font-medium text-ink">Not yet. Look at the red blanks.</p>
            <ul className="mt-1 list-disc pl-5 text-ink-muted">
              {task.blanks
                .filter((b) => !checked[b.id])
                .map((b) => (
                  <li key={b.id}>{b.hint ?? 'Check this value against the lesson.'}</li>
                ))}
            </ul>
          </div>
        ) : hints && !checked ? (
          <Feedback tone="info">
            {task.blanks
              .filter((b) => b.hint)
              .map((b) => b.hint)
              .join(' ')}
          </Feedback>
        ) : null}
        {motorLines.length ? (
          <div className="rounded-[var(--radius)] bg-surface-2 px-3 py-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Logic check (educational simulation)</p>
            <ul className="mt-1 space-y-0.5">
              {motorLines.map((l) => (
                <li key={l.label}>
                  <span className="text-ink-muted">{l.label}:</span> the robot <span className="font-medium text-ink">{l.does}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {checked && allRight ? (
          <Feedback tone="right">
            <p>{task.explanation}</p>
            {task.expected ? (
              <>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Expected output</p>
                <pre className="mt-1 whitespace-pre-wrap rounded bg-[#0f172a] px-2 py-1.5 font-mono text-xs text-emerald-200">{task.expected}</pre>
              </>
            ) : null}
          </Feedback>
        ) : null}
      </div>
    </div>
  )
}
