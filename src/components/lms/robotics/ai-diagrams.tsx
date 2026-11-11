import * as React from 'react'
import type { AI_DIAGRAMS } from '@/lib/lms/rich'
import { AMBER, Arrow, BLUE, BLUE_INK, GREEN, INK, Label, MINT, MUTED, RED, show, type Part } from './diagram-kit'

/**
 * AI for Young Builders diagrams. Same rules as the robotics ones: plain SVG,
 * 640 × 360, revealed step by step for the videos, fully drawn on lesson pages.
 */

export type AiDiagramName = (typeof AI_DIAGRAMS)[number]

export const AI_DIAGRAM_TITLES: Record<AiDiagramName, string> = {
  'ai-everywhere': 'Four everyday uses of AI: face unlock on a phone, traffic predictions in a maps app, translation between Indian languages, and video recommendations.',
  'rules-vs-learning':
    'Left: in a normal program a person writes the rules, and the program turns input into an answer. Right: in machine learning, examples and their answers go into learning, which builds a model; the model then turns a new example into a prediction.',
  'features-labels': 'A table of fruit. Colour, size and shape are features, the clues. The fruit name is the label, the answer.',
  pixels: 'A smiley face drawn on an 8 by 8 grid, and the same grid written as numbers: 1 for a black square, 0 for a white one.',
  'train-test': 'Ten labelled examples are split: eight train the model, two are kept back to test it on examples it has never seen.',
  'nearest-neighbour':
    'A scatter chart of fruit by sweetness and size. Mangoes cluster in one corner, lemons in another. A new fruit is circled with its three nearest neighbours: two mangoes and one lemon, so the vote says mango.',
  'confusion-matrix':
    'A confusion matrix for circle, triangle and square. Rows are the real shape, columns the prediction. The diagonal holds the right answers; two squares were predicted as circles.',
  'decision-tree': 'A decision tree. Has feathers? Yes: bird. No: has fur? Yes: mammal. No: fish.',
  sentiment: 'Each word gets a score. “The samosa was hot and delicious” adds up to plus 3, happy. “Not good” adds up to plus 1 and is wrongly called happy, because word scores ignore “not”.',
  'next-word': 'After “The cat sat on the”, the model gives each next word a chance: mat 45 percent, floor 25, sofa 20, roof 9, banana 1.',
  'chatbot-flow': 'Your message goes through a safety check, then the language model predicts a reply word by word, then the reply is safety-checked before you see it.',
  'bias-data': 'Training data with 18 adult faces and only 2 children. The model is 96 percent accurate for adults but only 55 percent for children.',
  'ai-pipeline': 'The AI project loop: plan, collect data, train, test, improve, share, and round again.',
}

const card = (x: number, y: number, w: number, h: number, fill = '#fff') => <rect x={x} y={y} width={w} height={h} rx={14} fill={fill} stroke={INK} strokeWidth={2.5} />

function AiEverywhere({ step }: Part) {
  const tiles = [
    { x: 24, title: 'Face unlock', sub: 'learned your face' },
    { x: 178, title: 'Maps traffic', sub: 'predicts jams' },
    { x: 332, title: 'Translation', sub: 'Hindi to Tamil' },
    { x: 486, title: 'Suggestions', sub: 'what to watch next' },
  ]
  return (
    <g>
      <Label x={320} y={52} size={20} weight={800}>
        AI you might meet today
      </Label>
      {tiles.map((t, i) => (
        <g key={t.title} style={show(step, i + 1)}>
          {card(t.x, 84, 130, 210, i % 2 ? BLUE : '#fff')}
          <g transform={`translate(${t.x + 65} 160)`}>
            {i === 0 ? (
              <>
                <rect x={-26} y={-44} width={52} height={88} rx={9} fill="#fff" stroke={INK} strokeWidth={2.5} />
                <circle cx={0} cy={-4} r={15} fill={AMBER} stroke={INK} strokeWidth={2} />
                <circle cx={-5} cy={-7} r={2} fill={INK} />
                <circle cx={5} cy={-7} r={2} fill={INK} />
                <path d="M-6,2 Q0,8 6,2" fill="none" stroke={INK} strokeWidth={2} />
              </>
            ) : i === 1 ? (
              <>
                <rect x={-40} y={-36} width={80} height={72} rx={8} fill={MINT} stroke={INK} strokeWidth={2.5} />
                <path d="M-40,10 C-10,-20 10,30 40,-6" fill="none" stroke={RED} strokeWidth={5} />
                <path d="M-14,-36 L-6,36" stroke="#fff" strokeWidth={4} />
                <circle cx={18} cy={-14} r={7} fill={RED} stroke={INK} strokeWidth={2} />
              </>
            ) : i === 2 ? (
              <>
                <rect x={-44} y={-34} width={52} height={36} rx={8} fill="#fff" stroke={INK} strokeWidth={2.5} />
                <Label x={-18} y={-10} size={14} weight={800}>
                  हि
                </Label>
                <rect x={-8} y={4} width={52} height={36} rx={8} fill={AMBER} stroke={INK} strokeWidth={2.5} />
                <Label x={18} y={28} size={14} weight={800}>
                  த
                </Label>
              </>
            ) : (
              <>
                {[-28, 0, 28].map((dx) => (
                  <g key={dx}>
                    <rect x={dx - 12} y={-30} width={24} height={60} rx={5} fill="#fff" stroke={INK} strokeWidth={2} />
                    <path d={`M${dx - 4},-6 L${dx + 6},0 L${dx - 4},6 z`} fill={RED} />
                  </g>
                ))}
              </>
            )}
          </g>
          <Label x={t.x + 65} y={246} size={15} weight={800}>
            {t.title}
          </Label>
          <Label x={t.x + 65} y={268} size={12} weight={500} fill={MUTED}>
            {t.sub}
          </Label>
        </g>
      ))}
      <g style={show(step, 5)}>
        <Label x={320} y={330} size={14} fill={BLUE_INK}>
          Every one learned patterns from examples
        </Label>
      </g>
    </g>
  )
}

function Box({ x, y, w = 130, h = 50, fill = '#fff', children }: { x: number; y: number; w?: number; h?: number; fill?: string; children: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} stroke={INK} strokeWidth={2.5} />
      <Label x={x + w / 2} y={y + h / 2 + 5} size={14} weight={700}>
        {children}
      </Label>
    </g>
  )
}

function RulesVsLearning({ step }: Part) {
  return (
    <g>
      <line x1={320} y1={30} x2={320} y2={340} stroke={MUTED} strokeWidth={1.5} strokeDasharray="5 6" />
      <g style={show(step, 1)}>
        <Label x={160} y={46} size={18} weight={800}>
          Normal program
        </Label>
        <Box x={20} y={80} w={130} fill={AMBER}>
          Rules (by a person)
        </Box>
        <Box x={170} y={80} w={130}>
          Input
        </Box>
        <Arrow d="M85,134 L140,176" />
        <Arrow d="M235,134 L180,176" />
        <Box x={95} y={180} w={130} fill={BLUE}>
          Program
        </Box>
        <Arrow d="M160,234 L160,268" />
        <Box x={95} y={272} w={130}>
          Answer
        </Box>
      </g>
      <g style={show(step, 2)}>
        <Label x={480} y={46} size={18} weight={800}>
          Machine learning
        </Label>
        <Box x={340} y={80} w={130}>
          Examples
        </Box>
        <Box x={490} y={80} w={130} fill={AMBER}>
          Answers (labels)
        </Box>
        <Arrow d="M405,134 L460,176" />
        <Arrow d="M555,134 L500,176" />
        <Box x={415} y={180} w={130} fill={MINT}>
          Learning
        </Box>
      </g>
      <g style={show(step, 3)}>
        <Arrow d="M480,234 L480,268" />
        <Box x={415} y={272} w={130} fill={BLUE}>
          Model
        </Box>
        <Label x={360} y={302} size={12} anchor="middle" fill={MUTED}>
          new
        </Label>
        <Arrow d="M372,298 L410,298" color={BLUE_INK} />
        <Arrow d="M548,298 L588,298" color={BLUE_INK} />
        <Label x={604} y={290} size={12} fill={BLUE_INK}>
          pre-
        </Label>
        <Label x={604} y={306} size={12} fill={BLUE_INK}>
          diction
        </Label>
      </g>
    </g>
  )
}

function FeaturesLabels({ step }: Part) {
  const rows = [
    ['Red', '8 cm', 'Round', 'Apple'],
    ['Orange', '9 cm', 'Round', 'Orange'],
    ['Yellow', '18 cm', 'Long', 'Banana'],
    ['Green', '7 cm', 'Round', 'Apple'],
  ]
  const cols = [70, 200, 330, 470]
  return (
    <g>
      <g style={show(step, 1)}>
        {['Colour', 'Size', 'Shape', 'Fruit'].map((h, i) => (
          <g key={h}>
            <rect x={cols[i]! - 60} y={70} width={i === 3 ? 140 : 120} height={40} fill={i === 3 ? AMBER : BLUE} stroke={INK} strokeWidth={2} />
            <Label x={cols[i]! + (i === 3 ? 10 : 0)} y={96} size={15} weight={800}>
              {h}
            </Label>
          </g>
        ))}
        {rows.map((r, j) => (
          <g key={j}>
            {r.map((v, i) => (
              <g key={i}>
                <rect x={cols[i]! - 60} y={110 + j * 40} width={i === 3 ? 140 : 120} height={40} fill="#fff" stroke={INK} strokeWidth={1.5} />
                <Label x={cols[i]! + (i === 3 ? 10 : 0)} y={136 + j * 40} size={14} weight={i === 3 ? 800 : 500}>
                  {v}
                </Label>
              </g>
            ))}
          </g>
        ))}
      </g>
      <g style={show(step, 2)}>
        <path d="M12,284 L12,296 L388,296 L388,284" fill="none" stroke={BLUE_INK} strokeWidth={2.5} />
        <Label x={200} y={322} size={15} fill={BLUE_INK} weight={800}>
          Features: the clues
        </Label>
      </g>
      <g style={show(step, 3)}>
        <path d="M412,284 L412,296 L608,296 L608,284" fill="none" stroke={AMBER} strokeWidth={2.5} />
        <Label x={510} y={322} size={15} fill="#a5650f" weight={800}>
          Label: the answer
        </Label>
      </g>
      <Label x={320} y={48} size={18} weight={800}>
        Each row is one example
      </Label>
    </g>
  )
}

const SMILEY = ['00111100', '01000010', '10100101', '10000001', '10100101', '10011001', '01000010', '00111100']

function Pixels({ step }: Part) {
  const cell = 28
  return (
    <g>
      <g style={show(step, 1)}>
        {SMILEY.flatMap((row, y) =>
          [...row].map((v, x) => <rect key={`${x}-${y}`} x={40 + x * cell} y={68 + y * cell} width={cell} height={cell} fill={v === '1' ? INK : '#fff'} stroke={step >= 2 ? '#c9c9c9' : 'none'} strokeWidth={1} />),
        )}
        <Label x={152} y={320} size={14}>
          What you see
        </Label>
      </g>
      <g style={show(step, 3)}>
        <Arrow d="M286,180 L346,180" />
        {SMILEY.flatMap((row, y) =>
          [...row].map((v, x) => (
            <Label key={`${x}-${y}`} x={378 + x * cell} y={88 + y * cell} size={16} weight={v === '1' ? 800 : 500} fill={v === '1' ? INK : MUTED}>
              {v}
            </Label>
          )),
        )}
        <Label x={476} y={320} size={14}>
          What the computer stores
        </Label>
      </g>
      <Label x={320} y={44} size={18} weight={800}>
        A picture is a grid of numbers
      </Label>
    </g>
  )
}

function Shape({ kind, x, y, r = 14, fill = '#fff' }: { kind: 'circle' | 'triangle' | 'square'; x: number; y: number; r?: number; fill?: string }) {
  if (kind === 'circle') return <circle cx={x} cy={y} r={r} fill={fill} stroke={INK} strokeWidth={2.5} />
  if (kind === 'square') return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill={fill} stroke={INK} strokeWidth={2.5} />
  return <path d={`M${x},${y - r} L${x + r},${y + r * 0.8} L${x - r},${y + r * 0.8} z`} fill={fill} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
}

function TrainTest({ step }: Part) {
  const kinds = ['circle', 'triangle', 'square', 'circle', 'square', 'triangle', 'circle', 'square', 'triangle', 'circle'] as const
  return (
    <g>
      <Label x={320} y={44} size={18} weight={800}>
        Keep some examples back for the test
      </Label>
      <g style={show(step, 1)}>
        {kinds.map((k, i) => (
          <g key={i}>
            <rect x={36 + i * 58} y={70} width={48} height={48} rx={8} fill={i >= 8 && step >= 2 ? AMBER : BLUE} stroke={INK} strokeWidth={2} />
            <Shape kind={k} x={60 + i * 58} y={94} r={12} />
          </g>
        ))}
      </g>
      <g style={show(step, 2)}>
        <Arrow d="M250,128 L190,196" />
        <Arrow d="M550,128 L500,196" color="#a5650f" />
        <rect x={60} y={200} width={260} height={60} rx={14} fill={BLUE} stroke={INK} strokeWidth={2.5} />
        <Label x={190} y={236} size={16} weight={800}>
          Training set: 8 examples
        </Label>
        <rect x={400} y={200} width={200} height={60} rx={14} fill={AMBER} stroke={INK} strokeWidth={2.5} />
        <Label x={500} y={236} size={16} weight={800}>
          Test set: 2 examples
        </Label>
      </g>
      <g style={show(step, 3)}>
        <Label x={190} y={296} size={14} fill={MUTED}>
          The model learns from these
        </Label>
        <Label x={500} y={296} size={14} fill={MUTED}>
          Never seen while training
        </Label>
        <Label x={320} y={334} size={15} weight={800} fill={BLUE_INK}>
          Accuracy = right answers on the test set ÷ test examples
        </Label>
      </g>
    </g>
  )
}

const MANGOES: [number, number][] = [
  [430, 110], [470, 140], [500, 100], [455, 180], [520, 160], [540, 120], [490, 200], [560, 190],
]
const LEMONS: [number, number][] = [
  [130, 250], [170, 280], [110, 300], [200, 240], [160, 220], [230, 290], [260, 260],
]

function NearestNeighbour({ step }: Part) {
  const q: [number, number] = [400, 190]
  return (
    <g>
      <line x1={70} y1={320} x2={600} y2={320} stroke={INK} strokeWidth={2} />
      <line x1={70} y1={320} x2={70} y2={60} stroke={INK} strokeWidth={2} />
      <Label x={335} y={348} size={13} fill={MUTED}>
        Sweetness →
      </Label>
      <text x={40} y={190} fontSize={13} fill={MUTED} textAnchor="middle" transform="rotate(-90 40 190)" fontFamily="Manrope, Inter, system-ui, sans-serif" fontWeight={600}>
        Size →
      </text>
      <g style={show(step, 1)}>
        {MANGOES.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={11} fill={AMBER} stroke={INK} strokeWidth={2} />
        ))}
        {LEMONS.map(([x, y], i) => (
          <Shape key={i} kind="triangle" x={x} y={y} r={11} fill="#e8e46a" />
        ))}
        <circle cx={460} cy={42} r={8} fill={AMBER} stroke={INK} strokeWidth={2} />
        <Label x={474} y={47} size={13} anchor="start">
          Mango
        </Label>
        <Shape kind="triangle" x={548} y={42} r={8} fill="#e8e46a" />
        <Label x={562} y={47} size={13} anchor="start">
          Lemon
        </Label>
      </g>
      <g style={show(step, 2)}>
        <circle cx={q[0]} cy={q[1]} r={14} fill="#fff" stroke={BLUE_INK} strokeWidth={3} />
        <Label x={q[0]} y={q[1] + 6} size={16} weight={800} fill={BLUE_INK}>
          ?
        </Label>
      </g>
      <g style={show(step, 3)}>
        <circle cx={q[0]} cy={q[1]} r={78} fill="none" stroke={BLUE_INK} strokeWidth={2.5} strokeDasharray="7 6" />
        <line x1={q[0]} y1={q[1]} x2={455} y2={180} stroke={BLUE_INK} strokeWidth={1.5} />
        <line x1={q[0]} y1={q[1]} x2={470} y2={140} stroke={BLUE_INK} strokeWidth={1.5} />
        <line x1={q[0]} y1={q[1]} x2={330} y2={232} stroke={BLUE_INK} strokeWidth={1.5} />
        <Shape kind="triangle" x={330} y={232} r={11} fill="#e8e46a" />
      </g>
      <g style={show(step, 4)}>
        <rect x={100} y={70} width={220} height={66} rx={12} fill="#fff" stroke={INK} strokeWidth={2} />
        <Label x={210} y={98} size={14} weight={700}>
          k = 3: 2 mangoes, 1 lemon
        </Label>
        <Label x={210} y={122} size={16} weight={800} fill={GREEN}>
          Prediction: mango
        </Label>
      </g>
    </g>
  )
}

function ConfusionMatrix({ step }: Part) {
  const names = ['Circle', 'Triangle', 'Square']
  const m = [
    [9, 1, 0],
    [0, 10, 0],
    [2, 0, 8],
  ]
  const x0 = 220
  const y0 = 110
  const c = 74
  return (
    <g>
      <Label x={320} y={40} size={18} weight={800}>
        Confusion matrix
      </Label>
      <g style={show(step, 1)}>
        <Label x={x0 + c * 1.5} y={78} size={14} fill={BLUE_INK}>
          Model predicted
        </Label>
        <text x={120} y={y0 + c * 1.5} fontSize={14} fill="#a5650f" textAnchor="middle" fontWeight={700} transform={`rotate(-90 120 ${y0 + c * 1.5})`} fontFamily="Manrope, Inter, system-ui, sans-serif">
          Real answer
        </text>
        {names.map((n, i) => (
          <g key={n}>
            <Label x={x0 + c * i + c / 2} y={y0 - 8} size={13}>
              {n}
            </Label>
            <Label x={x0 - 10} y={y0 + c * i + c / 2 + 5} size={13} anchor="end">
              {n}
            </Label>
          </g>
        ))}
        {m.flatMap((row, r) =>
          row.map((v, k) => {
            const diag = r === k
            const fill = step >= 2 && diag ? MINT : step >= 3 && r === 2 && k === 0 ? '#f6cfcb' : '#fff'
            return (
              <g key={`${r}-${k}`}>
                <rect x={x0 + c * k} y={y0 + c * r} width={c} height={c} fill={fill} stroke={INK} strokeWidth={2} />
                <Label x={x0 + c * k + c / 2} y={y0 + c * r + c / 2 + 8} size={24} weight={800}>
                  {v}
                </Label>
              </g>
            )
          }),
        )}
      </g>
      <g style={show(step, 2)}>
        <Label x={500} y={160} size={13} anchor="start" fill={GREEN}>
          Diagonal:
        </Label>
        <Label x={500} y={178} size={13} anchor="start" fill={GREEN}>
          right answers
        </Label>
      </g>
      <g style={show(step, 3)}>
        <Label x={500} y={270} size={13} anchor="start" fill={RED}>
          2 squares called
        </Label>
        <Label x={500} y={288} size={13} anchor="start" fill={RED}>
          circles
        </Label>
      </g>
    </g>
  )
}

function Node({ x, y, text, leaf, fill }: { x: number; y: number; text: string; leaf?: boolean; fill?: string }) {
  const w = leaf ? 110 : 170
  return (
    <g>
      <rect x={x - w / 2} y={y - 24} width={w} height={48} rx={leaf ? 24 : 10} fill={fill ?? (leaf ? AMBER : BLUE)} stroke={INK} strokeWidth={2.5} />
      <Label x={x} y={y + 5} size={15} weight={800}>
        {text}
      </Label>
    </g>
  )
}

function DecisionTree({ step }: Part) {
  return (
    <g>
      <g style={show(step, 1)}>
        <Node x={320} y={70} text="Has feathers?" />
      </g>
      <g style={show(step, 2)}>
        <Arrow d="M280,96 L180,160" />
        <Label x={214} y={122} size={13} fill={GREEN}>
          yes
        </Label>
        <Node x={160} y={184} text="Bird" leaf />
      </g>
      <g style={show(step, 3)}>
        <Arrow d="M360,96 L460,160" />
        <Label x={428} y={122} size={13} fill={RED}>
          no
        </Label>
        <Node x={480} y={184} text="Has fur?" />
      </g>
      <g style={show(step, 4)}>
        <Arrow d="M450,210 L380,272" />
        <Label x={398} y={238} size={13} fill={GREEN}>
          yes
        </Label>
        <Node x={370} y={296} text="Mammal" leaf />
        <Arrow d="M510,210 L580,272" />
        <Label x={560} y={238} size={13} fill={RED}>
          no
        </Label>
        <Node x={580} y={296} text="Fish" leaf />
      </g>
      <g style={show(step, 5)}>
        <Label x={130} y={290} size={13} fill={MUTED}>
          Root: the first question
        </Label>
        <Label x={130} y={310} size={13} fill={MUTED}>
          Leaves: the answers
        </Label>
      </g>
    </g>
  )
}

function Chips({ y, words, scores }: { y: number; words: string[]; scores: number[] }) {
  let x = 40
  return (
    <g>
      {words.map((w, i) => {
        const width = Math.max(46, w.length * 11 + 22)
        const cx = x + width / 2
        const el = (
          <g key={i}>
            <rect x={x} y={y} width={width} height={34} rx={17} fill="#fff" stroke={INK} strokeWidth={2} />
            <Label x={cx} y={y + 22} size={14} weight={700}>
              {w}
            </Label>
            <Label x={cx} y={y + 56} size={15} weight={800} fill={scores[i]! > 0 ? GREEN : scores[i]! < 0 ? RED : MUTED}>
              {scores[i]! > 0 ? `+${scores[i]}` : String(scores[i])}
            </Label>
          </g>
        )
        x += width + 10
        return el
      })}
    </g>
  )
}

function Sentiment({ step }: Part) {
  return (
    <g>
      <Label x={320} y={40} size={18} weight={800}>
        Add up the word scores
      </Label>
      <g style={show(step, 1)}>
        <Chips y={70} words={['The', 'samosa', 'was', 'hot', 'and', 'delicious']} scores={[0, 0, 0, 1, 0, 2]} />
      </g>
      <g style={show(step, 2)}>
        <Label x={40} y={168} size={17} weight={800} anchor="start" fill={GREEN}>
          Total +3: happy review ✓
        </Label>
      </g>
      <g style={show(step, 3)}>
        <Chips y={204} words={['not', 'good']} scores={[0, 1]} />
        <Label x={220} y={228} size={17} weight={800} anchor="start" fill={RED}>
          Total +1: “happy”? Wrong!
        </Label>
      </g>
      <g style={show(step, 4)}>
        <Label x={320} y={320} size={14} fill={BLUE_INK}>
          Word scores ignore order, so “not” fools them
        </Label>
      </g>
    </g>
  )
}

function NextWord({ step }: Part) {
  const bars = [
    ['mat', 45],
    ['floor', 25],
    ['sofa', 20],
    ['roof', 9],
    ['banana', 1],
  ] as const
  return (
    <g>
      <g style={show(step, 1)}>
        <Chips y={40} words={['The', 'cat', 'sat', 'on', 'the']} scores={[0, 0, 0, 0, 0]} />
        <rect x={40} y={78} width={420} height={30} fill="#f4f3ef" />
        <rect x={392} y={40} width={86} height={34} rx={17} fill="#fff" stroke={BLUE_INK} strokeWidth={2.5} strokeDasharray="6 5" />
        <Label x={435} y={62} size={16} weight={800} fill={BLUE_INK}>
          ?
        </Label>
      </g>
      {bars.map(([w, p], i) => (
        <g key={w} style={show(step, 2)}>
          <Label x={150} y={146 + i * 40} size={15} weight={700} anchor="end">
            {w}
          </Label>
          <rect x={164} y={128 + i * 40} width={Math.max(4, p * 7)} height={26} rx={6} fill={i === 0 && step >= 3 ? GREEN : BLUE} stroke={INK} strokeWidth={2} />
          <Label x={176 + Math.max(4, p * 7)} y={146 + i * 40} size={14} anchor="start">
            {`${p}%`}
          </Label>
        </g>
      ))}
      <g style={show(step, 3)}>
        <Label x={585} y={150} size={14} fill={GREEN}>
          Pick one,
        </Label>
        <Label x={585} y={170} size={14} fill={GREEN}>
          add it, repeat
        </Label>
      </g>
    </g>
  )
}

function ChatbotFlow({ step }: Part) {
  const boxes = [
    { x: 20, w: 100, label: 'You', sub: 'type a prompt', fill: '#fff' },
    { x: 140, w: 110, label: 'Safety check', sub: 'personal info?', fill: MINT },
    { x: 270, w: 120, label: 'Language model', sub: 'predicts words', fill: BLUE },
    { x: 410, w: 110, label: 'Safety check', sub: 'kind and safe?', fill: MINT },
    { x: 540, w: 80, label: 'Reply', sub: 'you check it', fill: AMBER },
  ]
  return (
    <g>
      <Label x={320} y={60} size={18} weight={800}>
        Inside the study helper
      </Label>
      {boxes.map((b, i) => (
        <g key={i} style={show(step, i + 1)}>
          {i ? <Arrow d={`M${boxes[i - 1]!.x + boxes[i - 1]!.w + 2},180 L${b.x - 4},180`} /> : null}
          <rect x={b.x} y={140} width={b.w} height={80} rx={14} fill={b.fill} stroke={INK} strokeWidth={2.5} />
          <Label x={b.x + b.w / 2} y={176} size={13} weight={800}>
            {b.label}
          </Label>
          <Label x={b.x + b.w / 2} y={198} size={11} weight={500} fill={MUTED}>
            {b.sub}
          </Label>
        </g>
      ))}
      <g style={show(step, 6)}>
        <Label x={320} y={280} size={14} fill={BLUE_INK}>
          Blocked messages never reach the model
        </Label>
      </g>
    </g>
  )
}

function Face({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} stroke={INK} strokeWidth={1.8} />
      <circle cx={x - r * 0.35} cy={y - r * 0.15} r={r * 0.12} fill={INK} />
      <circle cx={x + r * 0.35} cy={y - r * 0.15} r={r * 0.12} fill={INK} />
    </g>
  )
}

function BiasData({ step }: Part) {
  return (
    <g>
      <Label x={170} y={44} size={17} weight={800}>
        Training data
      </Label>
      <g style={show(step, 1)}>
        {Array.from({ length: 18 }, (_, i) => (
          <Face key={i} x={50 + (i % 6) * 48} y={90 + Math.floor(i / 6) * 50} r={17} fill={BLUE} />
        ))}
        <Label x={170} y={250} size={14} fill={BLUE_INK}>
          18 adults
        </Label>
      </g>
      <g style={show(step, 2)}>
        <Face x={140} y={286} r={11} fill={AMBER} />
        <Face x={180} y={286} r={11} fill={AMBER} />
        <Label x={170} y={326} size={14} fill="#a5650f">
          2 children
        </Label>
      </g>
      <g style={show(step, 3)}>
        <Label x={480} y={44} size={17} weight={800}>
          Accuracy
        </Label>
        <rect x={400} y={80} width={60} height={230} fill="none" />
        <rect x={400} y={310 - 221} width={60} height={221} fill={BLUE} stroke={INK} strokeWidth={2} />
        <Label x={430} y={300 - 221} size={15} weight={800}>
          96%
        </Label>
        <Label x={430} y={334} size={13}>
          Adults
        </Label>
        <rect x={500} y={310 - 126} width={60} height={126} fill={AMBER} stroke={INK} strokeWidth={2} />
        <Label x={530} y={300 - 126} size={15} weight={800} fill={RED}>
          55%
        </Label>
        <Label x={530} y={334} size={13}>
          Children
        </Label>
        <line x1={380} y1={310} x2={590} y2={310} stroke={INK} strokeWidth={2} />
      </g>
    </g>
  )
}

function AiPipeline({ step }: Part) {
  const names = ['Plan', 'Collect', 'Train', 'Test', 'Improve', 'Share']
  const fills = [AMBER, BLUE, MINT, '#fff', AMBER, BLUE]
  const cx = 320
  const cy = 196
  const r = 120
  const pos = names.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / names.length
    return [cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r] as const
  })
  return (
    <g>
      <Label x={cx} y={cy + 6} size={18} weight={800}>
        Your AI project
      </Label>
      {names.map((n, i) => {
        const [x, y] = pos[i]!
        const [nx, ny] = pos[(i + 1) % names.length]!
        return (
          <g key={n} style={show(step, i + 1)}>
            <Arrow d={`M${x + (nx - x) * 0.3},${y + (ny - y) * 0.3} L${x + (nx - x) * 0.66},${y + (ny - y) * 0.66}`} color={BLUE_INK} />
            <rect x={x - 56} y={y - 22} width={112} height={44} rx={22} fill={fills[i]} stroke={INK} strokeWidth={2.5} />
            <Label x={x} y={y + 6} size={16} weight={800}>
              {n}
            </Label>
          </g>
        )
      })}
    </g>
  )
}

export const AI_DIAGRAM_PARTS: Record<AiDiagramName, (p: Part) => React.ReactElement> = {
  'ai-everywhere': AiEverywhere,
  'rules-vs-learning': RulesVsLearning,
  'features-labels': FeaturesLabels,
  pixels: Pixels,
  'train-test': TrainTest,
  'nearest-neighbour': NearestNeighbour,
  'confusion-matrix': ConfusionMatrix,
  'decision-tree': DecisionTree,
  sentiment: Sentiment,
  'next-word': NextWord,
  'chatbot-flow': ChatbotFlow,
  'bias-data': BiasData,
  'ai-pipeline': AiPipeline,
}
