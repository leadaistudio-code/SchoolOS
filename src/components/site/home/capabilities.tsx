import Link from 'next/link'
import { Mic, MessageSquareHeart, Gauge, ArrowUpRight } from 'lucide-react'
import { Container, Section } from '../container'
import {
  ASK_ME_LANGUAGES,
  ASK_ME_PROMPTS,
  ASK_ME_TOOLS,
  CAPABILITY_SECTION,
  FEEDBACK_CAPABILITY,
  HEALTH_SCORE_CAPABILITY,
} from '@/content/site/capabilities'

/**
 * Ask Me, two-way feedback and the health score — one section, only claims
 * that match the application.
 *
 * Languages come from SPEECH_LANGUAGES (the same list the assistant picker
 * uses). Tools are the names in tools.ts. Score metrics are STUDENT_METRICS.
 * Feedback flows match FeedbackAudience / TeacherStudentFeedback.
 */
export function Capabilities() {
  return (
    <Section id="capabilities" space="loose">
      <Container wide>
        <div className="max-w-[40rem]" data-reveal>
          <p className="eyebrow">{CAPABILITY_SECTION.eyebrow}</p>
          <h2 className="display mt-3 text-[clamp(1.9rem,3.6vw,2.85rem)] text-balance">
            {CAPABILITY_SECTION.title}
          </h2>
          <p className="muted mt-5 max-w-[38rem] text-[17px] leading-[1.6]">
            {CAPABILITY_SECTION.lead}
          </p>
        </div>

        <div className="mt-14 grid gap-12 lg:mt-16 lg:grid-cols-3 lg:gap-10">
          <AskMeColumn />
          <FeedbackColumn />
          <HealthColumn />
        </div>
      </Container>
    </Section>
  )
}

function AskMeColumn() {
  return (
    <article className="flex flex-col border-t border-[color-mix(in_srgb,var(--ed-ink)_12%,transparent)] pt-6">
      <div className="flex items-center gap-2 text-[var(--ed-ink)]">
        <Mic className="size-4 shrink-0" aria-hidden />
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--ed-ink-soft)]">
          Ask Me
        </p>
      </div>
      <h3 className="ed-display ed-display-sm mt-3 text-[var(--ed-ink)]">
        Speak a question. Get a figure from the school’s own data.
      </h3>
      <p className="mt-3 text-[15px] leading-[1.6] text-[var(--ed-ink-soft)]">
        The assistant calls the same services the screens use — attendance, fees,
        students, classes — with the signed-in user’s permissions. It drafts a
        notice for approval; it never sends one on its own.
      </p>

      <ul className="mt-6 space-y-2.5" aria-label="Example questions">
        {ASK_ME_PROMPTS.map((prompt) => (
          <li
            key={prompt.tool}
            className="rounded-lg bg-[color-mix(in_srgb,var(--ed-ink)_4%,transparent)] px-3 py-2.5 text-[14px] leading-snug text-[var(--ed-ink)]"
          >
            <span className="text-[var(--ed-ink-soft)]">“</span>
            {prompt.spoken}
            <span className="text-[var(--ed-ink-soft)]">”</span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--ed-ink-soft)]">
        Languages the microphone accepts
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Speech languages">
        {ASK_ME_LANGUAGES.map((lang) => (
          <li
            key={lang.tag}
            title={lang.english}
            className="rounded-md border border-[color-mix(in_srgb,var(--ed-ink)_12%,transparent)] px-2 py-1 text-[13px] text-[var(--ed-ink)]"
          >
            {lang.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] leading-relaxed text-[var(--ed-ink-soft)]">
        Recognition uses the browser’s own speech engine for each locale. The
        answer is returned in the language you chose.
      </p>

      <p className="mt-6 text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--ed-ink-soft)]">
        What it can look up
      </p>
      <ul className="mt-2 space-y-1.5 text-[13px] text-[var(--ed-ink)]">
        {ASK_ME_TOOLS.map((tool) => (
          <li key={tool.name} className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--ed-ink)]" aria-hidden />
            <span>
              <span className="font-medium">{tool.name}</span>
              <span className="text-[var(--ed-ink-soft)]"> — {tool.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </article>
  )
}

function FeedbackColumn() {
  return (
    <article className="flex flex-col border-t border-[color-mix(in_srgb,var(--ed-ink)_12%,transparent)] pt-6">
      <div className="flex items-center gap-2 text-[var(--ed-ink)]">
        <MessageSquareHeart className="size-4 shrink-0" aria-hidden />
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--ed-ink-soft)]">
          Feedback
        </p>
      </div>
      <h3 className="ed-display ed-display-sm mt-3 text-[var(--ed-ink)]">
        {FEEDBACK_CAPABILITY.title}
      </h3>
      <p className="mt-3 text-[15px] leading-[1.6] text-[var(--ed-ink-soft)]">
        {FEEDBACK_CAPABILITY.lead}
      </p>

      <ol className="mt-6 space-y-4">
        {FEEDBACK_CAPABILITY.flows.map((flow) => (
          <li
            key={flow.from + flow.to}
            className="rounded-lg border border-[color-mix(in_srgb,var(--ed-ink)_10%,transparent)] px-3 py-3"
          >
            <p className="text-[13px] font-semibold text-[var(--ed-ink)]">
              {flow.from}
              <span className="mx-1.5 font-normal text-[var(--ed-ink-soft)]">→</span>
              {flow.to}
            </p>
            <p className="mt-1 text-[13px] leading-snug text-[var(--ed-ink-soft)]">{flow.how}</p>
          </li>
        ))}
      </ol>

      <p className="mt-6 text-[13px] leading-relaxed text-[var(--ed-ink-soft)]">
        Concerns can be flagged for moderation. Action items stay attached to the
        campaign, so a follow-up does not disappear into someone’s inbox.
      </p>
    </article>
  )
}

function HealthColumn() {
  return (
    <article className="flex flex-col border-t border-[color-mix(in_srgb,var(--ed-ink)_12%,transparent)] pt-6">
      <div className="flex items-center gap-2 text-[var(--ed-ink)]">
        <Gauge className="size-4 shrink-0" aria-hidden />
        <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--ed-ink-soft)]">
          Health score
        </p>
      </div>
      <h3 className="ed-display ed-display-sm mt-3 text-[var(--ed-ink)]">
        {HEALTH_SCORE_CAPABILITY.title}
      </h3>
      <p className="mt-3 text-[15px] leading-[1.6] text-[var(--ed-ink-soft)]">
        {HEALTH_SCORE_CAPABILITY.lead}
      </p>

      <ul className="mt-6 space-y-3" aria-label="Default student metrics">
        {HEALTH_SCORE_CAPABILITY.metrics.map((metric) => (
          <li key={metric.label} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <span className="tnum text-[13px] font-semibold text-[var(--ed-ink)]">
              {metric.weight}
            </span>
            <span>
              <span className="block text-[14px] font-medium text-[var(--ed-ink)]">
                {metric.label}
              </span>
              <span className="block text-[12px] leading-snug text-[var(--ed-ink-soft)]">
                {metric.source}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {HEALTH_SCORE_CAPABILITY.optional.length > 0 ? (
        <p className="mt-4 text-[12px] leading-relaxed text-[var(--ed-ink-soft)]">
          When the module is on, transport boarding and library returns also count.
          Weights are editable per school.
        </p>
      ) : null}

      <Link
        href="/product"
        className="ed-link mt-auto pt-8 text-[14px] text-[var(--ed-ink)]"
      >
        See how modules fit together
        <ArrowUpRight className="size-[1.05em]" aria-hidden />
      </Link>
    </article>
  )
}
