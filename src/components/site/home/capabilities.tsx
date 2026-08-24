'use client'

import * as React from 'react'
import Link from 'next/link'
import { Mic, MessageSquareHeart, Gauge, ArrowUpRight } from 'lucide-react'
import { Container, Section } from '../container'
import { cn } from '@/lib/utils'
import {
  ASK_ME_LANGUAGES,
  ASK_ME_PROMPTS,
  ASK_ME_TOOLS,
  CAPABILITY_SECTION,
  FEEDBACK_CAPABILITY,
  HEALTH_SCORE_CAPABILITY,
} from '@/content/site/capabilities'

type CapabilityKey = 'ask' | 'feedback' | 'health'

/**
 * Ask Me, two-way feedback and the health score — one interactive section.
 *
 * Three equal columns left a staircase of empty paper on the right. This view
 * is a tab strip plus a preview that fills the width: click a question, a
 * language, a feedback direction or a score weight and the panel answers.
 * Languages, tools and weights still come from the application sources.
 */
export function Capabilities() {
  const [tab, setTab] = React.useState<CapabilityKey>('ask')

  return (
    <Section id="capabilities" space="loose">
      <Container wide>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[40rem]" data-reveal>
            <p className="eyebrow">{CAPABILITY_SECTION.eyebrow}</p>
            <h2 className="display mt-3 text-balance text-[clamp(1.9rem,3.6vw,2.85rem)]">
              {CAPABILITY_SECTION.title}
            </h2>
            <p className="muted mt-5 max-w-[38rem] text-[17px] leading-[1.6]">
              {CAPABILITY_SECTION.lead}
            </p>
          </div>

          <div
            className="flex shrink-0 gap-1 rounded-xl border border-[color-mix(in_srgb,var(--ed-ink)_12%,transparent)] p-1"
            role="tablist"
            aria-label="Capability"
          >
            {(
              [
                { key: 'ask', label: 'Ask Me', icon: Mic },
                { key: 'feedback', label: 'Feedback', icon: MessageSquareHeart },
                { key: 'health', label: 'Health score', icon: Gauge },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                  tab === item.key
                    ? 'bg-[var(--ed-ink)] text-white'
                    : 'text-[var(--ed-ink-soft)] hover:text-[var(--ed-ink)]',
                )}
              >
                <item.icon className="size-3.5 shrink-0" aria-hidden />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid items-start gap-8 lg:mt-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.18fr)] lg:gap-12">
          {tab === 'ask' ? <AskCopy /> : null}
          {tab === 'feedback' ? <FeedbackCopy /> : null}
          {tab === 'health' ? <HealthCopy /> : null}

          <div className="min-h-[28rem] overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--ed-ink)_10%,transparent)] bg-white lg:min-h-[32rem]">
            {tab === 'ask' ? <AskPreview /> : null}
            {tab === 'feedback' ? <FeedbackPreview /> : null}
            {tab === 'health' ? <HealthPreview /> : null}
          </div>
        </div>
      </Container>
    </Section>
  )
}

function AskCopy() {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--ed-ink-soft)]">
        Ask Me
      </p>
      <h3 className="ed-display ed-display-sm mt-3 text-[var(--ed-ink)]">
        Speak a question. Get a figure from the school’s own data.
      </h3>
      <p className="mt-3 text-[15px] leading-[1.6] text-[var(--ed-ink-soft)]">
        The assistant calls the same services the screens use — attendance, fees,
        students, classes — with the signed-in user’s permissions. It drafts a
        notice for approval; it never sends one on its own.
      </p>
      <ul className="mt-6 space-y-1.5 text-[13px] text-[var(--ed-ink)]">
        {ASK_ME_TOOLS.slice(0, 6).map((tool) => (
          <li key={tool.name} className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--ed-ink)]" aria-hidden />
            <span>
              <span className="font-medium">{tool.name}</span>
              <span className="text-[var(--ed-ink-soft)]"> — {tool.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FeedbackCopy() {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--ed-ink-soft)]">
        Feedback
      </p>
      <h3 className="ed-display ed-display-sm mt-3 text-[var(--ed-ink)]">
        {FEEDBACK_CAPABILITY.title}
      </h3>
      <p className="mt-3 text-[15px] leading-[1.6] text-[var(--ed-ink-soft)]">
        {FEEDBACK_CAPABILITY.lead}
      </p>
      <p className="mt-6 text-[13px] leading-relaxed text-[var(--ed-ink-soft)]">
        Concerns can be flagged for moderation. Action items stay attached to the
        campaign, so a follow-up does not disappear into someone’s inbox.
      </p>
    </div>
  )
}

function HealthCopy() {
  return (
    <div>
      <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--ed-ink-soft)]">
        Health score
      </p>
      <h3 className="ed-display ed-display-sm mt-3 text-[var(--ed-ink)]">
        {HEALTH_SCORE_CAPABILITY.title}
      </h3>
      <p className="mt-3 text-[15px] leading-[1.6] text-[var(--ed-ink-soft)]">
        {HEALTH_SCORE_CAPABILITY.lead}
      </p>
      <p className="mt-6 text-[13px] leading-relaxed text-[var(--ed-ink-soft)]">
        The ring on the right is the default weight of each metric, not a sample
        child’s score. Click a slice to see exactly which records feed it.
      </p>
      {HEALTH_SCORE_CAPABILITY.optional.length > 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--ed-ink-soft)]">
          When the module is on, transport boarding and library returns also count.
          Weights are editable per school.
        </p>
      ) : null}
      <Link href="/product" className="ed-link mt-8 text-[14px] text-[var(--ed-ink)]">
        See how modules fit together
        <ArrowUpRight className="size-[1.05em]" aria-hidden />
      </Link>
    </div>
  )
}

function AskPreview() {
  const [promptIndex, setPromptIndex] = React.useState(0)
  const [languageIndex, setLanguageIndex] = React.useState(0)
  const [phase, setPhase] = React.useState<'idle' | 'looking' | 'done'>('done')
  const prompt = ASK_ME_PROMPTS[promptIndex]!
  const language = ASK_ME_LANGUAGES[languageIndex]!

  React.useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setPhase('done')
      return
    }
    setPhase('looking')
    const t = window.setTimeout(() => setPhase('done'), 700)
    return () => window.clearTimeout(t)
  }, [promptIndex, languageIndex])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--ed-ink)_8%,transparent)] px-4 py-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--ed-ink-soft)]">
          Demonstration
        </p>
        <p className="text-[12px] text-[var(--ed-ink-soft)]">
          Sample shape of an answer — not a live school
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-1.5" aria-label="Speech languages">
          {ASK_ME_LANGUAGES.map((lang, index) => (
            <button
              key={lang.tag}
              type="button"
              onClick={() => setLanguageIndex(index)}
              aria-pressed={index === languageIndex}
              title={lang.english}
              className={cn(
                'rounded-md border px-2 py-1 text-[12px] transition-colors',
                index === languageIndex
                  ? 'border-[var(--ed-ink)] bg-[var(--ed-ink)] text-white'
                  : 'border-[color-mix(in_srgb,var(--ed-ink)_12%,transparent)] text-[var(--ed-ink)] hover:border-[var(--ed-ink)]',
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>

        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Example questions">
          {ASK_ME_PROMPTS.map((item, index) => (
            <li key={item.tool}>
              <button
                type="button"
                onClick={() => setPromptIndex(index)}
                aria-pressed={index === promptIndex}
                className={cn(
                  'h-full w-full rounded-lg px-3 py-2.5 text-left text-[13px] leading-snug transition-colors',
                  index === promptIndex
                    ? 'bg-[var(--ed-ink)] text-white'
                    : 'bg-[color-mix(in_srgb,var(--ed-ink)_4%,transparent)] text-[var(--ed-ink)] hover:bg-[color-mix(in_srgb,var(--ed-ink)_8%,transparent)]',
                )}
              >
                “{item.spoken}”
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-auto rounded-xl bg-[color-mix(in_srgb,var(--ed-ink)_4%,transparent)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ed-ink-soft)]">
            Looking up {prompt.tool.replaceAll('_', ' ')}
            {language.tag === 'en-IN' ? '' : ` · answering in ${language.english}`}
          </p>
          {phase === 'looking' ? (
            <p className="mt-2 text-[14px] text-[var(--ed-ink-soft)]">{prompt.lookingUp}</p>
          ) : (
            <>
              <p className="mt-2 text-[15px] leading-[1.55] text-[var(--ed-ink)]">{prompt.answer}</p>
              <p className="mt-3 text-[12px] text-[var(--ed-ink-soft)]">
                Verify at {prompt.verify}. Names and money stay as the tools returned them.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function FeedbackPreview() {
  const [flowIndex, setFlowIndex] = React.useState(0)
  const flow = FEEDBACK_CAPABILITY.flows[flowIndex]!

  const samples = [
    {
      audience: 'Parent campaign',
      fields: [
        { label: 'To', value: 'Class 7 teachers' },
        { label: 'About', value: 'This term’s teaching' },
        { label: 'Status', value: 'Open — responses moderated before they are visible' },
      ],
      note: 'A parent answers a campaign. The school chooses the audience. Nothing is published until moderation.',
    },
    {
      audience: 'Teacher note',
      fields: [
        { label: 'Student', value: 'On the same record the report card reads' },
        { label: 'Performance', value: 'Structured, not a free-text dump' },
        { label: 'Homework', value: 'On the homework already set in the system' },
      ],
      note: 'A teacher leaves performance, participation, homework and behaviour. Parents see their own child only.',
    },
  ] as const
  const sample = samples[flowIndex]!

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-[color-mix(in_srgb,var(--ed-ink)_8%,transparent)] p-2">
        {FEEDBACK_CAPABILITY.flows.map((item, index) => (
          <button
            key={item.from}
            type="button"
            onClick={() => setFlowIndex(index)}
            aria-pressed={index === flowIndex}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
              index === flowIndex
                ? 'bg-[var(--ed-ink)] text-white'
                : 'text-[var(--ed-ink-soft)] hover:text-[var(--ed-ink)]',
            )}
          >
            {item.from} → {item.to}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <p className="text-[15px] leading-[1.55] text-[var(--ed-ink)]">{flow.how}</p>
        <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--ed-ink-soft)]">
          {sample.audience}
        </p>
        <dl className="space-y-3">
          {sample.fields.map((field) => (
            <div
              key={field.label}
              className="grid grid-cols-[7rem_1fr] gap-3 border-b border-[color-mix(in_srgb,var(--ed-ink)_8%,transparent)] pb-3 last:border-0"
            >
              <dt className="text-[12px] text-[var(--ed-ink-soft)]">{field.label}</dt>
              <dd className="text-[14px] text-[var(--ed-ink)]">{field.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-auto text-[13px] leading-relaxed text-[var(--ed-ink-soft)]">{sample.note}</p>
      </div>
    </div>
  )
}

function HealthPreview() {
  const metrics = HEALTH_SCORE_CAPABILITY.metrics
  const total = metrics.reduce((sum, m) => sum + m.weight, 0)
  const [active, setActive] = React.useState(0)
  const selected = metrics[active]!

  const size = 220
  const stroke = 28
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex h-full flex-col p-5">
      <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Default health-score weights"
          className="mx-auto"
        >
          {metrics.map((metric, index) => {
            const length = (metric.weight / total) * circumference
            const dashOffset = -offset
            offset += length
            const opacity = index === active ? 1 : 0.28
            return (
              <circle
                key={metric.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="var(--ed-ink)"
                strokeOpacity={opacity}
                strokeWidth={stroke}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                className="cursor-pointer transition-[stroke-opacity] duration-200"
                onClick={() => setActive(index)}
              />
            )
          })}
          <text
            x={size / 2}
            y={size / 2 - 8}
            textAnchor="middle"
            className="fill-[var(--ed-ink)] text-[28px] font-semibold"
          >
            {selected.weight}
          </text>
          <text
            x={size / 2}
            y={size / 2 + 16}
            textAnchor="middle"
            className="fill-[var(--ed-ink-soft)] text-[11px]"
          >
            of {total} default
          </text>
        </svg>

        <ul className="space-y-1" aria-label="Default student metrics">
          {metrics.map((metric, index) => (
            <li key={metric.label}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-pressed={index === active}
                className={cn(
                  'flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-[14px] transition-colors',
                  index === active
                    ? 'bg-[color-mix(in_srgb,var(--ed-ink)_6%,transparent)] text-[var(--ed-ink)]'
                    : 'text-[var(--ed-ink-soft)] hover:text-[var(--ed-ink)]',
                )}
              >
                <span>{metric.label}</span>
                <span className="tnum font-medium">{metric.weight}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto border-t border-[color-mix(in_srgb,var(--ed-ink)_8%,transparent)] pt-4">
        <p className="text-[14px] font-medium text-[var(--ed-ink)]">{selected.label}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--ed-ink-soft)]">{selected.source}</p>
      </div>
    </div>
  )
}
