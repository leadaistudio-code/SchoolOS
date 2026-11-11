/**
 * The line-follower model shared by the simulator, the code lab and the tests.
 * Pure and deterministic: the same inputs always give the same robot path.
 *
 * Reference kit: two IR modules mounted either side of a black line, an L298N
 * driving two geared DC motors. A sensor reads "on line" when it sees black.
 */

export type Side = 'left' | 'right'
export type Reading = { left: boolean; right: boolean }
export type Action = 'FORWARD' | 'LEFT' | 'RIGHT' | 'STOP'
export type MotorCommand = { left: number; right: number }

export type Algorithm = {
  /** Wheel speed for straight driving, 0..255 (PWM duty). */
  baseSpeed: number
  /** How the robot turns: slow the inner wheel, or spin it backwards. */
  turnStyle: 'gentle' | 'pivot'
  /** A deliberately broken rule set, used in the "fix the algorithm" experiment. */
  swapped?: boolean
  /** What to do when both sensors see the line. */
  bothOnLine: 'STOP' | 'FORWARD'
}

export const DEFAULT_ALGORITHM: Algorithm = { baseSpeed: 150, turnStyle: 'gentle', bothOnLine: 'STOP' }

/** The rule table every lesson teaches. A sensor "on line" means it sees black. */
export function decide(reading: Reading, algo: Pick<Algorithm, 'swapped' | 'bothOnLine'> = DEFAULT_ALGORITHM): Action {
  const { left, right } = reading
  if (!left && !right) return 'FORWARD'
  if (left && right) return algo.bothOnLine
  // The line has drifted under the left sensor: the robot has wandered right, so steer left.
  const turnLeft = left && !right
  if (algo.swapped) return turnLeft ? 'RIGHT' : 'LEFT'
  return turnLeft ? 'LEFT' : 'RIGHT'
}

export function motorsFor(action: Action, algo: Algorithm): MotorCommand {
  const s = clamp(Math.round(algo.baseSpeed), 0, 255)
  const inner = algo.turnStyle === 'pivot' ? -Math.round(s * 0.6) : Math.round(s * 0.25)
  switch (action) {
    case 'FORWARD':
      return { left: s, right: s }
    case 'LEFT':
      return { left: inner, right: s }
    case 'RIGHT':
      return { left: s, right: inner }
    case 'STOP':
      return { left: 0, right: 0 }
  }
}

/** The four rows of the truth table, in teaching order. */
export const TRUTH_TABLE: { reading: Reading; action: Action; why: string }[] = [
  { reading: { left: false, right: false }, action: 'FORWARD', why: 'The line is between the sensors. Keep going straight.' },
  { reading: { left: true, right: false }, action: 'LEFT', why: 'The left sensor sees black, so the line is curving left. Turn left to follow it.' },
  { reading: { left: false, right: true }, action: 'RIGHT', why: 'The right sensor sees black, so the line is curving right. Turn right to follow it.' },
  { reading: { left: true, right: true }, action: 'STOP', why: 'Both sensors see black: a cross line or the finish. Stop safely.' },
]

/**
 * What the Arduino pin reads for a given surface. Many IR modules pull the
 * output LOW when they see a reflection (white) and HIGH over black, but some
 * are the other way round, which is why the course calibrates first.
 */
export function pinLevel(onBlack: boolean, activeLowOnWhite = true): 'HIGH' | 'LOW' {
  if (activeLowOnWhite) return onBlack ? 'HIGH' : 'LOW'
  return onBlack ? 'LOW' : 'HIGH'
}

/* ----------------------------------------------------------------- tracks */

export type Point = { x: number; y: number }
export type Track = { id: string; name: string; points: Point[]; closed: boolean; start: { x: number; y: number; heading: number } }

export const WORLD = { width: 900, height: 560 }

function arc(cx: number, cy: number, r: number, from: number, to: number, steps: number): Point[] {
  const out: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return out
}

function sample(x0: number, x1: number, steps: number, y: (u: number) => number): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const u = i / steps
    return { x: x0 + (x1 - x0) * u, y: y(u) }
  })
}

function headingOf(points: Point[]) {
  const [a, b] = points
  return Math.atan2(b!.y - a!.y, b!.x - a!.x)
}

function track(id: string, name: string, points: Point[], closed = false): Track {
  return { id, name, points, closed, start: { x: points[0]!.x, y: points[0]!.y, heading: headingOf(points) } }
}

export const TRACKS: Track[] = [
  track('straight', 'Straight line', [
    { x: 80, y: 280 },
    { x: 820, y: 280 },
  ]),
  track('curve', 'Gentle curve', sample(80, 820, 80, (u) => 450 - 280 * Math.sin(Math.PI * u))),
  track('s-curve', 'S-curve', sample(70, 830, 160, (u) => 280 - 150 * Math.sin(3 * Math.PI * u))),
  track('sharp', 'Sharp turns', [
    { x: 80, y: 470 },
    { x: 380, y: 470 },
    { x: 380, y: 260 },
    { x: 620, y: 260 },
    { x: 620, y: 90 },
    { x: 840, y: 90 },
  ]),
  track('oval', 'Practice oval', [
    ...arc(300, 280, 190, Math.PI / 2, Math.PI * 1.5, 40),
    ...arc(600, 280, 190, -Math.PI / 2, Math.PI / 2, 40),
    { x: 300, y: 470 },
  ], true),
]

export function customTrack(points: Point[]): Track | null {
  const clean = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y) > 8)
  if (clean.length < 2) return null
  return track('custom', 'Your track', clean)
}

/** Shortest distance from a point to a polyline. */
export function distanceToTrack(p: Point, t: Track): number {
  let best = Infinity
  const pts = t.closed ? [...t.points, t.points[0]!] : t.points
  for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, distanceToSegment(p, pts[i]!, pts[i + 1]!))
  return best
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len, 0, 1)
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** How far along the track (0..1) the nearest point to p lies. */
export function progressAlong(p: Point, t: Track): number {
  const pts = t.points
  let total = 0
  const lengths: number[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y)
    lengths.push(l)
    total += l
  }
  let best = Infinity
  let at = 0
  let run = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = dx * dx + dy * dy
    const u = len === 0 ? 0 : clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len, 0, 1)
    const d = Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy))
    if (d < best) {
      best = d
      at = run + u * lengths[i]!
    }
    run += lengths[i]!
  }
  return total ? at / total : 0
}

/* ---------------------------------------------------------------- physics */

/** vl/vr: actual wheel speeds (world units/s). Motors take time to reach a new command. */
export type Robot = { x: number; y: number; heading: number; vl?: number; vr?: number }

export type SimSettings = {
  algorithm: Algorithm
  /** Width of the black line, in world units (1 unit ≈ 1 mm). */
  lineWidth: number
  /** Gap between the two sensors' centres. Wider than the line, so both read white on a straight. */
  sensorSpacing: number
  /** How far ahead of the axle the sensors sit. */
  sensorReach: number
  /** 0..1. Higher is more sensitive: a sensor needs less of its spot over black to trigger. */
  sensitivity: number
}

export const DEFAULT_SETTINGS: SimSettings = {
  algorithm: DEFAULT_ALGORITHM,
  lineWidth: 22,
  sensorSpacing: 30,
  sensorReach: 34,
  sensitivity: 0.5,
}

export const WHEEL_BASE = 56
/** World units (mm) per second at full PWM: about what yellow BO motors manage on 7.4 V. */
const TOP_SPEED = 520
const SPOT_RADIUS = 7

export function sensorPositions(robot: Robot, s: Pick<SimSettings, 'sensorSpacing' | 'sensorReach'>): Record<Side, Point> {
  const cos = Math.cos(robot.heading)
  const sin = Math.sin(robot.heading)
  const ahead = { x: robot.x + cos * s.sensorReach, y: robot.y + sin * s.sensorReach }
  const half = s.sensorSpacing / 2
  // Left of the direction of travel is (sin, -cos) in screen coordinates (y down).
  return {
    left: { x: ahead.x + sin * half, y: ahead.y - cos * half },
    right: { x: ahead.x - sin * half, y: ahead.y + cos * half },
  }
}

/**
 * Fraction of a sensor's circular spot that lies over the line, approximated by
 * the overlap of the spot with a band of the line's width.
 */
export function blackCoverage(p: Point, t: Track, lineWidth: number): number {
  const d = distanceToTrack(p, t)
  const edge = lineWidth / 2
  if (d <= edge - SPOT_RADIUS) return 1
  if (d >= edge + SPOT_RADIUS) return 0
  return clamp((edge + SPOT_RADIUS - d) / (2 * SPOT_RADIUS), 0, 1)
}

export function readSensors(robot: Robot, t: Track, s: SimSettings): { reading: Reading; coverage: Record<Side, number> } {
  const pos = sensorPositions(robot, s)
  const threshold = 1 - clamp(s.sensitivity, 0.05, 0.95)
  const left = blackCoverage(pos.left, t, s.lineWidth)
  const right = blackCoverage(pos.right, t, s.lineWidth)
  return { reading: { left: left >= threshold, right: right >= threshold }, coverage: { left, right } }
}

/** Seconds for a motor to cover most of the way to a new speed. */
const MOTOR_LAG = 0.15

/** Differential drive: integrate one time step. */
export function drive(robot: Robot, cmd: MotorCommand, dt: number): Robot {
  const targetL = (cmd.left / 255) * TOP_SPEED
  const targetR = (cmd.right / 255) * TOP_SPEED
  const k = Math.min(1, dt / MOTOR_LAG)
  const vl = robot.vl === undefined ? targetL : robot.vl + (targetL - robot.vl) * k
  const vr = robot.vr === undefined ? targetR : robot.vr + (targetR - robot.vr) * k
  const v = (vl + vr) / 2
  const w = (vr - vl) / WHEEL_BASE
  // Screen y points down, so a positive turn rate (right wheel faster) turns left: subtract.
  const heading = robot.heading - w * dt
  return {
    x: robot.x + Math.cos(heading) * v * dt,
    y: robot.y + Math.sin(heading) * v * dt,
    heading,
    vl,
    vr,
  }
}

export type StepResult = {
  robot: Robot
  reading: Reading
  coverage: Record<Side, number>
  action: Action
  motors: MotorCommand
}

export function step(robot: Robot, t: Track, s: SimSettings, dt: number): StepResult {
  const { reading, coverage } = readSensors(robot, t, s)
  const action = decide(reading, s.algorithm)
  const motors = motorsFor(action, s.algorithm)
  return { robot: drive(robot, motors, dt), reading, coverage, action, motors }
}

export type RunOutcome = {
  status: 'finished' | 'lost' | 'stopped' | 'timeout'
  seconds: number
  progress: number
  maxOffset: number
}

/**
 * Runs a whole attempt headlessly at a fixed step. Used for the results panel,
 * the experiments and the tests.
 */
export function simulate(t: Track, s: SimSettings, maxSeconds = 40, dt = 1 / 60): RunOutcome {
  let robot: Robot = { ...t.start }
  let maxOffset = 0
  let progress = 0
  let stoppedFor = 0
  for (let i = 0; i * dt < maxSeconds; i++) {
    const r = step(robot, t, s, dt)
    robot = r.robot
    const offset = distanceToTrack(robot, t)
    maxOffset = Math.max(maxOffset, offset)
    progress = Math.max(progress, progressAlong(robot, t))
    const outcome = judge(robot, t, progress, offset, r.action)
    stoppedFor = r.action === 'STOP' ? stoppedFor + dt : 0
    if (outcome) return { status: outcome, seconds: round(i * dt), progress: round(progress), maxOffset: round(maxOffset) }
    if (stoppedFor > 1.5) return { status: 'stopped', seconds: round(i * dt), progress: round(progress), maxOffset: round(maxOffset) }
  }
  return { status: 'timeout', seconds: maxSeconds, progress: round(progress), maxOffset: round(maxOffset) }
}

/** Finished at the end of an open track, lost when far from the line or off the mat. */
export function judge(robot: Robot, t: Track, progress: number, offset: number, action: Action): 'finished' | 'lost' | null {
  const off = robot.x < -20 || robot.y < -20 || robot.x > WORLD.width + 20 || robot.y > WORLD.height + 20
  if (off || offset > 70) return 'lost'
  if (!t.closed && progress > 0.97) return 'finished'
  if (t.closed && progress > 0.97 && action !== 'STOP') return 'finished'
  return null
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

function round(v: number) {
  return Math.round(v * 100) / 100
}
