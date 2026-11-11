'use client'

import * as React from 'react'
import { ArrowRight, Search, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RichBlock } from '@/lib/lms/rich'
import {
  HOTSPOT_BOARDS,
  IR_PINS,
  L298N_LOGIC,
  L298N_LOGIC_Y,
  L298N_POWER,
  UNO_ANALOG,
  UNO_BOTTOM_Y,
  UNO_POWER,
  UNO_TOP_LEFT,
  UNO_TOP_RIGHT,
  UNO_TOP_Y,
  spotPhrase,
  type HotspotBoardId,
  type HotspotSpot,
} from '@/lib/lms/robotics101/hotspots'
import { cn } from '@/lib/utils'
import { ActivityCard, Feedback, Pill, RetryButton } from './activity-kit'
import { AMBER, GREEN, INK, PAPER, RED } from './diagrams'
import { useLessonState } from './lesson-state'

type Block = Extract<RichBlock, { type: 'hotspot' }>
type Result = { done: boolean; score?: number; tries?: number }

const FONT = 'Manrope, Inter, system-ui, sans-serif'
const METAL = '#c9ccd2'
const SILK = '#ffffff'
const FOCUS = '#2f5fb3'

function T({ x, y, children, size = 10, fill = SILK, anchor = 'middle', weight = 700, rotate }: {
  x: number
  y: number
  children: React.ReactNode
  size?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  weight?: number
  rotate?: boolean
}) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor} fontFamily={FONT} transform={rotate ? `rotate(-90 ${x} ${y})` : undefined}>
      {children}
    </text>
  )
}

function Screw({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={11} fill={METAL} stroke={INK} strokeWidth={1.5} />
      <line x1={cx - 7} y1={cy} x2={cx + 7} y2={cy} stroke={INK} strokeWidth={2} />
    </g>
  )
}

/* ------------------------------------------------------------- board art */

function UnoArt() {
  const top = [...UNO_TOP_LEFT, ...UNO_TOP_RIGHT]
  const bottom = [...UNO_POWER, ...UNO_ANALOG]
  return (
    <g>
      <rect x={60} y={38} width={520} height={292} rx={16} fill="#17788a" stroke={INK} strokeWidth={2.5} />
      <rect x={30} y={70} width={80} height={64} rx={4} fill={METAL} stroke={INK} strokeWidth={2} />
      <rect x={38} y={82} width={60} height={40} rx={2} fill="#9da2ab" />
      <rect x={30} y={220} width={86} height={62} rx={6} fill={INK} />
      <circle cx={62} cy={251} r={14} fill="#3a3d44" />
      <rect x={126} y={54} width={30} height={30} rx={4} fill={METAL} stroke={INK} strokeWidth={1.5} />
      <circle cx={141} cy={69} r={9} fill={RED} />
      <circle cx={150} cy={240} r={13} fill="#2b2b2b" stroke={INK} />
      <circle cx={182} cy={240} r={13} fill="#2b2b2b" stroke={INK} />
      {/* headers */}
      <rect x={165} y={UNO_TOP_Y - 2} width={UNO_TOP_LEFT.length * 22} height={20} fill={INK} />
      <rect x={401} y={UNO_TOP_Y - 2} width={UNO_TOP_RIGHT.length * 22} height={20} fill={INK} />
      <rect x={195} y={UNO_BOTTOM_Y - 2} width={UNO_POWER.length * 22} height={20} fill={INK} />
      <rect x={389} y={UNO_BOTTOM_Y - 2} width={UNO_ANALOG.length * 22} height={20} fill={INK} />
      {top.map((p) => (
        <g key={p.id}>
          <rect x={p.cx - 4} y={UNO_TOP_Y + 4} width={8} height={8} fill="#6b7079" />
          <T x={p.cx + 3.5} y={UNO_TOP_Y + 24} anchor="end" rotate size={9.5}>
            {p.label}
          </T>
        </g>
      ))}
      {bottom.map((p) => (
        <g key={p.id}>
          <rect x={p.cx - 4} y={UNO_BOTTOM_Y + 4} width={8} height={8} fill="#6b7079" />
          {p.label ? (
            <T x={p.cx + 3.5} y={UNO_BOTTOM_Y - 6} anchor="start" rotate size={9.5}>
              {p.label}
            </T>
          ) : null}
        </g>
      ))}
      <T x={480} y={112} size={11}>
        DIGITAL (PWM ~)
      </T>
      <T x={283} y={325} size={9}>
        POWER
      </T>
      <T x={455} y={325} size={9}>
        ANALOG IN
      </T>
      {/* LEDs */}
      <rect x={246} y={121} width={14} height={8} rx={1} fill={AMBER} stroke={INK} />
      <T x={266} y={130} anchor="start" size={10}>
        L
      </T>
      <rect x={514} y={129} width={14} height={8} rx={1} fill="#7ddf9c" stroke={INK} />
      <T x={533} y={138} anchor="start" size={10}>
        ON
      </T>
      {/* microcontroller */}
      <rect x={330} y={176} width={210} height={46} rx={3} fill={INK} />
      {Array.from({ length: 14 }, (_, i) => (
        <g key={i}>
          <rect x={338 + i * 14.5} y={170} width={6} height={6} fill={METAL} />
          <rect x={338 + i * 14.5} y={222} width={6} height={6} fill={METAL} />
        </g>
      ))}
      <circle cx={340} cy={199} r={5} fill="#3a3d44" />
      <T x={440} y={204} size={13} fill="#d6d8dc" weight={600}>
        ATmega328P
      </T>
      <T x={215} y={180} size={28} weight={800}>
        UNO
      </T>
      <T x={215} y={198} size={10} weight={600}>
        ARDUINO
      </T>
    </g>
  )
}

function L298nArt() {
  return (
    <g>
      <rect x={150} y={30} width={340} height={300} rx={10} fill="#c8423a" stroke={INK} strokeWidth={2.5} />
      {/* heat sink */}
      <rect x={250} y={40} width={140} height={100} rx={3} fill={INK} />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={258 + i * 14.5} y={46} width={6} height={88} fill="#3a3d44" />
      ))}
      {/* motor terminals */}
      {[160, 436].map((x) => (
        <g key={x}>
          <rect x={x} y={130} width={44} height={84} rx={3} fill="#2f6fd0" stroke={INK} strokeWidth={2} />
          <Screw cx={x + 22} cy={151} />
          <Screw cx={x + 22} cy={193} />
        </g>
      ))}
      <T x={212} y={155} anchor="start" size={11}>
        OUT1
      </T>
      <T x={212} y={197} anchor="start" size={11}>
        OUT2
      </T>
      <T x={428} y={155} anchor="end" size={11}>
        OUT3
      </T>
      <T x={428} y={197} anchor="end" size={11}>
        OUT4
      </T>
      <circle cx={280} cy={238} r={15} fill="#2b2b2b" stroke={INK} />
      <circle cx={360} cy={238} r={15} fill="#2b2b2b" stroke={INK} />
      <rect x={300} y={180} width={40} height={26} rx={2} fill={INK} />
      <T x={320} y={197} size={8} fill="#d6d8dc" weight={600}>
        78M05
      </T>
      {/* 5V enable jumper */}
      <rect x={206} y={226} width={30} height={12} fill={INK} />
      <T x={221} y={222} size={8.5}>
        5V-EN
      </T>
      {/* power LED */}
      <circle cx={405} cy={241} r={6} fill="#ff6b5e" stroke={INK} />
      {/* power terminal */}
      <rect x={178} y={262} width={132} height={44} rx={3} fill="#2f6fd0" stroke={INK} strokeWidth={2} />
      {L298N_POWER.map((p) => (
        <g key={p.id}>
          <Screw cx={p.cx} cy={284} />
          <T x={p.cx} y={321} size={11}>
            {p.label}
          </T>
        </g>
      ))}
      {/* logic header */}
      <rect x={329} y={L298N_LOGIC_Y - 12} width={L298N_LOGIC.length * 22} height={24} fill={INK} />
      {L298N_LOGIC.map((p) => (
        <g key={p.id}>
          <rect x={p.cx - 4} y={L298N_LOGIC_Y - 4} width={8} height={8} fill="#6b7079" />
          {p.id === 'ena' || p.id === 'enb' ? <rect x={p.cx - 8} y={L298N_LOGIC_Y - 24} width={16} height={22} rx={2} fill="#2b2b2b" stroke={METAL} /> : null}
          <T x={p.cx} y={L298N_LOGIC_Y + 30} size={10}>
            {p.label}
          </T>
        </g>
      ))}
    </g>
  )
}

function IrArt() {
  return (
    <g>
      {IR_PINS.map((p) => (
        <rect key={p.id} x={38} y={p.cy - 3} width={46} height={6} fill={METAL} stroke={INK} strokeWidth={1} />
      ))}
      <rect x={70} y={120} width={500} height={130} rx={10} fill="#2a5aa8" stroke={INK} strokeWidth={2.5} />
      <rect x={80} y={136} width={24} height={98} fill={INK} />
      {IR_PINS.map((p) => (
        <g key={p.id}>
          <rect x={88} y={p.cy - 4} width={8} height={8} fill="#6b7079" />
          <T x={112} y={p.cy + 4} anchor="start" size={11}>
            {p.label}
          </T>
        </g>
      ))}
      {/* potentiometer */}
      <rect x={180} y={152} width={56} height={56} rx={4} fill="#5d9be8" stroke={INK} strokeWidth={2} />
      <circle cx={208} cy={180} r={16} fill="#f2f2f2" stroke={INK} strokeWidth={1.5} />
      <line x1={200} y1={180} x2={216} y2={180} stroke={INK} strokeWidth={2.5} />
      <line x1={208} y1={172} x2={208} y2={188} stroke={INK} strokeWidth={2.5} />
      {/* comparator */}
      <rect x={270} y={160} width={70} height={40} rx={2} fill={INK} />
      <T x={305} y={184} size={9} fill="#d6d8dc" weight={600}>
        LM393
      </T>
      {/* LEDs */}
      <rect x={366} y={157} width={14} height={9} rx={1} fill="#ff6b5e" stroke={INK} />
      <T x={385} y={166} anchor="start" size={10}>
        PWR
      </T>
      <rect x={366} y={195} width={14} height={9} rx={1} fill="#7ddf9c" stroke={INK} />
      <T x={385} y={204} anchor="start" size={10}>
        SIG
      </T>
      {/* resistors */}
      <rect x={290} y={214} width={22} height={9} rx={2} fill="#e8d6b0" stroke={INK} />
      <rect x={290} y={136} width={22} height={9} rx={2} fill="#e8d6b0" stroke={INK} />
      {/* emitter and receiver */}
      <circle cx={470} cy={185} r={22} fill="#e9eef5" stroke={INK} strokeWidth={2} />
      <circle cx={470} cy={185} r={12} fill="#cfd8e6" />
      <circle cx={530} cy={185} r={22} fill="#1a1a1a" stroke={INK} strokeWidth={2} />
      <circle cx={530} cy={185} r={12} fill="#33363c" />
    </g>
  )
}

const ART: Record<HotspotBoardId, () => React.ReactElement> = { uno: UnoArt, l298n: L298nArt, 'ir-module': IrArt }

/* ------------------------------------------------------------- activity */

export function HotspotActivity({ block }: { block: Block }) {
  const { get, set } = useLessonState()
  const board = HOTSPOT_BOARDS[block.board]
  const result = get<Result | null>(`a:${block.id}`, null)
  const questions = block.questions
  const [mode, setMode] = React.useState<'challenge' | 'explore'>('challenge')
  const [qi, setQi] = React.useState(0)
  const [found, setFound] = React.useState<string | null>(null)
  const [wrong, setWrong] = React.useState<string | null>(null)
  const [missed, setMissed] = React.useState<Set<string>>(new Set())
  const [explored, setExplored] = React.useState<HotspotSpot | null>(null)
  const question = questions[qi]
  const finished = qi >= questions.length
  const firstTry = questions.length - missed.size
  const Art = ART[block.board]
  const unprinted = board.spots.filter((s) => !s.printed)

  function pick(spot: HotspotSpot) {
    if (mode === 'explore') {
      setExplored(spot)
      return
    }
    if (!question || found) return
    if (question.spots.includes(spot.id)) {
      setFound(spot.id)
      setWrong(null)
    } else {
      setWrong(spot.id)
      setMissed((m) => new Set(m).add(question.id))
    }
  }

  function next() {
    const n = qi + 1
    setQi(n)
    setFound(null)
    setWrong(null)
    if (n >= questions.length) {
      const score = Math.round((firstTry / questions.length) * 100)
      set(`a:${block.id}`, { done: true, score: Math.max(score, result?.score ?? 0), tries: (result?.tries ?? 0) + 1 })
    }
  }

  function restart() {
    setMode('challenge')
    setQi(0)
    setFound(null)
    setWrong(null)
    setMissed(new Set())
  }

  const wrongSpot = board.spots.find((s) => s.id === wrong)
  const foundSpot = board.spots.find((s) => s.id === found)
  const canExplore = finished || !!result?.done

  return (
    <ActivityCard kicker="Find it" title={block.title} done={result?.done}>
      <p className="text-sm text-ink-muted">{block.prompt}</p>
      <div className="mt-3 space-y-3">
        <div className="min-h-24">
          {canExplore ? (
            <div className="mb-3 flex gap-1.5">
              <Pill active={mode === 'challenge'} onClick={restart}>
                <Target className="size-3.5" aria-hidden /> Challenge
              </Pill>
              <Pill
                active={mode === 'explore'}
                onClick={() => {
                  setMode('explore')
                  setExplored(null)
                }}
              >
                <Search className="size-3.5" aria-hidden /> Explore the board
              </Pill>
            </div>
          ) : null}
          {mode === 'explore' ? (
            explored ? (
              <div aria-live="polite">
                <p className="text-base font-semibold text-ink">{explored.name}</p>
                <p className="mt-1 text-sm text-ink-muted">{explored.about}</p>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Tap any pin or part to see what it does.</p>
            )
          ) : finished ? (
            <div>
              <Feedback tone={firstTry === questions.length ? 'right' : 'info'} className="mt-0">
                <p className="font-medium">
                  You found {firstTry} of {questions.length} first time.
                </p>
                <p className="mt-0.5">{firstTry === questions.length ? 'You know this board. Brilliant!' : 'Try again to get them all first time, or explore the board.'}</p>
              </Feedback>
              <div className="mt-3">
                <RetryButton onClick={restart} />
              </div>
            </div>
          ) : question ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <p className="text-base font-semibold text-ink" aria-live="polite">
                  {question.ask}
                </p>
                <span className="shrink-0 pt-0.5 text-xs text-ink-subtle tnum">
                  {qi + 1} of {questions.length}
                </span>
              </div>
              {foundSpot ? (
                <Feedback tone="right">
                  <p className="font-medium">Yes, that’s {spotPhrase(foundSpot)}.</p>
                  <p className="mt-0.5">{question.explain}</p>
                </Feedback>
              ) : wrongSpot ? (
                <Feedback tone="wrong">
                  <p className="font-medium">That’s {spotPhrase(wrongSpot)}. Try again.</p>
                  {question.hint ? <p className="mt-0.5">Hint: {question.hint}</p> : null}
                </Feedback>
              ) : (
                <p className="mt-1 text-sm text-ink-muted">Click or tap it on the board. You can also use Tab and Enter.</p>
              )}
              {found ? (
                <Button size="sm" className="mt-3" onClick={next}>
                  {qi + 1 < questions.length ? 'Next' : 'See my score'} <ArrowRight />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 overflow-x-auto rounded-[var(--radius)] border border-line">
          <svg viewBox={board.view.join(' ')} className={cn('block w-full', block.board === 'uno' && 'min-w-[480px]')} role="group" aria-label={board.title}>
            <title>{board.title}</title>
            <rect x={board.view[0]} y={board.view[1]} width={board.view[2]} height={board.view[3]} fill={PAPER} />
            <Art />
            {board.spots.map((s) => {
              const isFound = found === s.id || (mode === 'explore' && explored?.id === s.id)
              const isWrong = wrong === s.id
              const stroke = isFound ? GREEN : isWrong ? RED : undefined
              return (
                <g
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  aria-label={s.printed || mode === 'explore' ? s.label : `Part ${unprinted.indexOf(s) + 1}`}
                  onClick={() => pick(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      pick(s)
                    }
                  }}
                  className="group cursor-pointer outline-none"
                >
                  <rect
                    x={s.x}
                    y={s.y}
                    width={s.w}
                    height={s.h}
                    rx={6}
                    strokeWidth={stroke ? 4 : 2.5}
                    className="fill-transparent stroke-transparent group-hover:stroke-[#2f5fb3]/60 group-focus-visible:stroke-[#2f5fb3]"
                    style={stroke ? { stroke, fill: `${stroke}22` } : undefined}
                  />
                </g>
              )
            })}
          </svg>
        </div>
        {block.board === 'uno' ? <p className="text-xs text-ink-subtle sm:hidden">Swipe sideways to see the whole board.</p> : null}
        {result?.score != null ? <p className="text-xs text-ink-subtle">Best: {result.score}% first time</p> : null}
      </div>
    </ActivityCard>
  )
}
