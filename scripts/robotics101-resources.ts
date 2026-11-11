/**
 * Builds the 12 Robotics 101 printable resources (PDF) and the downloadable
 * Arduino sketches from the curriculum in src/lib/lms/robotics101, so the
 * handouts always match the lessons.
 *
 *   npx tsx scripts/robotics101-resources.ts
 *
 * Needs Chrome or Edge (CHROME_PATH) to print the PDFs.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Diagram, type DiagramName } from '../src/components/lms/robotics/diagrams'
import { TRUTH_TABLE } from '../src/lib/lms/robot'
import { LESSONS, MODULES, RESOURCES, type LessonDef } from '../src/lib/lms/robotics101'
import { PIN_MAP, SKETCHES } from '../src/lib/lms/robotics101-sketches'
import type { RichBlock } from '../src/lib/lms/rich'

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'public/lms-media/robotics-101')
const BUILD = path.join(ROOT, '.tmp-diag/resources-build')
mkdirSync(path.join(OUT, 'resources'), { recursive: true })
mkdirSync(path.join(OUT, 'code'), { recursive: true })
mkdirSync(BUILD, { recursive: true })

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** The small markdown subset used in lesson text: bold, code, lists, tables, fenced code. */
function md(text: string) {
  const lines = text.split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let code = false
  let table: string[][] | null = null
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
  const flushTable = () => {
    if (!table) return
    const [head, , ...rows] = table
    out.push(`<table><tr>${head!.map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`)
    table = null
  }
  const closeList = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  for (const line of lines) {
    if (line.startsWith('```')) {
      closeList()
      out.push(code ? '</pre>' : '<pre>')
      code = !code
      continue
    }
    if (code) {
      out.push(esc(line))
      continue
    }
    if (line.trim().startsWith('|')) {
      closeList()
      table ??= []
      table.push(line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
      continue
    }
    flushTable()
    const ul = line.match(/^\s*[-*]\s+(.*)/)
    const ol = line.match(/^\s*\d+\.\s+(.*)/)
    if (ul || ol) {
      const kind = ul ? 'ul' : 'ol'
      if (list !== kind) {
        closeList()
        out.push(`<${kind}>`)
        list = kind
      }
      out.push(`<li>${inline((ul ?? ol)![1]!)}</li>`)
      continue
    }
    closeList()
    if (line.startsWith('# ')) out.push(`<h3>${inline(line.slice(2))}</h3>`)
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`)
  }
  closeList()
  flushTable()
  if (code) out.push('</pre>')
  return out.join('\n')
}

const svg = (name: DiagramName) => renderToStaticMarkup(createElement(Diagram, { name }))
const blocks = (slug: string) => LESSONS.find((l) => l.slug === slug)!.content.blocks as RichBlock[]
const ofType = <T extends RichBlock['type']>(slug: string, type: T) => blocks(slug).filter((b): b is Extract<RichBlock, { type: T }> => b.type === type)

const logo = `data:image/png;base64,${readFileSync(path.join(ROOT, 'public/brand/mycampusview-lockup-dark.png')).toString('base64')}`
const font = pathToFileURL(path.join(ROOT, 'src/lib/fonts/manrope-latin.woff2')).href

function page(title: string, subtitle: string, body: string, opts: { landscape?: boolean } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@font-face { font-family: Manrope; src: url('${font}') format('woff2'); font-weight: 200 800; }
@page { size: A4 ${opts.landscape ? 'landscape' : 'portrait'}; margin: 16mm 14mm 18mm; }
* { box-sizing: border-box; }
body { font-family: Manrope, 'Segoe UI', sans-serif; color: #0b0b0d; font-size: 11pt; line-height: 1.5; margin: 0; }
header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #f0a63c; padding-bottom: 8px; margin-bottom: 14px; }
header img { height: 28px; }
.kicker { font-size: 8.5pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #2f5fb3; }
h1 { font-size: 22pt; margin: 2px 0 0; letter-spacing: -.02em; line-height: 1.15; }
h2 { font-size: 15pt; margin: 18px 0 6px; break-after: avoid; }
h3 { font-size: 12pt; margin: 12px 0 4px; break-after: avoid; }
p { margin: 4px 0; }
table { width: 100%; border-collapse: collapse; margin: 8px 0; break-inside: avoid; }
th, td { border: 1px solid #d9d6cf; padding: 5px 8px; text-align: left; vertical-align: top; font-size: 10pt; }
th { background: #0b0b0d; color: white; font-weight: 700; }
pre, code { font-family: Consolas, 'Courier New', monospace; font-size: 9pt; }
pre { background: #f4f3ef; border-left: 4px solid #f0a63c; padding: 8px 10px; white-space: pre-wrap; break-inside: avoid; }
.box { border: 1.5px solid #0b0b0d; border-radius: 8px; padding: 10px 12px; margin: 10px 0; break-inside: avoid; }
.safety { border-color: #d0473f; background: #fdf0ef; }
.tip { border-color: #f0a63c; background: #fdf3e3; }
.figure { border: 1px solid #d9d6cf; border-radius: 8px; overflow: hidden; margin: 8px 0; break-inside: avoid; }
.lesson { break-before: page; }
.write { height: 26px; border-bottom: 1px solid #9a968d; }
.check { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #0b0b0d; border-radius: 3px; margin-right: 8px; vertical-align: -2px; }
footer { position: fixed; bottom: -10mm; left: 0; right: 0; font-size: 8pt; color: #6b6860; display: flex; justify-content: space-between; }
</style></head><body>
<header><div><div class="kicker">MyCampusView Academy · Robotics 101</div><h1>${esc(title)}</h1><div style="color:#55524b">${esc(subtitle)}</div></div><img src="${logo}" alt="MyCampusView"></header>
${body}
<footer><span>Robotics 101: Build a line-follower</span><span>academy.mycampusview.com</span></footer>
</body></html>`
}

const SAFETY = `<div class="box safety"><b>Safety rules</b><ul>
<li>Ask an adult before using batteries. Use only the battery pack from the kit.</li>
<li>Never let the battery's red and black wires touch each other.</li>
<li>Switch off and unplug power before changing any wire.</li>
<li>Keep fingers, hair and loose clothes away from spinning wheels.</li>
<li>If anything gets hot, smells or smokes: switch off and tell an adult.</li></ul></div>`

const pinTable = () =>
  `<table><tr><th>Signal</th><th>Arduino pin</th><th>Name in code</th><th>Type</th></tr>${PIN_MAP.map((p) => `<tr><td>${esc(p.signal)}</td><td><b>${p.pin}</b></td><td><code>${p.name}</code></td><td>${esc(p.note)}</td></tr>`).join('')}</table>
<p>Power: each IR sensor VCC → 5V and GND → GND. Battery + → switch → L298N 12V; battery − → L298N GND; L298N GND → Arduino GND (common ground). Left motor → OUT1/OUT2 (motor A); right motor → OUT3/OUT4 (motor B).</p>`

function lessonSection(def: LessonDef & { number: number }) {
  const c = def.content
  const parts: string[] = [
    `<section class="lesson"><div class="kicker">Lesson ${def.number} · about ${def.minutes} minutes</div><h2 style="margin-top:2px;font-size:18pt">${esc(def.title)}</h2>`,
    md(c.intro),
    `<div class="box"><b>You will:</b><ul>${c.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>`,
  ]
  for (const b of c.blocks as RichBlock[]) {
    if (b.type === 'text') parts.push(`${b.heading ? `<h3>${esc(b.heading)}</h3>` : ''}${md(b.body)}`)
    else if (b.type === 'callout' && b.tone !== 'teacher') parts.push(`<div class="box ${b.tone === 'safety' ? 'safety' : 'tip'}"><b>${esc(b.title)}</b>${md(b.body)}</div>`)
    else if (b.type === 'diagram') parts.push(`<div class="figure">${svg(b.name)}</div>${b.caption ? `<p style="font-size:9pt;color:#55524b">${esc(b.caption)}</p>` : ''}`)
    else if (b.type === 'steps') parts.push(`<h3>${esc(b.title)}</h3><ol>${b.steps.map((s) => `<li><b>${esc(s.title)}.</b> ${esc(s.body)}${s.tip ? ` <i>Tip: ${esc(s.tip)}</i>` : ''}</li>`).join('')}</ol>`)
    else if (b.type === 'checklist') parts.push(`<h3>${esc(b.title)}</h3>${b.items.map((i) => `<p><span class="check"></span>${esc(i.text)}</p>`).join('')}`)
    else if (b.type === 'code') parts.push(`<pre>${esc(b.code)}</pre>`)
  }
  parts.push(`<div class="box tip"><b>What you learned</b><ul>${c.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>${c.next ? `<p><b>Next:</b> ${esc(c.next)}</p>` : ''}</div></section>`)
  return parts.join('\n')
}

const KIT = [
  ['Arduino Uno', 'The brain: runs your program and makes decisions', 'Keep it on spacers; never touch the pins with power on'],
  ['USB cable (A–B)', 'Uploads programs from the computer', 'Unplug before running on batteries'],
  ['IR sensor module ×2', 'The eyes: see black or white below', 'Blue knob sets sensitivity; LED shows what it sees'],
  ['L298N motor driver', 'The muscles’ helper: powers the motors', 'Gets warm when working: that is normal'],
  ['DC gear motor ×2', 'Turn the wheels', 'Left motor = motor A, right motor = motor B'],
  ['Wheels ×2 and castor', 'Carry the robot', 'The castor keeps it balanced at the front'],
  ['Battery pack (2 × 18650, 7.4 V)', 'Energy for motors and Arduino', 'Adult supervision; never short the wires'],
  ['Switch', 'Turns everything on and off', 'Keep it OFF while wiring'],
  ['Chassis and screws', 'The body', 'Keep screws in a bowl'],
  ['Jumper wires', 'Carry power and signals', 'Red = power, black = ground by habit'],
]

const TROUBLE = [
  ['Nothing happens at all', 'Battery flat or switch off; upload failed', 'Charge/switch on; re-upload and read any red errors'],
  ['Motors twitch or act randomly', 'No common ground', 'Connect L298N GND to Arduino GND'],
  ['Robot spins in circles', 'One motor wired backwards', 'Swap that motor’s two wires at the L298N; test with motor_test.ino'],
  ['Robot drives backwards', 'Both motors reversed', 'Swap both motors’ wires, or swap IN1/IN2 and IN3/IN4'],
  ['Turns away from the line', 'Left and right swapped (sensors or rules)', 'Swap the OUT wires on D2/D3, or swap the two turn rules'],
  ['Stops on plain white', 'Sensors too sensitive or too high', 'Turn the knobs; lower sensors to 5–10 mm; check ON_LINE'],
  ['Misses sharp corners', 'Turning too gently or too fast', 'Lower BASE_SPEED; set TURN_SPEED to 0 or −80 (pivot)'],
  ['Wobbles a lot on straights', 'Too fast or sensors too far apart', 'Lower BASE_SPEED; move sensors to about 3 cm apart'],
  ['Upload fails', 'Wrong board or port; robot powered from battery', 'Tools → Board: Arduino Uno; Tools → Port; try another USB port'],
  ['Works, then stops after a while', 'Batteries running low', 'Charge the batteries'],
]

const CHEAT = [
  ['pinMode(pin, OUTPUT)', 'Set a pin as output (motors, LEDs) or INPUT (sensors)', 'setup()'],
  ['digitalRead(pin)', 'Read a sensor: HIGH or LOW', 'loop()'],
  ['digitalWrite(pin, HIGH)', 'Switch a pin on (HIGH) or off (LOW)', 'loop()'],
  ['analogWrite(pin, 0–255)', 'Set motor speed with PWM (pins 5 and 6)', 'loop()'],
  ['delay(ms)', 'Wait; 1000 ms = 1 second', 'anywhere'],
  ['Serial.begin(9600)', 'Start talking to the Serial Monitor', 'setup()'],
  ['Serial.println(x)', 'Print a value and a new line', 'anywhere'],
  ['if (…) { } else if (…) { } else { }', 'Choose what to do', 'loop()'],
  ['&&  ||  !', 'AND, OR, NOT', 'conditions'],
  ['const int NAME = 2;', 'Give a pin or setting a name', 'top of sketch'],
  ['// comment', 'A note for humans; the robot ignores it', 'anywhere'],
]

function trackTiles() {
  // A4 landscape is 297 × 210 mm; tiles are drawn in mm so the line prints at its real 20 mm width.
  const tile = (title: string, d: string) =>
    `<section style="break-after: page"><h2>${title}</h2><svg viewBox="0 0 265 160" style="width:265mm;height:160mm;border:1px dashed #9a968d"><path d="${d}" fill="none" stroke="#000" stroke-width="20" stroke-linecap="butt"/><text x="4" y="156" font-size="4" fill="#6b6860">Line width: 20 mm. Print at 100% (no scaling). Tape tiles edge to edge.</text></svg></section>`
  return [
    tile('Tile A: straight', 'M 0 80 L 265 80'),
    tile('Tile B: gentle curve', 'M 0 130 C 90 130, 175 30, 265 30'),
    tile('Tile C: S-bend', 'M 0 80 C 60 0, 100 0, 132 80 S 205 160, 265 80'),
    tile('Tile D: sharp 90° corner', 'M 0 120 L 150 120 L 150 0'),
    tile('Tile E: finish line', 'M 0 80 L 200 80 M 200 30 L 200 130'),
  ].join('\n')
}

const lesson = (slug: string) => LESSONS.find((l) => l.slug === slug)!

const DOCS: Record<string, () => { subtitle: string; body: string; landscape?: boolean }> = {
  handbook: () => ({
    subtitle: 'Every lesson in one booklet',
    body: `<p>This handbook follows the online course lesson by lesson. Use it in class, at home, or when you are offline. The videos, simulator and quizzes are online.</p>${SAFETY}
<h2>Course map</h2><table><tr><th>Module</th><th>Lessons</th></tr>${MODULES.map((m) => `<tr><td><b>${esc(m.title)}</b><br>${esc(m.summary)}</td><td>${m.lessons.map((l) => `${LESSONS.find((x) => x.slug === l.slug)!.number}. ${esc(l.title)} (${l.minutes} min)`).join('<br>')}</td></tr>`).join('')}</table>
${LESSONS.map(lessonSection).join('\n')}`,
  }),
  components: () => ({
    subtitle: 'Every part in the kit, its name and its job',
    body: `<table><tr><th style="width:28%">Part</th><th>Job</th><th>Good to know</th></tr>${KIT.map(([a, b, c]) => `<tr><td><b>${a}</b></td><td>${b}</td><td>${c}</td></tr>`).join('')}</table>
<h2>How the parts work together</h2><div class="figure">${svg('sense-think-act')}</div><div class="figure">${svg('wiring')}</div>`,
  }),
  wiring: () => ({
    subtitle: 'Arduino Uno + L298N + two IR sensors',
    landscape: true,
    body: `<div class="figure">${svg('wiring')}</div>${pinTable()}<div class="box safety"><b>Before power:</b> batteries out while wiring · all grounds joined (battery −, L298N GND, Arduino GND, sensor GND) · ENA/ENB jumpers removed · an adult has checked every wire.</div>`,
  }),
  pins: () => ({
    subtitle: 'Print and keep it next to your robot',
    body: `${pinTable()}<div class="figure">${svg('pin-map')}</div>
<h2>Motor direction</h2><table><tr><th>IN1 / IN3</th><th>IN2 / IN4</th><th>Motor</th></tr><tr><td>HIGH</td><td>LOW</td><td>Forward</td></tr><tr><td>LOW</td><td>HIGH</td><td>Backward</td></tr><tr><td>LOW</td><td>LOW</td><td>Stop</td></tr></table>
<p>Speed: <code>analogWrite(ENA, 0–255)</code> for the left motor, <code>analogWrite(ENB, 0–255)</code> for the right. Motor A is the left motor; motor B is the right.</p>`,
  }),
  assembly: () => ({
    subtitle: 'Step-by-step build',
    body: `${SAFETY}<div class="figure">${svg('chassis')}</div>${ofType('r101-06-build-body', 'steps').map((s) => `<h2>${esc(s.title)}</h2><ol>${s.steps.map((x) => `<li><b>${esc(x.title)}.</b> ${esc(x.body)}${x.tip ? `<br><i>Tip: ${esc(x.tip)}</i>` : ''}</li>`).join('')}</ol>`).join('')}
${[...ofType('r101-06-build-body', 'checklist'), ...ofType('r101-07-electronics', 'checklist')].map((c) => `<h2>${esc(c.title)}</h2>${c.items.map((i) => `<p><span class="check"></span>${esc(i.text)}</p>`).join('')}`).join('')}`,
  }),
  troubleshooting: () => ({
    subtitle: 'Symptom → likely cause → fix',
    body: `<div class="box tip"><b>The engineer’s method:</b> 1. Describe exactly what happens. 2. Guess one cause. 3. Change one thing. 4. Test and write it down.</div>
<table><tr><th style="width:28%">What you see</th><th>Likely cause</th><th>Try this</th></tr>${TROUBLE.map(([a, b, c]) => `<tr><td><b>${a}</b></td><td>${b}</td><td>${c}</td></tr>`).join('')}</table>
<h2>Ask the robot what it sees</h2><p>Upload <code>ir_sensor_test.ino</code>, open the Serial Monitor at 9600 baud and slide the robot across the line. Each sensor should say BLACK only over the tape.</p>`,
  }),
  cheatsheet: () => ({
    subtitle: 'The commands used in this course',
    body: `<table><tr><th style="width:36%">Code</th><th>What it does</th><th>Usually in</th></tr>${CHEAT.map(([a, b, c]) => `<tr><td><code>${esc(a)}</code></td><td>${esc(b)}</td><td>${c}</td></tr>`).join('')}</table>
<h2>Every sketch has two parts</h2><pre>void setup() {
  // runs once when the robot switches on
}

void loop() {
  // runs again and again, forever
}</pre>
<h2>Common errors</h2><table><tr><th>Error says</th><th>Usually means</th></tr>
<tr><td>expected ';' before …</td><td>A missing semicolon on the line above</td></tr>
<tr><td>'leftspeed' was not declared</td><td>A spelling or capital-letter mismatch</td></tr>
<tr><td>expected '}' at end of input</td><td>A missing closing bracket</td></tr>
<tr><td>Port not found / upload failed</td><td>Wrong port, or the USB cable is loose</td></tr></table>`,
  }),
  flowchart: () => ({
    subtitle: 'The four rules at a glance',
    body: `<div class="figure">${svg('flowchart')}</div><table><tr><th>Left sensor</th><th>Right sensor</th><th>Robot does</th><th>Why</th></tr>${TRUTH_TABLE.map((r) => `<tr><td>${r.reading.left ? 'Black' : 'White'}</td><td>${r.reading.right ? 'Black' : 'White'}</td><td><b>${r.action}</b></td><td>${esc(r.why)}</td></tr>`).join('')}</table><div class="figure">${svg('loop')}</div>`,
  }),
  tracks: () => ({ subtitle: 'A4 tiles to tape together', landscape: true, body: trackTiles() }),
  worksheet: () => ({
    subtitle: 'Record your readings, tests and fixes',
    body: `<p>Name: <span class="write" style="display:inline-block;width:70mm"></span> Class: <span class="write" style="display:inline-block;width:30mm"></span></p>
<h2>1. Sensor readings (Lesson 9)</h2><table><tr><th>Where is the robot?</th><th>Left says</th><th>Right says</th><th>Correct?</th></tr>${['Both sensors over white', 'Left sensor over the line', 'Right sensor over the line', 'Both over the finish line'].map((r) => `<tr><td>${r}</td><td></td><td></td><td></td></tr>`).join('')}</table><p>My sensors read black as: HIGH / LOW (circle one). So <code>ON_LINE</code> = ________</p>
<h2>2. Motor tests (Lesson 10)</h2><table><tr><th>setMotors(…)</th><th>I predict</th><th>What happened</th></tr>${['150, 150', '40, 150', '150, 40', '-150, -150', '0, 0'].map((r) => `<tr><td><code>setMotors(${r})</code></td><td></td><td></td></tr>`).join('')}</table>
<h2>3. Tuning log (Lesson 12)</h2><table><tr><th>Try</th><th>BASE_SPEED</th><th>TURN_SPEED</th><th>Track</th><th>Result</th><th>Time (s)</th></tr>${[1, 2, 3, 4, 5, 6].map((n) => `<tr><td>${n}</td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}</table>
<h2>4. A problem I fixed (Lesson 13)</h2><p>What happened:</p><div class="write"></div><div class="write"></div><p>What I changed:</p><div class="write"></div><div class="write"></div><p>Did it work?</p><div class="write"></div>`,
  }),
  teacher: () => ({
    subtitle: 'Timings, set-up, safety and classroom tips',
    body: `<h2>Course at a glance</h2><table><tr><th>#</th><th>Lesson</th><th>Minutes</th><th>Needs a kit?</th></tr>${LESSONS.map((l) => `<tr><td>${l.number}</td><td>${esc(l.title)}</td><td>${l.minutes}</td><td>${['r101-06-build-body', 'r101-07-electronics', 'r101-12-make-it-follow'].includes(l.slug) ? 'Yes (or simulator)' : 'No'}</td></tr>`).join('')}</table>
<p>Total about ${Math.round(LESSONS.reduce((n, l) => n + l.minutes, 0) / 6) / 10} hours of guided time. Most schools run it as 8 to 10 class periods, plus building time.</p>
<h2>Before the first class</h2><ul><li>One kit per 2–3 students. Charge the batteries the day before.</li><li>Install the Arduino IDE on lab computers and test an upload.</li><li>Lay test tracks: black electrical tape (18–25 mm) on white chart paper, away from table edges and direct sunlight.</li><li>Print the pin reference and troubleshooting guide for each table.</li></ul>
${SAFETY}
<h2>Teacher checks</h2><p><span class="check"></span>Wiring checked before any battery goes in (Lesson 7 checklist).</p><p><span class="check"></span>Wheels lifted off the table for first motor tests (Lesson 10).</p><p><span class="check"></span>Batteries removed and stored at the end of each session.</p>
<h2>Students without a kit</h2><p>Every lesson works in the browser. The line simulator covers the experiments, and the final challenge has a virtual pathway: students finish the S-curve and sharp-turns tracks, and their results are recorded automatically as evidence.</p>
<h2>Reviewing the final challenge</h2><p>Projects appear under <b>Robotics &amp; AI → Project reviews</b>. Approve, or send back with a note; students can resubmit. For the “teacher watched it run” pathway, approve only after you or a colleague have seen the run. Use the assessment rubric.</p>
<h2>Classroom tips</h2><ul><li>Pairs work best: one reads the steps, one builds; swap each lesson.</li><li>Expect problems in Lesson 12. That is the lesson. Ask “what did you change?” before helping.</li><li>Celebrate the first robot that finishes a lap, then the first that handles the sharp corner.</li></ul>`,
  }),
  rubric: () => ({
    subtitle: 'How the final challenge is judged',
    landscape: true,
    body: `<table><tr><th style="width:18%">Criterion</th><th>Beginning (1)</th><th>Developing (2)</th><th>Secure (3)</th><th>Excellent (4)</th></tr>
<tr><td><b>Follows the line</b></td><td>Leaves the line on most curves</td><td>Completes straight sections and gentle curves</td><td>Completes a full lap with two or more curves</td><td>Full lap including a sharp corner, smoothly</td></tr>
<tr><td><b>Build quality</b></td><td>Loose parts or wires</td><td>Works but wires near the wheels</td><td>Firm, tidy, sensors at the right height</td><td>Neat, labelled, easy to debug</td></tr>
<tr><td><b>Code</b></td><td>Copied, does not compile</td><td>Compiles with help</td><td>Compiles; pins and speeds named; comments</td><td>Tuned values explained in comments</td></tr>
<tr><td><b>Testing and fixing</b></td><td>No record of tests</td><td>One problem described</td><td>Problem, cause and fix described</td><td>Several changes tested one at a time, with results</td></tr>
<tr><td><b>Explaining</b></td><td>Cannot explain how it works</td><td>Explains sense–think–act</td><td>Explains the four rules</td><td>Explains why the robot behaves as it does on corners</td></tr></table>
<p>Virtual pathway: “Follows the line” is judged from the recorded simulator runs (S-curve and sharp turns). Pass: 12 of 20 or more, with at least 2 in “Follows the line”.</p>`,
  }),
}

function chrome() {
  const c = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
    (p) => p && existsSync(p),
  )
  if (!c) throw new Error('Chrome or Edge not found. Set CHROME_PATH.')
  return c
}

const browser = chrome()
for (const r of RESOURCES) {
  const doc = DOCS[r.id]?.()
  if (!doc) throw new Error(`No template for ${r.id}`)
  const html = path.join(BUILD, `${r.id}.html`)
  writeFileSync(html, page(r.title, doc.subtitle, doc.body, { landscape: doc.landscape }))
  const pdf = path.join(OUT, r.file)
  const res = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, pathToFileURL(html).href], { encoding: 'utf8', timeout: 120_000 })
  if (!existsSync(pdf) || statSync(pdf).size < 5000) throw new Error(`${r.id}: PDF not produced. ${res.stderr?.slice(-400) ?? ''}`)
  const head = readFileSync(pdf).subarray(0, 5).toString()
  if (head !== '%PDF-') throw new Error(`${r.id}: not a PDF`)
  console.log(`${r.file}  ${Math.round(statSync(pdf).size / 1024)} KB`)
}

for (const s of SKETCHES) {
  const src = path.join(ROOT, 'arduino/robotics-101', s.name, `${s.name}.ino`)
  copyFileSync(src, path.join(OUT, 'code', `${s.name}.ino`))
}
console.log(`Copied ${SKETCHES.length} sketches to ${path.relative(ROOT, path.join(OUT, 'code'))}`)
