import * as React from 'react'
import { AI_DIAGRAM_PARTS, AI_DIAGRAM_TITLES, type AiDiagramName } from './ai-diagrams'
import { AMBER, Arrow, BLUE, BLUE_INK, GREEN, INK, Label, MUTED, PAPER, RED, show, type Part } from './diagram-kit'

/**
 * Robotics 101 diagrams. Plain SVG with no app dependencies, so the lesson
 * pages, the printable resources and the video renderer all draw the same art.
 * Flat, front-on, ink outlines with pale-blue fills, matching the Academy
 * illustrations.
 */

export { AMBER, BLUE, BLUE_INK, GREEN, INK, PAPER, RED } from './diagram-kit'

export type DiagramName =
  | 'sense-think-act'
  | 'ir-reflect'
  | 'differential'
  | 'pin-map'
  | 'wiring'
  | 'h-bridge'
  | 'chassis'
  | 'pwm'
  | 'flowchart'
  | 'loop'
  | AiDiagramName

const TITLES: Record<DiagramName, string> = {
  ...AI_DIAGRAM_TITLES,
  'sense-think-act': 'The Sense, Think, Act loop: IR sensors sense, the Arduino thinks, the motors act, then the loop repeats.',
  'ir-reflect': 'An IR sensor over white floor and over black tape. White reflects the infrared light back to the receiver; black absorbs it.',
  differential: 'Three robots seen from above: equal wheel speeds go straight, a slower left wheel curves left, opposite directions spin on the spot.',
  'pin-map': 'Pin map: left IR to D2, right IR to D3, ENA to D5, ENB to D6, IN1 to D8, IN2 to D9, IN3 to D10, IN4 to D11.',
  wiring:
    'Wiring diagram: the battery feeds the L298N; the L298N drives the left motor on OUT1 and OUT2 and the right motor on OUT3 and OUT4; the Arduino connects to the L298N control pins and both IR sensors; all grounds are joined.',
  'h-bridge': 'An H-bridge: four switches around a motor. Closing one diagonal pair sends current one way; the other pair reverses it.',
  chassis: 'Top view of the line-follower: two IR sensors at the front either side of the line, Arduino and motor driver in the middle, battery and two wheels at the back, castor at the front.',
  pwm: 'PWM signals: the pin switches on and off very fast. 25 percent on-time gives slow speed, 50 percent medium, 100 percent full speed.',
  flowchart: 'Flowchart: read both sensors. If neither sees the line, go forward. If only the left does, turn left. If only the right does, turn right. If both do, stop. Then repeat.',
  loop: 'setup runs once at power on, then loop runs again and again forever.',
}

export function Diagram({ name, className, step }: { name: DiagramName; className?: string; step?: number }) {
  const Comp = DIAGRAMS[name]
  return (
    <svg viewBox="0 0 640 360" role="img" aria-label={TITLES[name]} className={className} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <title>{TITLES[name]}</title>
      <rect width="640" height="360" fill={PAPER} rx="0" />
      <Comp step={step ?? 99} />
    </svg>
  )
}

export function diagramDescription(name: DiagramName) {
  return TITLES[name]
}

/* ------------------------------------------------------------ components */

export function RobotTop({ x, y, scale = 1, heading = 0, line = false }: { x: number; y: number; scale?: number; heading?: number; line?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${heading}) scale(${scale})`}>
      {line ? <rect x={-12} y={-90} width={24} height={180} fill={INK} /> : null}
      {/* wheels */}
      <rect x={-50} y={10} width={14} height={34} rx={4} fill={INK} />
      <rect x={36} y={10} width={14} height={34} rx={4} fill={INK} />
      {/* body */}
      <rect x={-36} y={-46} width={72} height={96} rx={14} fill={BLUE} stroke={INK} strokeWidth={2.5} />
      {/* board */}
      <rect x={-20} y={-14} width={40} height={30} rx={3} fill="#fff" stroke={INK} strokeWidth={2} />
      {/* sensors */}
      <rect x={-26} y={-58} width={14} height={12} rx={2} fill={AMBER} stroke={INK} strokeWidth={2} />
      <rect x={12} y={-58} width={14} height={12} rx={2} fill={AMBER} stroke={INK} strokeWidth={2} />
    </g>
  )
}

function SenseThinkAct({ step }: Part) {
  const boxes = [
    { x: 40, label: 'SENSE', sub: 'IR sensors look at the floor', color: AMBER, at: 1 },
    { x: 240, label: 'THINK', sub: 'Arduino runs your rules', color: BLUE, at: 2 },
    { x: 440, label: 'ACT', sub: 'Motors turn the wheels', color: '#cfe8da', at: 3 },
  ]
  return (
    <g>
      {boxes.map((b) => (
        <g key={b.label} style={show(step, b.at)}>
          <rect x={b.x} y={95} width={160} height={120} rx={18} fill={b.color} stroke={INK} strokeWidth={2.5} />
          <Label x={b.x + 80} y={148} size={24} weight={800}>
            {b.label}
          </Label>
          <Label x={b.x + 80} y={180} size={13} weight={500} fill={MUTED}>
            {b.sub}
          </Label>
        </g>
      ))}
      <g style={show(step, 2)}>
        <Arrow d="M204,155 L234,155" />
      </g>
      <g style={show(step, 3)}>
        <Arrow d="M404,155 L434,155" />
      </g>
      <g style={show(step, 4)}>
        <Arrow d="M520,222 C520,320 120,320 120,222" color={BLUE_INK} dashed />
        <Label x={320} y={318} size={14} fill={BLUE_INK}>
          …and repeat, thousands of times a second
        </Label>
      </g>
      <Label x={320} y={56} size={20} weight={800}>
        Every robot repeats three steps
      </Label>
    </g>
  )
}

function SensorUnit({ x, surface, step }: { x: number; surface: 'white' | 'black'; step: number }) {
  const black = surface === 'black'
  return (
    <g>
      <rect x={x - 110} y={250} width={220} height={40} fill={black ? INK : '#fff'} stroke={INK} strokeWidth={2} />
      <Label x={x} y={318} size={14} fill={MUTED}>
        {black ? 'Black tape absorbs the light' : 'White floor reflects the light'}
      </Label>
      <rect x={x - 70} y={70} width={140} height={46} rx={6} fill={BLUE} stroke={INK} strokeWidth={2.5} />
      <Label x={x} y={99} size={13}>
        IR module
      </Label>
      <circle cx={x - 30} cy={128} r={11} fill="#fff" stroke={INK} strokeWidth={2} />
      <circle cx={x + 30} cy={128} r={11} fill={INK} />
      <Label x={x - 30} y={60} size={11} fill={MUTED}>
        LED
      </Label>
      <Label x={x + 30} y={60} size={11} fill={MUTED}>
        receiver
      </Label>
      <g style={show(step, 1)}>
        <Arrow d={`M${x - 30},142 L${x - 8},246`} color={RED} />
      </g>
      <g style={show(step, 2)}>
        {black ? (
          <Arrow d={`M${x - 4},246 L${x + 22},200`} color={RED} width={1.2} dashed />
        ) : (
          <Arrow d={`M${x - 4},246 L${x + 28},144`} color={RED} />
        )}
      </g>
      <g style={show(step, 3)}>
        <rect x={x + 60} y={150} width={66} height={30} rx={15} fill={black ? INK : '#fff'} stroke={INK} strokeWidth={2} />
        <Label x={x + 93} y={170} size={13} weight={800} fill={black ? '#fff' : INK}>
          {black ? 'HIGH*' : 'LOW*'}
        </Label>
      </g>
    </g>
  )
}

function IrReflect({ step }: Part) {
  return (
    <g>
      <SensorUnit x={170} surface="white" step={step} />
      <SensorUnit x={470} surface="black" step={step} />
      <Label x={320} y={30} size={18} weight={800}>
        How an IR sensor sees the line
      </Label>
      <g style={show(step, 3)}>
        <Label x={320} y={348} size={11} fill={MUTED}>
          * Typical module. Some modules are reversed: always check yours.
        </Label>
      </g>
    </g>
  )
}

function Differential({ step }: Part) {
  const cases = [
    { x: 110, l: 'fast', r: 'fast', label: 'Both equal: straight', path: 'M110,250 L110,120', at: 1 },
    { x: 320, l: 'slow', r: 'fast', label: 'Left slower: curves left', path: 'M320,250 C320,180 300,140 250,115', at: 2 },
    { x: 530, l: 'back', r: 'fwd', label: 'Opposite: spins on the spot', path: 'M560,175 A40,40 0 1 0 545,215', at: 3 },
  ]
  return (
    <g>
      <Label x={320} y={34} size={18} weight={800}>
        Steering with two wheels
      </Label>
      {cases.map((c) => (
        <g key={c.x} style={show(step, c.at)}>
          <Arrow d={c.path} color={BLUE_INK} />
          <RobotTop x={c.x} y={235} scale={0.8} />
          <Label x={c.x - 52} y={300} size={12} fill={MUTED}>
            {c.l}
          </Label>
          <Label x={c.x + 52} y={300} size={12} fill={MUTED}>
            {c.r}
          </Label>
          <Label x={c.x} y={335} size={13}>
            {c.label}
          </Label>
        </g>
      ))}
    </g>
  )
}

const PINS: [string, string, string][] = [
  ['Left IR OUT', 'D2', AMBER],
  ['Right IR OUT', 'D3', AMBER],
  ['ENA · left speed', 'D5 ~', BLUE],
  ['ENB · right speed', 'D6 ~', BLUE],
  ['IN1 · left dir', 'D8', '#e6e2d6'],
  ['IN2 · left dir', 'D9', '#e6e2d6'],
  ['IN3 · right dir', 'D10', '#e6e2d6'],
  ['IN4 · right dir', 'D11', '#e6e2d6'],
]

function PinMap({ step }: Part) {
  return (
    <g>
      <Label x={320} y={34} size={18} weight={800}>
        Reference pin map
      </Label>
      <rect x={380} y={60} width={200} height={280} rx={10} fill={BLUE_INK} stroke={INK} strokeWidth={2.5} />
      <Label x={480} y={330} size={13} fill="#fff">
        Arduino Uno
      </Label>
      {PINS.map(([name, pin, color], i) => {
        const y = 82 + i * 30
        return (
          <g key={pin} style={show(step, i < 2 ? 1 : i < 4 ? 2 : 3)}>
            <rect x={60} y={y - 12} width={220} height={24} rx={12} fill={color} stroke={INK} strokeWidth={1.5} />
            <Label x={170} y={y + 5} size={12.5}>
              {name}
            </Label>
            <line x1={280} y1={y} x2={392} y2={y} stroke={INK} strokeWidth={2} />
            <rect x={392} y={y - 11} width={52} height={22} rx={4} fill="#fff" />
            <Label x={418} y={y + 5} size={12.5} weight={800}>
              {pin}
            </Label>
          </g>
        )
      })}
    </g>
  )
}

function Wiring({ step }: Part) {
  const wire = (d: string, color: string, at: number) => <path d={d} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={show(step, at)} />
  return (
    <g>
      {/* Arduino */}
      <rect x={250} y={130} width={150} height={100} rx={8} fill={BLUE_INK} stroke={INK} strokeWidth={2.5} />
      <Label x={325} y={185} size={13} fill="#fff">
        Arduino Uno
      </Label>
      {/* L298N */}
      <rect x={250} y={258} width={150} height={78} rx={8} fill={RED} stroke={INK} strokeWidth={2.5} />
      <Label x={325} y={302} size={13} fill="#fff">
        L298N
      </Label>
      {/* sensors */}
      <rect x={60} y={40} width={90} height={40} rx={6} fill={AMBER} stroke={INK} strokeWidth={2} />
      <Label x={105} y={65} size={12}>
        Left IR
      </Label>
      <rect x={500} y={40} width={90} height={40} rx={6} fill={AMBER} stroke={INK} strokeWidth={2} />
      <Label x={545} y={65} size={12}>
        Right IR
      </Label>
      {/* motors */}
      <circle cx={100} cy={300} r={32} fill={BLUE} stroke={INK} strokeWidth={2.5} />
      <Label x={100} y={305} size={12}>
        Left M
      </Label>
      <circle cx={550} cy={300} r={32} fill={BLUE} stroke={INK} strokeWidth={2.5} />
      <Label x={550} y={305} size={12}>
        Right M
      </Label>
      {/* battery */}
      <rect x={470} y={150} width={110} height={44} rx={6} fill="#cfe8da" stroke={INK} strokeWidth={2} />
      <Label x={525} y={177} size={12}>
        Battery 7.4 V
      </Label>
      {wire('M150,60 L200,60 L200,150 L250,150', AMBER, 1)}
      {wire('M500,60 L430,60 L430,150 L400,150', AMBER, 1)}
      <g style={show(step, 1)}>
        <Label x={222} y={142} size={11} fill={MUTED}>
          D2
        </Label>
        <Label x={418} y={142} size={11} fill={MUTED}>
          D3
        </Label>
      </g>
      {wire('M290,230 L290,258', '#8a4fd1', 2)}
      {wire('M325,230 L325,258', '#8a4fd1', 2)}
      {wire('M360,230 L360,258', '#8a4fd1', 2)}
      <g style={show(step, 2)}>
        <Label x={325} y={248} size={10} fill={MUTED}>
          D5 D6 D8–D11
        </Label>
      </g>
      {wire('M250,300 L132,300', INK, 3)}
      {wire('M400,300 L518,300', INK, 3)}
      <g style={show(step, 3)}>
        <Label x={190} y={292} size={11} fill={MUTED}>
          OUT1/OUT2
        </Label>
        <Label x={460} y={292} size={11} fill={MUTED}>
          OUT3/OUT4
        </Label>
      </g>
      {wire('M525,194 L525,230 L420,230 L420,270 L400,270', RED, 4)}
      {wire('M545,194 L545,245 L430,245 L430,320 L400,320', INK, 4)}
      {wire('M250,320 L230,320 L230,215 L250,215', INK, 5)}
      <g style={show(step, 5)}>
        <Label x={200} y={255} size={11} weight={800}>
          GND
        </Label>
        <Label x={200} y={268} size={10} fill={MUTED}>
          common
        </Label>
      </g>
      <Label x={320} y={24} size={17} weight={800}>
        Wiring: battery → driver → motors, Arduino → driver
      </Label>
    </g>
  )
}

function HBridge({ step }: Part) {
  const fwd = step % 2 === 1 || step >= 99
  const sw = (x: number, y: number, on: boolean) => (
    <g>
      <rect x={x - 22} y={y - 16} width={44} height={32} rx={6} fill={on ? '#cfe8da' : '#fff'} stroke={INK} strokeWidth={2} />
      <Label x={x} y={y + 5} size={11} weight={800}>
        {on ? 'ON' : 'off'}
      </Label>
    </g>
  )
  return (
    <g>
      <Label x={320} y={34} size={18} weight={800}>
        Inside the driver: an H-bridge
      </Label>
      <line x1={200} y1={70} x2={440} y2={70} stroke={RED} strokeWidth={4} />
      <Label x={460} y={75} size={12} anchor="start" fill={RED}>
        + battery
      </Label>
      <line x1={200} y1={310} x2={440} y2={310} stroke={INK} strokeWidth={4} />
      <Label x={460} y={315} size={12} anchor="start">
        GND
      </Label>
      <line x1={200} y1={70} x2={200} y2={310} stroke={INK} strokeWidth={3} />
      <line x1={440} y1={70} x2={440} y2={310} stroke={INK} strokeWidth={3} />
      <line x1={200} y1={190} x2={280} y2={190} stroke={INK} strokeWidth={3} />
      <line x1={360} y1={190} x2={440} y2={190} stroke={INK} strokeWidth={3} />
      <circle cx={320} cy={190} r={40} fill={BLUE} stroke={INK} strokeWidth={2.5} />
      <Label x={320} y={196} size={16} weight={800}>
        M
      </Label>
      {sw(200, 130, fwd)}
      {sw(440, 130, !fwd)}
      {sw(200, 250, !fwd)}
      {sw(440, 250, fwd)}
      <Arrow d={fwd ? 'M300,145 C320,130 340,130 350,150' : 'M350,145 C330,130 310,130 290,150'} color={GREEN} />
      <Label x={320} y={345} size={13} fill={MUTED}>
        {fwd ? 'One diagonal pair on: current flows one way, motor turns forward' : 'Other pair on: current reverses, motor turns backward'}
      </Label>
    </g>
  )
}

function Chassis({ step }: Part) {
  return (
    <g>
      <rect x={300} y={0} width={40} height={360} fill={INK} opacity={0.9} />
      <g transform="translate(320 200)">
        <rect x={-130} y={50} width={30} height={80} rx={6} fill={INK} />
        <rect x={100} y={50} width={30} height={80} rx={6} fill={INK} />
        <rect x={-100} y={-140} width={200} height={290} rx={30} fill={BLUE} stroke={INK} strokeWidth={3} />
        <g style={show(step, 1)}>
          <rect x={-60} y={-162} width={34} height={26} rx={4} fill={AMBER} stroke={INK} strokeWidth={2} />
          <rect x={26} y={-162} width={34} height={26} rx={4} fill={AMBER} stroke={INK} strokeWidth={2} />
          <Label x={-150} y={-145} size={13} anchor="end">
            Left IR
          </Label>
          <Label x={150} y={-145} size={13} anchor="start">
            Right IR
          </Label>
        </g>
        <g style={show(step, 2)}>
          <rect x={-70} y={-90} width={90} height={64} rx={4} fill={BLUE_INK} stroke={INK} strokeWidth={2} />
          <Label x={-25} y={-53} size={11} fill="#fff">
            Arduino
          </Label>
          <rect x={30} y={-90} width={50} height={64} rx={4} fill={RED} stroke={INK} strokeWidth={2} />
          <Label x={55} y={-53} size={10} fill="#fff">
            L298N
          </Label>
        </g>
        <g style={show(step, 3)}>
          <rect x={-60} y={10} width={120} height={60} rx={6} fill="#cfe8da" stroke={INK} strokeWidth={2} />
          <Label x={0} y={45} size={12}>
            Battery
          </Label>
          <circle cx={0} cy={-115} r={9} fill="#fff" stroke={INK} strokeWidth={2} />
          <Label x={-150} y={100} size={13} anchor="end">
            Left wheel
          </Label>
          <Label x={150} y={100} size={13} anchor="start">
            Right wheel
          </Label>
        </g>
      </g>
      <Label x={110} y={30} size={12} fill={MUTED}>
        Line runs between the sensors
      </Label>
    </g>
  )
}

function Pwm({ step }: Part) {
  const rows = [
    { duty: 0.25, label: '25%: slow', at: 1 },
    { duty: 0.5, label: '50%: medium', at: 2 },
    { duty: 1, label: '100%: full speed', at: 3 },
  ]
  return (
    <g>
      <Label x={320} y={34} size={18} weight={800}>
        PWM: speed by switching on and off fast
      </Label>
      {rows.map((r, i) => {
        const y = 110 + i * 85
        let d = `M40,${y}`
        for (let k = 0; k < 6; k++) {
          const x0 = 40 + k * 70
          const on = 70 * r.duty
          d += ` L${x0},${y - 40} L${x0 + on},${y - 40} L${x0 + on},${y}${r.duty < 1 ? ` L${x0 + 70},${y}` : ''}`
        }
        return (
          <g key={r.label} style={show(step, r.at)}>
            <path d={d} fill="none" stroke={BLUE_INK} strokeWidth={3} strokeLinejoin="round" />
            <Label x={480} y={y - 12} size={14} anchor="start">
              {r.label}
            </Label>
          </g>
        )
      })}
      <Label x={320} y={350} size={12} fill={MUTED}>
        analogWrite(pin, 0…255) sets the on-time. 64 ≈ 25%, 128 ≈ 50%, 255 = 100%.
      </Label>
    </g>
  )
}

function Flowchart({ step }: Part) {
  const node = (x: number, y: number, w: number, text: string, fill: string, at: number) => (
    <g style={show(step, at)}>
      <rect x={x - w / 2} y={y - 20} width={w} height={40} rx={10} fill={fill} stroke={INK} strokeWidth={2} />
      <Label x={x} y={y + 5} size={13}>
        {text}
      </Label>
    </g>
  )
  return (
    <g>
      {node(320, 40, 200, 'Read both sensors', AMBER, 1)}
      <g style={show(step, 2)}>
        <Arrow d="M320,62 L320,95" />
        <Arrow d="M320,100 L95,170" />
        <Arrow d="M320,100 L245,170" />
        <Arrow d="M320,100 L395,170" />
        <Arrow d="M320,100 L545,170" />
      </g>
      {node(95, 195, 130, 'L white, R white', '#fff', 2)}
      {node(245, 195, 130, 'L black, R white', '#fff', 2)}
      {node(395, 195, 130, 'L white, R black', '#fff', 2)}
      {node(545, 195, 130, 'L black, R black', '#fff', 2)}
      {node(95, 270, 120, 'Forward', '#cfe8da', 3)}
      {node(245, 270, 120, 'Turn left', BLUE, 3)}
      {node(395, 270, 120, 'Turn right', BLUE, 3)}
      {node(545, 270, 120, 'Stop', '#f6d2cf', 3)}
      <g style={show(step, 3)}>
        {[95, 245, 395, 545].map((x) => (
          <Arrow key={x} d={`M${x},217 L${x},247`} />
        ))}
      </g>
      <g style={show(step, 4)}>
        <Arrow d="M95,292 L95,330 L620,330 L620,40 L424,40" color={BLUE_INK} dashed />
        <Label x={500} y={350} size={12} fill={BLUE_INK}>
          repeat (loop)
        </Label>
      </g>
    </g>
  )
}

function LoopDiagram({ step }: Part) {
  return (
    <g>
      <g style={show(step, 1)}>
        <rect x={60} y={120} width={180} height={100} rx={14} fill={AMBER} stroke={INK} strokeWidth={2.5} />
        <Label x={150} y={160} size={20} weight={800}>
          setup()
        </Label>
        <Label x={150} y={190} size={13} fill={MUTED}>
          runs once
        </Label>
        <Arrow d="M244,170 L330,170" />
      </g>
      <g style={show(step, 2)}>
        <rect x={340} y={120} width={200} height={100} rx={14} fill={BLUE} stroke={INK} strokeWidth={2.5} />
        <Label x={440} y={160} size={20} weight={800}>
          loop()
        </Label>
        <Label x={440} y={190} size={13} fill={MUTED}>
          runs forever
        </Label>
        <Arrow d="M500,224 C540,320 340,320 380,224" color={BLUE_INK} />
        <Label x={440} y={330} size={13} fill={BLUE_INK}>
          again, and again…
        </Label>
      </g>
      <Label x={320} y={60} size={18} weight={800}>
        Every Arduino sketch
      </Label>
    </g>
  )
}

const DIAGRAMS: Record<DiagramName, (p: Part) => React.ReactElement> = {
  ...AI_DIAGRAM_PARTS,
  'sense-think-act': SenseThinkAct,
  'ir-reflect': IrReflect,
  differential: Differential,
  'pin-map': PinMap,
  wiring: Wiring,
  'h-bridge': HBridge,
  chassis: Chassis,
  pwm: Pwm,
  flowchart: Flowchart,
  loop: LoopDiagram,
}
