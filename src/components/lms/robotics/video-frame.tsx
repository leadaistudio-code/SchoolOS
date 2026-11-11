import * as React from 'react'
import {
  DEFAULT_SETTINGS,
  TRACKS,
  TRUTH_TABLE,
  WORLD,
  distanceToTrack,
  judge,
  progressAlong,
  sensorPositions,
  step,
  type Robot,
  type SimSettings,
  type StepResult,
} from '@/lib/lms/robot'
import { INTRO_SECONDS, OUTRO_SECONDS, timeline, type TimedScene, type VideoDef } from '@/lib/lms/robotics101/videos'
import { AMBER, BLUE, BLUE_INK, Diagram, GREEN, INK, PAPER, RED } from './diagrams'

/**
 * One frame of a Robotics 101 video at time `t` (seconds). Pure: the same
 * inputs always draw the same picture, which is what lets the renderer
 * capture frames one by one. Inline styles only, because the renderer page
 * has no Tailwind.
 */

export const FRAME = { width: 1280, height: 720 }
const SAFE = 48
const FONT = "'Manrope', 'Segoe UI', system-ui, sans-serif"
const MONO = "'Cascadia Mono', Consolas, 'Courier New', monospace"

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const ease = (v: number) => {
  const x = clamp01(v)
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2
}

export function VideoFrame({ video, t, logoDark, logoLight }: { video: VideoDef; t: number; logoDark: string; logoLight: string }) {
  const tl = React.useMemo(() => timeline(video), [video])
  const box: React.CSSProperties = {
    position: 'relative',
    width: FRAME.width,
    height: FRAME.height,
    overflow: 'hidden',
    background: PAPER,
    fontFamily: FONT,
    color: INK,
  }
  if (t < INTRO_SECONDS) return <div style={box}><Intro video={video} t={t} logo={logoLight} /></div>
  if (t >= tl.duration - OUTRO_SECONDS) return <div style={box}><Outro video={video} t={t - (tl.duration - OUTRO_SECONDS)} logo={logoLight} /></div>

  const scene = tl.scenes.find((s) => t >= s.start && t < s.end) ?? tl.scenes.at(-1)!
  const local = t - scene.start
  const length = scene.end - scene.start
  const enter = ease(local / 0.5)
  const leave = 1 - ease((local - (length - 0.35)) / 0.35)
  const chapter = [...tl.chapters].reverse().find((c) => c.at <= t)

  return (
    <div style={box}>
      <div style={{ position: 'absolute', left: SAFE, top: SAFE - 8, fontSize: 15, fontWeight: 700, letterSpacing: 2.2, textTransform: 'uppercase', color: 'rgba(11,11,13,0.55)' }}>
        Robotics 101 · Video {video.number}
        {chapter && chapter.at > 0 ? <span style={{ color: BLUE_INK }}> · {chapter.title}</span> : null}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoDark} alt="" style={{ position: 'absolute', right: SAFE, top: SAFE - 14, height: 34, width: 'auto', opacity: 0.92 }} />
      <div style={{ position: 'absolute', inset: `${SAFE + 30}px ${SAFE}px ${SAFE + 6}px`, opacity: enter * leave, transform: `translateY(${(1 - enter) * 18}px)` }}>
        <SceneView scene={scene} local={local} length={length} />
      </div>
      <div style={{ position: 'absolute', left: 0, bottom: 0, height: 5, width: `${(t / tl.duration) * 100}%`, background: AMBER }} />
    </div>
  )
}

function Intro({ video, t, logo }: { video: VideoDef; t: number; logo: string }) {
  const a = ease(t / 1.1)
  const b = ease((t - 0.9) / 0.8)
  const c = ease((t - 1.6) / 0.8)
  const out = 1 - ease((t - (INTRO_SECONDS - 0.45)) / 0.45)
  return (
    <div style={{ position: 'absolute', inset: 0, background: INK, color: 'white', opacity: out }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${a * 38}%`, background: '#16161a' }} />
      <div style={{ position: 'absolute', left: 140, top: 190 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" style={{ height: 64, width: 'auto', opacity: a, transform: `translateY(${(1 - a) * 20}px)` }} />
        <div style={{ marginTop: 22, fontSize: 22, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: AMBER, opacity: b }}>MyCampusView Academy</div>
        <div style={{ marginTop: 34, fontSize: 20, color: 'rgba(255,255,255,0.65)', opacity: c }}>Robotics 101 · Video {video.number}</div>
        <div style={{ marginTop: 8, fontSize: 52, fontWeight: 800, letterSpacing: -1, maxWidth: 1000, lineHeight: 1.08, opacity: c, transform: `translateX(${(1 - c) * -30}px)` }}>{video.title}</div>
        <div style={{ marginTop: 28, height: 6, width: 220 * c, background: AMBER, borderRadius: 3 }} />
      </div>
    </div>
  )
}

function Outro({ video, t, logo }: { video: VideoDef; t: number; logo: string }) {
  const a = ease(t / 0.6)
  return (
    <div style={{ position: 'absolute', inset: 0, background: INK, color: 'white', opacity: a }}>
      <div style={{ position: 'absolute', left: 120, top: 110, right: 120 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: AMBER }}>What you learned</div>
        {video.summary.map((s, i) => {
          const r = ease((t - 0.4 - i * 0.45) / 0.5)
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 22, fontSize: 32, fontWeight: 600, opacity: r, transform: `translateX(${(1 - r) * 24}px)` }}>
              <span style={{ width: 14, height: 14, borderRadius: 7, background: AMBER, flex: 'none' }} />
              {s}
            </div>
          )
        })}
        <div style={{ marginTop: 46, fontSize: 24, color: 'rgba(255,255,255,0.75)', opacity: ease((t - 2.2) / 0.6) }}>
          <span style={{ color: 'white', fontWeight: 700 }}>Next: </span>
          {video.next}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 120, right: 120, bottom: 70, display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: ease((t - 1) / 0.8) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" style={{ height: 44, width: 'auto' }} />
        <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }}>academy.mycampusview.com</span>
      </div>
    </div>
  )
}

function Heading({ children, kicker }: { children: React.ReactNode; kicker?: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      {kicker ? <div style={{ fontSize: 18, fontWeight: 700, color: BLUE_INK, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>{kicker}</div> : null}
      <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -0.8, lineHeight: 1.1 }}>{children}</div>
    </div>
  )
}

/** Reveal times for n items across the first 70% of a scene. */
const revealAt = (i: number, n: number, length: number) => 0.4 + (i * (length * 0.7)) / Math.max(1, n)

function SceneView({ scene, local, length }: { scene: TimedScene; local: number; length: number }) {
  switch (scene.kind) {
    case 'title': {
      const a = ease((local - 0.2) / 0.8)
      return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 40 }}>
          {scene.kicker ? <div style={{ fontSize: 22, fontWeight: 700, color: BLUE_INK, letterSpacing: 3, textTransform: 'uppercase' }}>{scene.kicker}</div> : null}
          <div style={{ marginTop: 14, fontSize: 70, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1.04, maxWidth: 1000 }}>{scene.title}</div>
          <div style={{ marginTop: 30, height: 8, width: 260 * a, background: AMBER, borderRadius: 4 }} />
        </div>
      )
    }
    case 'points':
    case 'steps': {
      const numbered = scene.kind === 'steps'
      const active = scene.items.reduce((acc, _, i) => (local >= revealAt(i, scene.items.length, length) ? i : acc), -1)
      return (
        <div style={{ height: '100%', display: 'grid', gridTemplateColumns: scene.diagram ? '1fr 1fr' : '1fr', gap: 40, alignItems: 'center' }}>
          <div>
            <Heading>{scene.title}</Heading>
            {scene.items.map((item, i) => {
              const r = ease((local - revealAt(i, scene.items.length, length)) / 0.45)
              const on = i === active
              return (
                <div
                  key={item}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 18,
                    marginTop: 14,
                    padding: '14px 18px',
                    borderRadius: 14,
                    background: on ? 'white' : 'transparent',
                    boxShadow: on ? '0 6px 20px rgba(11,11,13,0.08)' : 'none',
                    fontSize: scene.items.length > 4 ? 27 : 31,
                    fontWeight: 600,
                    opacity: r * (on || active < 0 ? 1 : 0.62),
                    transform: `translateX(${(1 - r) * 30}px)`,
                  }}
                >
                  {numbered ? (
                    <span style={{ flex: 'none', width: 42, height: 42, borderRadius: 21, background: on ? AMBER : INK, color: on ? INK : 'white', display: 'grid', placeItems: 'center', fontSize: 21, fontWeight: 800 }}>{i + 1}</span>
                  ) : (
                    <span style={{ flex: 'none', width: 14, height: 14, borderRadius: 7, background: on ? AMBER : BLUE_INK }} />
                  )}
                  {item}
                </div>
              )
            })}
          </div>
          {scene.diagram ? (
            <div style={{ background: 'white', borderRadius: 20, padding: 12, boxShadow: '0 10px 30px rgba(11,11,13,0.08)' }}>
              <Diagram name={scene.diagram} step={99} />
            </div>
          ) : null}
        </div>
      )
    }
    case 'diagram': {
      const stepAt = (k: number) => 0.3 + ((k - 1) * (length * 0.72)) / Math.max(1, scene.steps)
      let shown = 0
      for (let k = 1; k <= scene.steps; k++) if (local >= stepAt(k)) shown = k
      const z = scene.zoom ? ease((local - length * 0.35) / (length * 0.5)) : 0
      const scale = scene.zoom ? 1 + (scene.zoom.scale - 1) * z : 1 + 0.03 * clamp01(local / length)
      const ox = scene.zoom ? (scene.zoom.x / 640) * 100 : 50
      const oy = scene.zoom ? (scene.zoom.y / 360) * 100 : 50
      return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Heading>{scene.title}</Heading>
          <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center' }}>
            <div style={{ width: 920, borderRadius: 22, overflow: 'hidden', background: 'white', boxShadow: '0 12px 34px rgba(11,11,13,0.08)' }}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: `${ox}% ${oy}%` }}>
                <Diagram name={scene.diagram} step={shown >= scene.steps && scene.diagram === 'h-bridge' ? scene.steps : shown} />
              </div>
            </div>
          </div>
        </div>
      )
    }
    case 'code':
      return <CodeScene title={scene.title} code={scene.code} highlight={scene.highlight} local={local} length={length} />
    case 'serial': {
      const per = (length * 0.75) / scene.lines.length
      const shown = Math.min(scene.lines.length, Math.floor((local - 0.3) / per) + 1)
      return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Heading kicker="Serial Monitor · 9600 baud">{scene.title}</Heading>
          <div style={{ flex: 1, background: '#101114', borderRadius: 18, padding: '26px 30px', fontFamily: MONO, fontSize: 30, color: '#d6f5df', lineHeight: 1.55 }}>
            {scene.lines.slice(0, Math.max(0, shown)).map((l, i) => (
              <div key={i}>{colourSerial(l)}</div>
            ))}
            <span style={{ display: 'inline-block', width: 16, height: 30, background: Math.floor(local * 2) % 2 ? '#d6f5df' : 'transparent', verticalAlign: 'middle' }} />
          </div>
        </div>
      )
    }
    case 'parts':
      return (
        <div style={{ height: '100%' }}>
          <Heading>{scene.title}</Heading>
          <div style={{ display: 'grid', gridTemplateColumns: scene.items.length > 2 ? '1fr 1fr' : '1fr', gap: 18 }}>
            {scene.items.map((p, i) => {
              const r = ease((local - revealAt(i, scene.items.length, length)) / 0.5)
              return (
                <div key={p.name} style={{ background: 'white', borderRadius: 18, padding: '22px 26px', boxShadow: '0 8px 24px rgba(11,11,13,0.07)', borderLeft: `8px solid ${i % 2 ? BLUE_INK : AMBER}`, opacity: r, transform: `translateY(${(1 - r) * 20}px)` }}>
                  <div style={{ fontSize: 32, fontWeight: 800 }}>{p.name}</div>
                  <div style={{ marginTop: 6, fontSize: 25, color: 'rgba(11,11,13,0.7)' }}>{p.job}</div>
                </div>
              )
            })}
          </div>
        </div>
      )
    case 'truth': {
      const rows = TRUTH_TABLE
      const active = Math.min(rows.length - 1, Math.floor(((local - 0.4) / (length * 0.85)) * rows.length))
      const cell: React.CSSProperties = { padding: '14px 18px', fontSize: 27, fontWeight: 600 }
      const dot = (black: boolean) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 22, height: 22, borderRadius: 11, background: black ? INK : 'white', border: `3px solid ${INK}` }} />
          {black ? 'Black' : 'White'}
        </span>
      )
      return (
        <div style={{ height: '100%' }}>
          <Heading>{scene.title}</Heading>
          <div style={{ background: 'white', borderRadius: 18, overflow: 'hidden', boxShadow: '0 10px 30px rgba(11,11,13,0.08)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: INK, color: 'white' }}>
              {['Left sensor', 'Right sensor', 'Robot does'].map((h) => <div key={h} style={{ ...cell, fontSize: 22, fontWeight: 700 }}>{h}</div>)}
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: i === active ? '#fdf3e3' : 'white', borderTop: '1px solid #e7e5df', opacity: i <= active ? 1 : 0.35 }}>
                <div style={cell}>{dot(r.reading.left)}</div>
                <div style={cell}>{dot(r.reading.right)}</div>
                <div style={{ ...cell, fontWeight: 800, color: r.action === 'STOP' ? RED : r.action === 'FORWARD' ? GREEN : BLUE_INK }}>{ACTION_LABEL[r.action]}</div>
              </div>
            ))}
          </div>
        </div>
      )
    }
    case 'sim':
      return <SimScene scene={scene} local={local} />
  }
}

const ACTION_LABEL = { FORWARD: 'Go straight', LEFT: 'Turn left', RIGHT: 'Turn right', STOP: 'Stop' } as const

function colourSerial(line: string) {
  return line.split(/(BLACK|WHITE)/).map((part, i) =>
    part === 'BLACK' ? <b key={i} style={{ color: AMBER }}>{part}</b> : part === 'WHITE' ? <b key={i} style={{ color: 'white' }}>{part}</b> : <span key={i}>{part}</span>,
  )
}

const KEYWORDS = /\b(void|int|bool|const|if|else|return|true|false|HIGH|LOW|INPUT|OUTPUT)\b/g
const FUNCS = /\b(pinMode|digitalWrite|digitalRead|analogWrite|delay|Serial|print|println|begin|setMotors|driveOne|constrain|abs|setup|loop)\b/g

function codeLine(text: string) {
  const comment = text.indexOf('//')
  const body = comment >= 0 ? text.slice(0, comment) : text
  const tail = comment >= 0 ? text.slice(comment) : ''
  const parts: React.ReactNode[] = []
  const tokens = body.split(/("[^"]*")/)
  tokens.forEach((tok, i) => {
    if (tok.startsWith('"')) {
      parts.push(<span key={`s${i}`} style={{ color: '#f2c27a' }}>{tok}</span>)
      return
    }
    const html = tok
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(KEYWORDS, '\u0001k$1\u0002')
      .replace(FUNCS, '\u0001f$1\u0002')
      .replace(/\b(\d+)\b/g, '\u0001n$1\u0002')
    html.split(/(\u0001[kfn][^\u0002]*\u0002)/).forEach((seg, j) => {
      if (seg.startsWith('\u0001')) {
        const kind = seg[1]
        const word = seg.slice(2, -1)
        parts.push(<span key={`${i}-${j}`} style={{ color: kind === 'k' ? '#8fb6ff' : kind === 'f' ? '#7fdcb4' : '#f5a97f' }}>{word}</span>)
      } else if (seg) {
        parts.push(<span key={`${i}-${j}`} dangerouslySetInnerHTML={{ __html: seg }} />)
      }
    })
  })
  if (tail) parts.push(<span key="c" style={{ color: '#8a8f98', fontStyle: 'italic' }}>{tail}</span>)
  return parts
}

function CodeScene({ title, code, highlight, local, length }: { title: string; code: string; highlight: [number, number][]; local: number; length: number }) {
  const lines = code.split('\n')
  const idx = Math.min(highlight.length - 1, Math.max(0, Math.floor(((local - 0.6) / (length * 0.85)) * highlight.length)))
  const [from, to] = local < 0.6 ? [0, 0] : highlight[idx]!
  const size = lines.length > 11 ? 21 : lines.length > 7 ? 25 : 29
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Heading kicker="Arduino code">{title}</Heading>
      <div style={{ flex: 1, minHeight: 0, background: '#101114', borderRadius: 18, padding: '20px 0', fontFamily: MONO, fontSize: size, lineHeight: 1.5, color: '#e9e9ee', overflow: 'hidden' }}>
        {lines.map((l, i) => {
          const n = i + 1
          const on = n >= from && n <= to
          return (
            <div key={i} style={{ display: 'flex', background: on ? 'rgba(240,166,60,0.18)' : 'transparent', borderLeft: `6px solid ${on ? AMBER : 'transparent'}`, opacity: from && !on ? 0.5 : 1, whiteSpace: 'pre' }}>
              <span style={{ width: 64, textAlign: 'right', paddingRight: 22, color: '#5d626b', flex: 'none' }}>{n}</span>
              <span>{codeLine(l)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- simulator */

const SIM_DT = 1 / 120
type SimOutcome = { status: 'finished' | 'lost' | 'stopped'; seconds: number } | null
const simCache = new Map<string, { states: StepResult[]; trail: Robot[]; outcome: SimOutcome }>()

/** The whole run, stepped once with the same model as the learners' simulator. Closed tracks keep lapping. */
function simRun(scene: Extract<TimedScene, { kind: 'sim' }>, seconds: number) {
  const key = JSON.stringify([scene.track, scene.algorithm, scene.settings, Math.ceil(seconds)])
  const hit = simCache.get(key)
  if (hit) return hit
  const track = TRACKS.find((t) => t.id === scene.track) ?? TRACKS[0]!
  const settings: SimSettings = { ...DEFAULT_SETTINGS, ...scene.settings, algorithm: { ...DEFAULT_SETTINGS.algorithm, ...scene.algorithm } }
  let robot: Robot = { ...track.start }
  const states: StepResult[] = []
  const trail: Robot[] = []
  let outcome: SimOutcome = null
  let progress = 0
  let stoppedFor = 0
  let lostAt = -1
  const steps = Math.ceil(seconds / SIM_DT)
  for (let i = 0; i <= steps; i++) {
    const r = step(robot, track, settings, SIM_DT)
    states.push({ ...r, robot })
    trail.push(robot)
    progress = Math.max(progress, progressAlong(robot, track))
    stoppedFor = r.action === 'STOP' ? stoppedFor + SIM_DT : 0
    const verdict = judge(robot, track, progress, distanceToTrack(robot, track), r.action)
    if (verdict === 'lost' && lostAt < 0) lostAt = i
    if (lostAt >= 0 && i - lostAt > 0.8 / SIM_DT) {
      outcome = { status: 'lost', seconds: lostAt * SIM_DT }
      break
    }
    if (verdict === 'finished' && !track.closed) {
      outcome = { status: 'finished', seconds: i * SIM_DT }
      break
    }
    if (stoppedFor > 0.6) {
      outcome = { status: 'stopped', seconds: i * SIM_DT }
      break
    }
    robot = r.robot
  }
  const run = { states, trail, outcome }
  simCache.set(key, run)
  return run
}

/** How a video's simulator scene ends, for checking that the narration matches the picture. */
export function simSceneOutcome(scene: Extract<TimedScene, { kind: 'sim' }>) {
  return simRun(scene, scene.end - scene.start - 0.5).outcome?.status ?? 'running'
}

function SimScene({ scene, local }: { scene: Extract<TimedScene, { kind: 'sim' }>; local: number }) {
  const track = TRACKS.find((t) => t.id === scene.track) ?? TRACKS[0]!
  const settings: SimSettings = { ...DEFAULT_SETTINGS, ...scene.settings, algorithm: { ...DEFAULT_SETTINGS.algorithm, ...scene.algorithm } }
  const run = simRun(scene, scene.end - scene.start)
  const i = Math.min(run.states.length - 1, Math.max(0, Math.floor((local - 0.5) / SIM_DT)))
  const ended = i === run.states.length - 1
  const s = run.states[i]!
  const robot = s.robot
  const sensors = sensorPositions(robot, settings)
  const pts = track.points.map((p) => `${p.x},${p.y}`).join(' ')
  const trail = run.trail.slice(0, i + 1).filter((_, k) => k % 4 === 0).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const deg = (robot.heading * 180) / Math.PI
  const row = (label: string, value: React.ReactNode, tone?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderTop: '1px solid #ecebe6' }}>
      <span style={{ fontSize: 21, color: 'rgba(11,11,13,0.6)' }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 800, color: tone ?? INK }}>{value}</span>
    </div>
  )
  const surface = (b: boolean) => (b ? 'Black' : 'White')
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Heading kicker="Simulator">{scene.title}</Heading>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>
        <div style={{ background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 10px 30px rgba(11,11,13,0.08)' }}>
          <svg viewBox={`0 0 ${WORLD.width} ${WORLD.height}`} style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="xMidYMid meet">
            <rect width={WORLD.width} height={WORLD.height} fill="#fbfaf7" />
            <polyline points={pts + (track.closed ? ` ${track.points[0]!.x},${track.points[0]!.y}` : '')} fill="none" stroke={INK} strokeWidth={settings.lineWidth} strokeLinejoin="round" strokeLinecap="butt" />
            <polyline points={trail} fill="none" stroke={AMBER} strokeWidth={4} strokeOpacity={0.75} strokeLinejoin="round" />
            <g transform={`translate(${robot.x} ${robot.y}) rotate(${deg})`}>
              <rect x={-34} y={-30} width={58} height={60} rx={12} fill={BLUE} stroke={BLUE_INK} strokeWidth={3} />
              <rect x={-26} y={-40} width={30} height={12} rx={4} fill={INK} />
              <rect x={-26} y={28} width={30} height={12} rx={4} fill={INK} />
              <rect x={14} y={-18} width={18} height={36} rx={4} fill="#3b6fd0" opacity={0.85} />
            </g>
            {(['left', 'right'] as const).map((side) => (
              <circle key={side} cx={sensors[side].x} cy={sensors[side].y} r={9} fill={s.reading[side] ? AMBER : GREEN} stroke={INK} strokeWidth={2.5} />
            ))}
            {ended && run.outcome ? (
              <g transform={`translate(${WORLD.width / 2} 48)`} opacity={ease((local - 0.5 - run.outcome.seconds) / 0.4)}>
                <rect x={-190} y={-30} width={380} height={60} rx={30} fill={run.outcome.status === 'finished' ? GREEN : RED} />
                <text textAnchor="middle" y={11} fontSize={30} fontWeight={800} fill="white" fontFamily={FONT}>
                  {run.outcome.status === 'finished' ? `Finished in ${run.outcome.seconds.toFixed(1)} s` : run.outcome.status === 'lost' ? 'Lost the line' : 'Stopped: both see black'}
                </text>
              </g>
            ) : null}
          </svg>
        </div>
        <div style={{ background: 'white', borderRadius: 20, padding: '18px 22px', boxShadow: '0 10px 30px rgba(11,11,13,0.08)' }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: BLUE_INK, marginBottom: 6 }}>Decision panel</div>
          {row('Left sensor', surface(s.reading.left), s.reading.left ? '#a4501a' : GREEN)}
          {row('Right sensor', surface(s.reading.right), s.reading.right ? '#a4501a' : GREEN)}
          {row('Decision', ACTION_LABEL[s.action], s.action === 'STOP' ? RED : s.action === 'FORWARD' ? GREEN : BLUE_INK)}
          {row('Left motor', s.motors.left)}
          {row('Right motor', s.motors.right)}
          {row('Speed', settings.algorithm.baseSpeed)}
        </div>
      </div>
    </div>
  )
}

export { OUTRO_SECONDS }
