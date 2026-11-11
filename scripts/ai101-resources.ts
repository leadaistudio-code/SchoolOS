/**
 * Builds the 10 AI for Young Builders printable resources (PDF) from the
 * curriculum in src/lib/lms/ai101, so the handouts always match the lessons.
 *
 *   npx tsx scripts/ai101-resources.ts
 *
 * Needs Chrome or Edge (CHROME_PATH) to print the PDFs.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Diagram, type DiagramName } from '../src/components/lms/robotics/diagrams'
import { AI_101, AI_COURSE_TITLE, AI_MEDIA_BASE } from '../src/lib/lms/ai101'
import { ANIMAL_FEATURES, ANIMALS_TEST, ANIMALS_TRAIN, type Animal } from '../src/lib/lms/ai101/lab-data'
import { curriculumLessons } from '../src/lib/lms/curriculum'
import type { RichBlock } from '../src/lib/lms/rich'

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'public', AI_MEDIA_BASE)
const BUILD = path.join(ROOT, '.tmp-diag/resources-build/ai-young-builders')
mkdirSync(path.join(OUT, 'resources'), { recursive: true })
mkdirSync(BUILD, { recursive: true })

const LESSONS = curriculumLessons(AI_101)
type Lesson = (typeof LESSONS)[number]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code>$1</code>')

/** The small markdown subset used in lesson text: bold, italics, code, lists, headings. */
function md(text: string) {
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  const closeList = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  for (const line of text.split('\n')) {
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
  return out.join('\n')
}

const svg = (name: DiagramName) => renderToStaticMarkup(createElement(Diagram, { name }))
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
.box { border: 1.5px solid #0b0b0d; border-radius: 8px; padding: 10px 12px; margin: 10px 0; break-inside: avoid; }
.safety { border-color: #d0473f; background: #fdf0ef; }
.tip { border-color: #f0a63c; background: #fdf3e3; }
.figure { border: 1px solid #d9d6cf; border-radius: 8px; overflow: hidden; margin: 8px 0; break-inside: avoid; }
.lesson { break-before: page; }
.write { height: 26px; border-bottom: 1px solid #9a968d; }
.check { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #0b0b0d; border-radius: 3px; margin-right: 8px; vertical-align: -2px; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.card { border: 2px dashed #9a968d; border-radius: 10px; padding: 10px 12px; break-inside: avoid; min-height: 52mm; }
.big { font-size: 15pt; font-weight: 800; }
.rule { display: flex; gap: 12px; align-items: flex-start; border-bottom: 1px solid #e7e5df; padding: 10px 0; break-inside: avoid; }
.num { flex: none; width: 34px; height: 34px; border-radius: 17px; background: #f0a63c; display: grid; place-items: center; font-weight: 800; font-size: 14pt; }
footer { position: fixed; bottom: -10mm; left: 0; right: 0; font-size: 8pt; color: #6b6860; display: flex; justify-content: space-between; }
</style></head><body>
<header><div><div class="kicker">MyCampusView Academy · AI for Young Builders</div><h1>${esc(title)}</h1><div style="color:#55524b">${esc(subtitle)}</div></div><img src="${logo}" alt="MyCampusView"></header>
${body}
<footer><span>${esc(AI_COURSE_TITLE)}</span><span>academy.mycampusview.com</span></footer>
</body></html>`
}

/** What each interactive lab is, for the printed handbook (the labs themselves are online). */
const LAB_NOTE: Partial<Record<RichBlock['type'], string>> = {
  'pixel-lab': 'Online lab: paint pixels and decode secret pictures from their numbers.',
  'classifier-lab': 'Online lab: train your own model by drawing or with the camera, then test it.',
  'scatter-lab': 'Online lab: drop points on a chart and watch the nearest neighbours vote.',
  'tree-lab': 'Online lab: build a decision tree that sorts animals, then test it on unusual ones.',
  'word-lab': 'Online lab: give words scores and teach the AI to read canteen reviews.',
  'next-word-lab': 'Online lab: a tiny language model suggests the next word, with its chances.',
  'ai-chat': 'Online lab: chat with the safe study helper and complete three prompt missions.',
}

function lessonSection(def: Lesson) {
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
    else if (b.type === 'steps') parts.push(`<h3>${esc(b.title)}</h3><ol>${b.steps.map((s) => `<li><b>${esc(s.title)}.</b> ${esc(s.body)}</li>`).join('')}</ol>`)
    else if (b.type === 'checklist') parts.push(`<h3>${esc(b.title)}</h3>${b.items.map((i) => `<p><span class="check"></span>${esc(i.text)}</p>`).join('')}`)
    else if (LAB_NOTE[b.type]) parts.push(`<p style="color:#2f5fb3"><b>▶ ${LAB_NOTE[b.type]}</b></p>`)
  }
  parts.push(`<div class="box tip"><b>What you learned</b><ul>${c.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>${c.next ? `<p><b>Next:</b> ${esc(c.next)}</p>` : ''}</div></section>`)
  return parts.join('\n')
}

const SAFE_RULES = [
  ['Keep personal details private', 'Never type your name, address, phone number, school, photos or passwords into an AI or any website.'],
  ['AI can be wrong', 'It sounds sure even when it is wrong. Check important facts in a book or with a teacher.'],
  ['Be honest', 'Say when and how you used AI. Copying AI answers as your own work is cheating.'],
  ['Ask before you share', 'Never upload or share another person’s photo or details without their permission.'],
  ['Stop and check', 'Surprising picture, video or voice? It could be a deepfake. Check where it came from before you believe or share it.'],
  ['Tell an adult', 'If anything online worries or upsets you, stop and tell a parent or teacher straight away.'],
]

const EXTRA_WORDS: [string, string][] = [
  ['Artificial intelligence (AI)', 'Computer systems that do tasks that normally need human thinking, such as recognising pictures or understanding words.'],
  ['Data', 'Facts, numbers, pictures or words that a computer can learn from.'],
  ['Feature', 'One measurable thing about an example, such as size, colour or number of legs.'],
  ['Label', 'The right answer for an example, such as “cat” or “dog”.'],
  ['Training data', 'The examples a model learns from.'],
  ['Test data', 'New examples kept back to check how good the model really is.'],
  ['Accuracy', 'The share of test examples the model gets right, as a percentage.'],
  ['Confusion matrix', 'A table showing which groups a model mixes up.'],
  ['Confidence', 'How sure a model is about its prediction.'],
  ['Decision tree', 'A model that predicts by asking a chain of yes-or-no questions.'],
  ['Sentiment analysis', 'Working out whether a piece of writing is happy or unhappy.'],
  ['Language model', 'An AI that has learned which words tend to follow which, so it can predict the next word.'],
  ['Chatbot', 'A program you talk to in sentences; modern ones use a language model.'],
  ['Prompt', 'The message or instruction you give an AI.'],
  ['Bias', 'When an AI treats some people or things unfairly, usually because of its data.'],
  ['Deepfake', 'A fake photo, video or voice of a real person, made with AI.'],
  ['Privacy', 'Keeping your personal information under your control.'],
]

function glossary() {
  const words = new Map<string, string>()
  for (const l of LESSONS)
    for (const b of l.content.blocks as RichBlock[])
      if (b.type === 'callout' && b.tone === 'word')
        for (const m of b.body.matchAll(/\*\*(.+?):\*\*\s*([^\n]+)/g)) words.set(m[1]!, m[2]![0]!.toUpperCase() + m[2]!.slice(1))
  for (const [w, d] of EXTRA_WORDS) if (![...words.keys()].some((k) => k.toLowerCase().startsWith(w.toLowerCase().split(' (')[0]!))) words.set(w, d)
  return [...words.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

const animalCard = (a: Animal) =>
  `<div class="card" style="min-height:34mm"><div class="big">${esc(a.name)}</div><p>${ANIMAL_FEATURES.map((f) => `${esc(f.ask.replace('?', ''))}: <b>${a[f.id] ? 'yes' : 'no'}</b>`).join('<br>')}</p></div>`

const blank = (n: number) => Array.from({ length: n }, () => '<div class="write"></div>').join('')
const name = `<p>Name: <span class="write" style="display:inline-block;width:70mm"></span> Class: <span class="write" style="display:inline-block;width:30mm"></span></p>`

const DOCS: Record<string, () => { subtitle: string; body: string; landscape?: boolean }> = {
  handbook: () => ({
    subtitle: 'Every lesson in one booklet',
    body: `<p>This handbook follows the online course lesson by lesson. Use it in class, at home, or offline. The videos, labs and quizzes are online.</p>
<h2>Course map</h2><table><tr><th>Module</th><th>Lessons</th></tr>${AI_101.modules.map((m) => `<tr><td><b>${esc(m.title)}</b><br>${esc(m.summary)}</td><td>${m.lessons.map((l) => `${LESSONS.find((x) => x.slug === l.slug)!.number}. ${esc(l.title)} (${l.minutes} min)`).join('<br>')}</td></tr>`).join('')}</table>
${LESSONS.map(lessonSection).join('\n')}`,
  }),
  glossary: () => ({
    subtitle: 'Every new word in the course',
    body: `<table><tr><th style="width:30%">Word</th><th>Meaning</th></tr>${glossary().map(([w, d]) => `<tr><td><b>${inline(w)}</b></td><td>${inline(d)}</td></tr>`).join('')}</table>`,
  }),
  'safe-ai': () => ({
    subtitle: 'Six rules for using AI well',
    body: `${SAFE_RULES.map(([t, d], i) => `<div class="rule"><span class="num">${i + 1}</span><div><div class="big">${esc(t)}</div><p>${esc(d)}</p></div></div>`).join('')}
<div class="box tip" style="margin-top:16px"><b>Remember:</b> AI is a tool that predicts. You are the one who thinks, checks and decides.</div>`,
  }),
  'data-sheet': () => ({
    subtitle: 'Plan the data before you train',
    body: `${name}
<h2>1. What will my AI recognise?</h2><p>Groups (labels), 2 to 4:</p>${blank(2)}
<h2>2. How will it see them?</h2><p><span class="check"></span>Drawings <span class="check" style="margin-left:20px"></span>Camera</p>
<h2>3. Features: what makes the groups different?</h2>${blank(3)}
<h2>4. Examples I will collect</h2><table><tr><th>Label</th><th>How many</th><th>Variety I will add (size, angle, light, style…)</th></tr>${[1, 2, 3, 4].map(() => '<tr><td style="height:34px"></td><td></td><td></td></tr>').join('')}</table>
<h2>5. Fair data check</h2><p><span class="check"></span>Every label has about the same number of examples</p><p><span class="check"></span>Examples include different sizes, styles and backgrounds</p><p><span class="check"></span>I kept some examples back for testing</p><p><span class="check"></span>No faces or personal details of other people</p>`,
  }),
  'test-sheet': () => ({
    subtitle: 'Is your AI any good? Prove it.',
    body: `${name}
<h2>1. Practice: work out the accuracy</h2><table><tr><th>Model</th><th>Right</th><th>Total tested</th><th>Accuracy</th></tr>
<tr><td>Fruit sorter</td><td>18</td><td>20</td><td></td></tr><tr><td>Shape model</td><td>27</td><td>30</td><td></td></tr><tr><td>Leaf checker</td><td>40</td><td>50</td><td></td></tr></table>
<p style="font-size:9pt;color:#55524b">Accuracy = right ÷ total × 100</p>
<h2>2. Read the confusion matrix</h2><div class="figure">${svg('confusion-matrix')}</div><p>Which two groups does this model mix up most?</p>${blank(1)}<p>What would you add to fix it?</p>${blank(1)}
<h2>3. My model's test</h2><table><tr><th>Round</th><th>Examples trained</th><th>Tests</th><th>Right</th><th>Accuracy</th><th>Biggest mix-up</th></tr>${[1, 2, 3].map((n) => `<tr><td>${n}</td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')}</table>
<h2>4. What I changed between rounds</h2>${blank(3)}`,
  }),
  prompts: () => ({
    subtitle: 'Ask clearly, check carefully, stay safe',
    body: `<h2>A clear prompt says three things</h2><table><tr><th>What</th><th>How long or what shape</th><th>Who it is for</th></tr><tr><td>Explain why Mars looks red</td><td>in 3 short points</td><td>for a Class 7 student</td></tr><tr><td>Quiz me on fractions</td><td>3 questions, then the answers</td><td>for Class 6</td></tr></table>
<h2>Vague → clear</h2><table><tr><th>Vague</th><th>Clear</th></tr><tr><td>“Help.”</td><td>“Give me 3 tips to remember the planets in order, for Class 6.”</td></tr><tr><td>“Stuff about history.”</td><td>“Tell me 4 facts about the Indus Valley cities, in simple words.”</td></tr><tr><td>“Make a story.”</td><td>“Start a 5-sentence mystery story set in a school library.”</td></tr></table>
<h2>Good follow-ups</h2><ul><li>“Explain that more simply, with an example.”</li><li>“Give me a hint, not the answer.”</li><li>“What is a common mistake with this?”</li><li>“Where could I check this fact?”</li></ul>
<div class="box safety"><b>Never put in a prompt:</b> your name, address, phone number, school, passwords, or anyone else’s photos or details.</div>
<div class="box tip"><b>Fact check:</b> AI can be wrong even when it sounds sure. Check dates, numbers and facts in a textbook or with a teacher.</div>
<h2>Try it: rewrite these prompts</h2><p>“Tell me about plants.”</p>${blank(1)}<p>“Maths help.”</p>${blank(1)}`,
  }),
  planner: () => ({
    subtitle: 'Plan, build, test, improve, present',
    body: `${name}
<h2>1. The problem</h2><p>Who will my AI help, and how?</p>${blank(2)}
<h2>2. My labels</h2>${blank(1)}<p>Drawings or camera? Why?</p>${blank(1)}
<h2>3. Data plan</h2><p>How many examples of each label, and what variety?</p>${blank(2)}
<h2>4. Test results</h2><table><tr><th>Round</th><th>Accuracy</th><th>What went wrong</th><th>What I changed</th></tr>${[1, 2, 3].map((n) => `<tr><td>${n}</td><td></td><td></td><td></td></tr>`).join('')}</table>
<h2>5. Fair and safe check</h2><p><span class="check"></span>Could it be unfair to anyone? How did I check?</p><p><span class="check"></span>Does it use anyone’s personal details or photos? (It should not.)</p><p><span class="check"></span>What should a person do when it is not sure?</p>${blank(2)}
<h2>6. My 1-minute presentation</h2><p>What it does · how I trained it · how good it is · one thing I would improve</p>${blank(3)}`,
  }),
  unplugged: () => ({
    subtitle: 'AI on paper: no computer needed',
    body: `<h2>Activity 1: Human nearest neighbours</h2><div class="box"><ol><li>Draw a chart on the board: sweetness across, size up.</li><li>Each student is a fruit card (below) and stands on its spot.</li><li>A “mystery fruit” stands somewhere new. The 3 nearest students vote: mango or lemon?</li><li>Try again with 1 neighbour, then 5. Does the answer change? Why?</li></ol></div>
<div class="cards">${[
      ['Mango', 'Very sweet (8) · Big (7)'],
      ['Mango', 'Sweet (7) · Medium (6)'],
      ['Lemon', 'Sour (2) · Small (3)'],
      ['Lemon', 'Sour (3) · Small (2)'],
      ['Mango', 'Sweet (6) · Big (8)'],
      ['Lemon', 'A bit sweet (5) · Medium (5)'],
    ]
      .map(([t, d]) => `<div class="card" style="min-height:30mm"><div class="big">${t}</div><p>${d}</p></div>`)
      .join('')}</div>
<h2 style="break-before:page">Activity 2: Build a decision tree</h2><div class="box"><ol><li>Cut out the animal cards.</li><li>In groups, write ONE yes-or-no question that splits the cards into two piles.</li><li>Keep asking questions until every pile has only birds, only mammals or only fish.</li><li>Test your tree on a penguin, a bat and a dolphin. Does it still work?</li></ol></div>
<div class="cards">${ANIMALS_TRAIN.map(animalCard).join('')}</div>
<h3 style="break-before:page">Test cards: keep these hidden until your tree is finished</h3>
<div class="cards">${ANIMALS_TEST.filter((a) => ['Penguin', 'Bat', 'Dolphin'].includes(a.name)).map(animalCard).join('')}</div>`,
  }),
  teacher: () => ({
    subtitle: 'Timings, devices, camera privacy and chat safety',
    body: `<h2>Course at a glance</h2><table><tr><th>#</th><th>Lesson</th><th>Minutes</th><th>Lab</th></tr>${LESSONS.map((l) => {
      const labs = (l.content.blocks as RichBlock[]).filter((b) => LAB_NOTE[b.type]).map((b) => b.type.replace('-lab', '').replace('ai-chat', 'study helper'))
      return `<tr><td>${l.number}</td><td>${esc(l.title)}</td><td>${l.minutes}</td><td>${esc([...new Set(labs)].join(', ') || '–')}</td></tr>`
    }).join('')}</table>
<p>Total about ${Math.round(LESSONS.reduce((n, l) => n + l.minutes, 0) / 6) / 10} hours of guided time. Most schools run it as 8 to 10 class periods. No kit and no coding needed.</p>
<h2>Devices</h2><ul><li>Any modern browser on a computer, tablet or phone. A mouse, stylus or finger works for drawing.</li><li>The camera is optional: lessons 7 and 14 offer it, and drawing works everywhere instead.</li><li>Headphones help when the class watches videos at their own pace.</li></ul>
<h2>Camera privacy</h2><p>Camera pictures are shrunk to a 12 × 9 colour grid and used only inside the page. They are never uploaded or saved; reloading the page clears them. Encourage students to train on objects or hand signs, not faces.</p>
<h2>Study helper (lesson 11) safety</h2><ul><li>Runs only inside the lesson, for students on the course and staff previewing it.</li><li>Messages with phone numbers, emails, addresses, names, schools or passwords are blocked before they reach the AI.</li><li>Unsafe topics are refused; when the platform uses OpenAI, every message and reply also passes OpenAI’s moderation check.</li><li>Short, child-friendly answers; it encourages hints over finished homework.</li><li>Each student can send 30 messages a day. Conversations are not stored; the school can see how much the helper is used.</li><li>If the helper is switched off for your school, students can still finish the lesson.</li></ul>
<h2>Reviewing the final project</h2><p>Projects appear under <b>Robotics &amp; AI → Project reviews</b>. The model the student trained in the project lesson (labels, number of examples, test accuracy and test rounds) is attached automatically, next to their note, screenshots and link. Use the assessment rubric.</p>
<h2>Classroom tips</h2><ul><li>Discuss lesson 2’s “rules or learning?” sort as a whole class before students try it.</li><li>Do the unplugged cards before lessons 6 and 8.</li><li>In lesson 7, celebrate honest testing: a model that is 70% accurate and tested fairly beats a 100% that was only tested on its own training drawings.</li><li>Lesson 12 works well as a discussion: who could an unfair AI let down at our school?</li></ul>`,
  }),
  rubric: () => ({
    subtitle: 'How the final project is judged',
    landscape: true,
    body: `<table><tr><th style="width:18%">Criterion</th><th>Beginning (1)</th><th>Developing (2)</th><th>Secure (3)</th><th>Excellent (4)</th></tr>
<tr><td><b>Problem and labels</b></td><td>No clear purpose</td><td>A purpose, but labels overlap</td><td>Clear purpose and distinct labels</td><td>Useful purpose; labels chosen with reasons</td></tr>
<tr><td><b>Data</b></td><td>Few, near-identical examples</td><td>Enough examples, little variety</td><td>Balanced examples with variety</td><td>Balanced, varied, and test data kept separate</td></tr>
<tr><td><b>Testing</b></td><td>Not tested</td><td>Tested a few times</td><td>Tested every label; accuracy reported</td><td>Several rounds; explains the biggest mix-up</td></tr>
<tr><td><b>Improving</b></td><td>No changes</td><td>One change, not tested</td><td>A change that improved the result</td><td>Changes tested one at a time, with results</td></tr>
<tr><td><b>Fair and safe</b></td><td>Not considered</td><td>Mentions fairness</td><td>Checks who it might fail; no personal data</td><td>Explains limits and what a person should do when it is unsure</td></tr></table>
<p>The model’s labels, examples, test accuracy and rounds are recorded automatically with the submission. Pass: 12 of 20 or more.</p>`,
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
for (const r of AI_101.resources) {
  const doc = DOCS[r.id]?.()
  if (!doc) throw new Error(`No template for ${r.id}`)
  const html = path.join(BUILD, `${r.id}.html`)
  writeFileSync(html, page(r.title, doc.subtitle, doc.body, { landscape: doc.landscape }))
  const pdf = path.join(OUT, r.file)
  const res = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, pathToFileURL(html).href], { encoding: 'utf8', timeout: 120_000 })
  if (!existsSync(pdf) || statSync(pdf).size < 5000) throw new Error(`${r.id}: PDF not produced. ${res.stderr?.slice(-400) ?? ''}`)
  if (readFileSync(pdf).subarray(0, 5).toString() !== '%PDF-') throw new Error(`${r.id}: not a PDF`)
  console.log(`${r.file}  ${Math.round(statSync(pdf).size / 1024)} KB`)
}
