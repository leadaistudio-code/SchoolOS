import { PIN_MAP } from '../robotics101-sketches'

/**
 * Clickable spots on the hotspot-activity boards. Geometry is in the 640×360
 * drawing space used by the board art in components/lms/robotics/hotspot.tsx.
 * `printed` spots carry a label on the real board, so the label can be read
 * out; unprinted parts are announced only as "Part n" so the answer is not given away.
 */
export type HotspotSpot = { id: string; label: string; printed: boolean; name: string; about: string; x: number; y: number; w: number; h: number }
export type HotspotBoardId = 'uno' | 'l298n' | 'ir-module'
export type HeaderPin = { id: string; label: string; cx: number }

const PIN_STEP = 22

const row = (labels: [string, string][], start: number): HeaderPin[] => labels.map(([id, label], i) => ({ id, label, cx: start + i * PIN_STEP }))

/* ------------------------------------------------------------ Arduino Uno */

export const UNO_TOP_Y = 52
export const UNO_BOTTOM_Y = 290
export const UNO_TOP_LEFT = row(
  [['scl', 'SCL'], ['sda', 'SDA'], ['aref', 'AREF'], ['gnd-d', 'GND'], ['d13', '13'], ['d12', '12'], ['d11', '~11'], ['d10', '~10'], ['d9', '~9'], ['d8', '8']],
  176,
)
export const UNO_TOP_RIGHT = row(
  [['d7', '7'], ['d6', '~6'], ['d5', '~5'], ['d4', '4'], ['d3', '~3'], ['d2', '2'], ['d1', 'TX→1'], ['d0', 'RX←0']],
  412,
)
export const UNO_POWER = row(
  [['nc', ''], ['ioref', 'IOREF'], ['reset-pin', 'RESET'], ['v33', '3.3V'], ['v5', '5V'], ['gnd-p1', 'GND'], ['gnd-p2', 'GND'], ['vin', 'VIN']],
  206,
)
export const UNO_ANALOG = row(
  [['a0', 'A0'], ['a1', 'A1'], ['a2', 'A2'], ['a3', 'A3'], ['a4', 'A4'], ['a5', 'A5']],
  400,
)

function digitalAbout(n: number) {
  const use = PIN_MAP.find((p) => p.pin === `D${n}`)
  const pwm = [3, 5, 6, 9, 10, 11].includes(n) ? ' The ~ means it can also give PWM, a fast on-off signal for speed control.' : ''
  const serial = n === 0 ? ' It also receives data over USB, so keep it free.' : n === 1 ? ' It also sends data over USB, so keep it free.' : ''
  const robot = use ? ` In your robot it is ${use.name}: ${use.signal}.` : ' Your robot does not use it.'
  return `Digital pin ${n} (D${n}). It can read or send HIGH and LOW.${pwm}${serial}${robot}`
}

const UNO_PIN_ABOUT: Record<string, { name: string; about: string }> = {
  scl: { name: 'SCL pin', about: 'A clock line for talking to some sensors and screens. Not used in this robot.' },
  sda: { name: 'SDA pin', about: 'A data line for talking to some sensors and screens. Not used in this robot.' },
  aref: { name: 'AREF pin', about: 'Reference voltage for analog readings. Leave it unconnected.' },
  'gnd-d': { name: 'GND pin (next to pin 13)', about: 'Ground: 0 volts. Every part of the robot must share ground.' },
  ioref: { name: 'IOREF pin', about: 'Tells add-on boards which voltage the Uno works at. Not used here.' },
  'reset-pin': { name: 'RESET pin', about: 'Connecting it to GND restarts the board, like the reset button.' },
  v33: { name: '3.3V pin', about: 'Gives 3.3 volts for small low-voltage parts. Your IR modules use 5V instead.' },
  v5: { name: '5V pin', about: 'Gives 5 volts. Your IR sensors’ VCC pins connect here.' },
  'gnd-p1': { name: 'GND pin (power header)', about: 'Ground: 0 volts. Sensor GND and the L298N GND connect to a GND pin.' },
  'gnd-p2': { name: 'GND pin (power header)', about: 'Ground: 0 volts. Any GND pin works: they are all joined inside the board.' },
  vin: { name: 'VIN pin', about: 'Voltage in: another way to power the board from a battery. Follow your kit’s instructions before using it.' },
}

const unoPins: HotspotSpot[] = [
  ...[...UNO_TOP_LEFT, ...UNO_TOP_RIGHT].map((p) => {
    const n = p.id.startsWith('d') ? Number(p.id.slice(1)) : null
    const info = n === null ? UNO_PIN_ABOUT[p.id]! : { name: `Pin ${n} (D${n})`, about: digitalAbout(n) }
    return { id: p.id, label: p.label, printed: true, ...info, x: p.cx - 11, y: UNO_TOP_Y - 4, w: 22, h: 62 }
  }),
  ...UNO_POWER.filter((p) => p.id !== 'nc').map((p) => ({ id: p.id, label: p.label, printed: true, ...UNO_PIN_ABOUT[p.id]!, x: p.cx - 11, y: UNO_BOTTOM_Y - 40, w: 22, h: 66 })),
  ...UNO_ANALOG.map((p) => ({
    id: p.id,
    label: p.label,
    printed: true,
    name: `Analog pin ${p.label}`,
    about: 'Reads a voltage as a number from 0 to 1023, for sensors that give more than HIGH or LOW. Your robot’s IR modules use digital pins instead.',
    x: p.cx - 11,
    y: UNO_BOTTOM_Y - 40,
    w: 22,
    h: 66,
  })),
]

const UNO: HotspotSpot[] = [
  ...unoPins,
  { id: 'usb', label: 'USB port', printed: false, name: 'USB port', about: 'Connects to the computer. It uploads your program, powers the board while testing and carries Serial Monitor messages.', x: 26, y: 66, w: 88, h: 72 },
  { id: 'jack', label: 'Power jack', printed: false, name: 'Barrel power jack', about: 'Another way to power the board, from a battery or adapter (7 to 12 V).', x: 26, y: 216, w: 94, h: 70 },
  { id: 'reset', label: 'Reset button', printed: false, name: 'Reset button', about: 'Restarts your program from the beginning of setup().', x: 122, y: 50, w: 38, h: 38 },
  { id: 'chip', label: 'Microcontroller', printed: false, name: 'Microcontroller (ATmega328P)', about: 'The brain: the small computer that stores and runs your program.', x: 326, y: 172, w: 218, h: 54 },
  { id: 'led-l', label: 'L', printed: true, name: 'Built-in LED “L”', about: 'Joined to pin 13. Your first program blinks it.', x: 238, y: 112, w: 34, h: 26 },
  { id: 'led-on', label: 'ON', printed: true, name: 'Power LED “ON”', about: 'Lights whenever the board has power.', x: 508, y: 120, w: 44, h: 26 },
]

/* ---------------------------------------------------------------- L298N */

export const L298N_LOGIC_Y = 290
export const L298N_LOGIC = row(
  [['ena', 'ENA'], ['in1', 'IN1'], ['in2', 'IN2'], ['in3', 'IN3'], ['in4', 'IN4'], ['enb', 'ENB']],
  340,
)
export const L298N_POWER: HeaderPin[] = [
  { id: 'v12', label: '12V', cx: 200 },
  { id: 'gnd', label: 'GND', cx: 244 },
  { id: 'v5', label: '5V', cx: 288 },
]

const LOGIC_ABOUT: Record<string, { name: string; about: string }> = {
  ena: { name: 'ENA pin', about: 'Enable A: the left motor’s speed. Take off its jumper cap and connect it to D5.' },
  in1: { name: 'IN1 pin', about: 'Left motor direction, with IN2. Connects to D8.' },
  in2: { name: 'IN2 pin', about: 'Left motor direction, with IN1. Connects to D9.' },
  in3: { name: 'IN3 pin', about: 'Right motor direction, with IN4. Connects to D10.' },
  in4: { name: 'IN4 pin', about: 'Right motor direction, with IN3. Connects to D11.' },
  enb: { name: 'ENB pin', about: 'Enable B: the right motor’s speed. Take off its jumper cap and connect it to D6.' },
}
const POWER_ABOUT: Record<string, { name: string; about: string }> = {
  v12: { name: '12V (VS) terminal', about: 'Battery + goes here, through the switch. This is the power the motors use. Never more than 12 V.' },
  gnd: { name: 'GND terminal', about: 'Battery − goes here, and a wire from here to an Arduino GND pin: the common ground.' },
  v5: { name: '5V terminal', about: 'Gives 5 volts from the board’s regulator on some kits. Follow your kit’s instructions before using it.' },
}

const L298N: HotspotSpot[] = [
  { id: 'out1', label: 'OUT1', printed: true, name: 'OUT1 terminal', about: 'Motor A output: one of the left motor’s two wires.', x: 158, y: 130, w: 84, h: 42 },
  { id: 'out2', label: 'OUT2', printed: true, name: 'OUT2 terminal', about: 'Motor A output: the left motor’s other wire.', x: 158, y: 172, w: 84, h: 42 },
  { id: 'out3', label: 'OUT3', printed: true, name: 'OUT3 terminal', about: 'Motor B output: one of the right motor’s two wires.', x: 398, y: 130, w: 84, h: 42 },
  { id: 'out4', label: 'OUT4', printed: true, name: 'OUT4 terminal', about: 'Motor B output: the right motor’s other wire.', x: 398, y: 172, w: 84, h: 42 },
  ...L298N_POWER.map((p) => ({ id: p.id, label: p.label, printed: true, ...POWER_ABOUT[p.id]!, x: p.cx - 22, y: 262, w: 44, h: 66 })),
  ...L298N_LOGIC.map((p) => ({ id: p.id, label: p.label, printed: true, ...LOGIC_ABOUT[p.id]!, x: p.cx - 11, y: L298N_LOGIC_Y - 28, w: 22, h: 66 })),
  { id: 'heatsink', label: 'Heat sink', printed: false, name: 'Heat sink', about: 'The black metal fins. The L298 chip with the H-bridge is underneath, and the fins carry its heat away. It can get warm, so do not touch it while the motors run.', x: 246, y: 36, w: 148, h: 108 },
  { id: 'jumper5v', label: '5V-EN', printed: true, name: '5V enable jumper', about: 'Switches the board’s own 5 volt regulator on. Leave it as your kit came.', x: 196, y: 214, w: 50, h: 32 },
  { id: 'regulator', label: 'Regulator', printed: false, name: 'Voltage regulator', about: 'Turns battery voltage into a steady 5 volts for the board’s logic.', x: 296, y: 176, w: 48, h: 34 },
  { id: 'led', label: 'Power LED', printed: false, name: 'Power LED', about: 'Lights when the battery is connected and switched on.', x: 390, y: 228, w: 30, h: 26 },
]

/* ------------------------------------------------------------- IR module */

export const IR_PINS = [
  { id: 'vcc', label: 'VCC', cy: 152 },
  { id: 'gnd', label: 'GND', cy: 185 },
  { id: 'out', label: 'OUT', cy: 218 },
]

const IR: HotspotSpot[] = [
  { id: 'vcc', label: 'VCC', printed: true, name: 'VCC pin', about: 'Power in. Connect it to the Arduino 5V pin.', x: 34, y: 136, w: 112, h: 32 },
  { id: 'gnd', label: 'GND', printed: true, name: 'GND pin', about: 'Ground. Connect it to an Arduino GND pin.', x: 34, y: 169, w: 112, h: 32 },
  { id: 'out', label: 'OUT', printed: true, name: 'OUT pin', about: 'The answer, HIGH or LOW. Left sensor to D2, right sensor to D3.', x: 34, y: 202, w: 112, h: 32 },
  { id: 'pot', label: 'Potentiometer', printed: false, name: 'Potentiometer (the blue knob)', about: 'Sets the threshold between black and white. Turn it gently with a small screwdriver to calibrate.', x: 172, y: 144, w: 72, h: 72 },
  { id: 'chip', label: 'Comparator chip', printed: false, name: 'Comparator chip (LM393)', about: 'Compares the light reading with the threshold and decides HIGH or LOW.', x: 264, y: 154, w: 82, h: 52 },
  { id: 'pled', label: 'PWR', printed: true, name: 'Power LED', about: 'Lights when the module has power.', x: 360, y: 148, w: 52, h: 28 },
  { id: 'sled', label: 'SIG', printed: true, name: 'Signal LED', about: 'The indicator: it changes when the sensor’s answer flips. Watch it while you calibrate.', x: 360, y: 186, w: 52, h: 28 },
  { id: 'irled', label: 'IR LED', printed: false, name: 'IR LED (clear)', about: 'Sends invisible infrared light down at the floor.', x: 442, y: 157, w: 56, h: 56 },
  { id: 'irrx', label: 'IR receiver', printed: false, name: 'IR receiver (dark)', about: 'Measures how much infrared light bounces back from the floor.', x: 502, y: 157, w: 56, h: 56 },
]

/** `view` crops the 640×360 drawing space to the board, so small parts draw as large as possible. */
export const HOTSPOT_BOARDS: Record<HotspotBoardId, { title: string; view: [number, number, number, number]; spots: HotspotSpot[] }> = {
  uno: { title: 'Arduino Uno, seen from above', view: [20, 30, 570, 306], spots: UNO },
  l298n: { title: 'L298N motor driver, seen from above', view: [140, 24, 360, 312], spots: L298N },
  'ir-module': { title: 'IR sensor module, seen from above', view: [28, 110, 546, 150], spots: IR },
}

/** "pin 5 (D5)", "the heat sink": for sentences like "That’s …". */
export function spotPhrase(spot: HotspotSpot) {
  if (/^(Pin|Analog pin) /.test(spot.name)) return spot.name.charAt(0).toLowerCase() + spot.name.slice(1)
  const lower = /^[A-Z][a-z]/.test(spot.name) ? spot.name.charAt(0).toLowerCase() + spot.name.slice(1) : spot.name
  return `the ${lower}`
}

export function hotspotSpot(board: HotspotBoardId, id: string) {
  return HOTSPOT_BOARDS[board].spots.find((s) => s.id === id)
}
