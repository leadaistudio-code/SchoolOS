'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkle, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/shell/icon'
import { speak, stopSpeaking } from './speech'
import type { AssistantActionItem, AssistantBriefing } from '@/server/assistant/briefing'
import type { VoiceSessionPhase } from './use-voice-session'

function AssistantOrb({ phase }: { phase: VoiceSessionPhase }) {
  const speaking = phase === 'speaking'
  const listening = phase === 'listening'
  const thinking = phase === 'processing'

  return (
    <div className="relative mx-auto size-20" aria-hidden>
      <span
        className={cn(
          'absolute inset-0 rounded-full bg-gradient-to-br from-[var(--product-400)] via-[var(--product-600)] to-[var(--chart-admissions)] opacity-80 blur-md transition-opacity',
          (speaking || listening || thinking) && 'opacity-100 animate-pulse',
        )}
      />
      <span
        className={cn(
          'absolute inset-1 rounded-full bg-gradient-to-br from-[var(--product-500)] to-[var(--product-700)] shadow-lg transition-transform',
          speaking && 'assistant-orb-speak',
          listening && 'scale-105',
          thinking && 'assistant-orb-think',
        )}
      />
      <span className="absolute inset-0 grid place-items-center">
        <Sparkle className="size-8 text-white drop-shadow-sm" />
      </span>
      {speaking || listening ? (
        <span className="assistant-wave absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
          {[0, 1, 2, 3, 4].map((bar) => (
            <span
              key={bar}
              className="assistant-wave-bar w-0.5 rounded-full bg-[var(--product-500)]"
              style={{ animationDelay: `${bar * 90}ms` }}
            />
          ))}
        </span>
      ) : null}
    </div>
  )
}

function ActionCard({
  item,
  index,
  onNavigate,
}: {
  item: AssistantActionItem
  index: number
  onNavigate: () => void
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'assistant-action-card group flex items-start gap-3 rounded-[14px] border px-3.5 py-3 transition-all',
        item.urgent
          ? 'border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_6%,var(--surface))]'
          : 'border-line bg-surface-2/80 hover:border-line-strong hover:bg-surface',
      )}
      style={{ animationDelay: `${180 + index * 90}ms` }}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-[10px] transition-transform duration-200 group-hover:scale-105',
          item.urgent ? 'bg-danger-bg text-[var(--danger)]' : 'bg-[var(--product-50)] text-[var(--product-600)]',
        )}
      >
        <Icon name={item.icon} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink">{item.label}</span>
          {item.count > 0 ? (
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tnum',
                item.urgent
                  ? 'bg-[var(--danger)] text-white'
                  : 'bg-surface-3 text-ink-muted',
              )}
            >
              {item.count}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{item.detail}</span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-ink-subtle opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
        aria-hidden
      />
    </Link>
  )
}

export function AssistantWelcome({
  loading,
  briefing,
  language,
  handsfree,
  voicePhase,
  liveTranscript,
  greetingDone,
  onGreetingDone,
  onSuggestion,
  onToggleVoiceGreeting,
  voiceGreetingEnabled,
}: {
  loading: boolean
  briefing: AssistantBriefing | null
  language: string
  handsfree: boolean
  voicePhase: VoiceSessionPhase
  liveTranscript: string
  greetingDone: boolean
  onGreetingDone: () => void
  onSuggestion: (text: string) => void
  onToggleVoiceGreeting: () => void
  voiceGreetingEnabled: boolean
}) {
  const [typedHeadline, setTypedHeadline] = React.useState('')
  const [typingDone, setTypingDone] = React.useState(false)
  const spokenRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (loading) return
    if (!briefing) {
      setTypedHeadline('')
      setTypingDone(false)
      onGreetingDone()
      return
    }

    const full = briefing.greeting.headline
    setTypedHeadline('')
    setTypingDone(false)
    let index = 0
    const timer = window.setInterval(() => {
      index += 1
      setTypedHeadline(full.slice(0, index))
      if (index >= full.length) {
        window.clearInterval(timer)
        setTypingDone(true)
      }
    }, 28)

    return () => window.clearInterval(timer)
  }, [briefing, loading, onGreetingDone])

  React.useEffect(() => {
    if (loading) return
    if (!briefing || !voiceGreetingEnabled) {
      onGreetingDone()
      return
    }
    if (spokenRef.current === briefing.greeting.spoken) return
    spokenRef.current = briefing.greeting.spoken

    stopSpeaking()
    const cancel = speak(briefing.greeting.spoken, {
      lang: language,
      onEnd: onGreetingDone,
      onStart: () => {},
    })
    return () => {
      cancel()
    }
  }, [briefing, loading, language, voiceGreetingEnabled, onGreetingDone])

  const suggestions =
    briefing?.followUpPrompts?.length ? briefing.followUpPrompts : [
      'What fees are pending?',
      'Whose attendance is missing today?',
      'Summarise today for me',
    ]

  const phaseLabel =
    voicePhase === 'listening'
      ? liveTranscript || 'Listening…'
      : voicePhase === 'processing'
        ? 'Just a moment…'
        : voicePhase === 'speaking'
          ? 'Speaking…'
          : handsfree && greetingDone
            ? 'Say something, or tap the mic'
            : null

  if (loading) {
    return (
      <div className="assistant-welcome flex flex-col items-center px-2 py-8 text-center">
        <AssistantOrb phase="processing" />
        <p className="mt-5 text-sm text-ink-muted">Getting your briefing ready…</p>
      </div>
    )
  }

  if (!briefing) {
    return (
      <div className="rounded-[14px] border border-line bg-surface-2 px-4 py-6 text-center text-sm text-ink-muted">
        Could not load your briefing. You can still ask a question below.
      </div>
    )
  }

  const { greeting, actionItems } = briefing

  return (
    <div className="assistant-welcome space-y-5">
      <div className="relative overflow-hidden rounded-[16px] border border-line bg-gradient-to-br from-[color-mix(in_srgb,var(--product-500)_12%,var(--surface))] via-surface to-[color-mix(in_srgb,var(--chart-admissions)_10%,var(--surface))] px-4 py-5">
        <div className="relative flex flex-col items-center text-center">
          <AssistantOrb phase={voicePhase === 'idle' && handsfree ? 'listening' : voicePhase} />
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--product-600)]">
            Campus Assistant
          </p>
          <h2 className="mt-1 min-h-[1.75rem] text-xl font-semibold text-ink">
            {typedHeadline}
            {!typingDone ? (
              <span className="assistant-cursor ml-0.5 inline-block h-5 w-0.5 align-middle bg-[var(--product-500)]" />
            ) : null}
          </h2>
          <p className="mt-2 max-w-[18rem] text-sm leading-relaxed text-ink-muted">
            {greeting.subline}
          </p>
          {phaseLabel ? (
            <p
              className={cn(
                'mt-3 max-w-[20rem] text-sm',
                voicePhase === 'listening' && liveTranscript
                  ? 'font-medium text-ink'
                  : 'text-ink-subtle italic',
              )}
              aria-live="polite"
            >
              {phaseLabel}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onToggleVoiceGreeting}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/80 px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {voiceGreetingEnabled ? (
              <>
                <Volume2 className="size-3.5" aria-hidden />
                Voice on
              </>
            ) : (
              <>
                <VolumeX className="size-3.5" aria-hidden />
                Voice off
              </>
            )}
          </button>
        </div>
      </div>

      <div>
        <p className="caption mb-2.5">Today&apos;s priorities</p>
        <div className="space-y-2">
          {actionItems.map((item, index) => (
            <ActionCard
              key={item.id}
              item={item}
              index={index}
              onNavigate={() => stopSpeaking()}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="caption mb-2">Try asking</p>
        <ul className="space-y-2">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => onSuggestion(suggestion)}
                className="assistant-suggestion w-full rounded-[12px] border border-line bg-surface px-3 py-2.5 text-left text-sm text-ink-muted transition-all hover:border-[var(--product-400)] hover:bg-[color-mix(in_srgb,var(--product-500)_6%,var(--surface))] hover:text-ink"
                style={{ animationDelay: `${420 + index * 70}ms` }}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
