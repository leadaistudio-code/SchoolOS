'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowUp,
  Check,
  ExternalLink,
  Mic,
  MicOff,
  Send,
  Sparkle,
  Square,
  Volume2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, IconButton } from '@/components/ui/button'
import { listen, speak, speechSupported, stopSpeaking, primeMicrophone } from './speech'
import { parseAgentEvent } from '@/lib/assistant-events'
import {
  DEFAULT_SPEECH_LANGUAGE,
  SPEECH_LANGUAGES,
  normaliseLanguageTag,
} from '@/lib/speech-languages'
import { activityForLabel } from './activity-messages'
import { AssistantWelcome } from './welcome'
import {
  readHandsfreePreference,
  useVoiceSession,
  writeHandsfreePreference,
} from './use-voice-session'
import type { AssistantBriefing } from '@/server/assistant/briefing'

type Source = { label: string; href: string }
type Draft = { id: string; kind: string; summary: string; state: 'pending' | 'sent' | 'declined' }

type Turn = {
  role: 'user' | 'assistant'
  text: string
  sources?: Source[]
  drafts?: Draft[]
  error?: string
}

export function AssistantPanel({
  open,
  onClose,
  schoolName,
}: {
  open: boolean
  onClose: () => void
  schoolName: string
}) {
  const [turns, setTurns] = React.useState<Turn[]>([])
  const [question, setQuestion] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [activity, setActivity] = React.useState<string | null>(null)
  const [manualListening, setManualListening] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [language, setLanguage] = React.useState(DEFAULT_SPEECH_LANGUAGE)
  const [briefing, setBriefing] = React.useState<AssistantBriefing | null>(null)
  const [briefingLoading, setBriefingLoading] = React.useState(false)
  const [handsfree, setHandsfree] = React.useState(true)
  const [voiceGreeting, setVoiceGreeting] = React.useState(true)
  const [greetingDone, setGreetingDone] = React.useState(false)
  const [sessionKey, setSessionKey] = React.useState(0)

  const stopManualListen = React.useRef<(() => void) | null>(null)
  const scroller = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const canSpeak = React.useMemo(() => speechSupported(), [])
  const speakAnswerRef = React.useRef<(text: string) => void>(() => {})
  const askRef = React.useRef<(text: string) => Promise<string | null>>(async () => null)

  React.useEffect(() => {
    setHandsfree(readHandsfreePreference())
  }, [])

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem('mycampusview.assistant.lang')
      if (stored) setLanguage(normaliseLanguageTag(stored))
    } catch {
      // Blocked storage: English is a reasonable place to start.
    }
  }, [])

  const chooseLanguage = (tag: string) => {
    setLanguage(tag)
    try {
      window.localStorage.setItem('mycampusview.assistant.lang', tag)
    } catch {
      // Not worth interrupting anybody over.
    }
  }

  const handleGreetingDone = React.useCallback(() => {
    setGreetingDone(true)
  }, [])

  const voice = useVoiceSession({
    enabled: handsfree && canSpeak,
    language,
    active: open,
    greetingDone,
    busy,
    onTranscript: (text) => setQuestion(text),
    onQuestion: (text) => {
      void askRef.current(text)
    },
    onStopSession: () => setHandsfree(false),
    onError: (message) => setNotice(message),
  })

  speakAnswerRef.current = voice.speakAnswer

  React.useEffect(() => {
    const node = scroller.current
    if (!node) return
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120
    if (nearBottom) node.scrollTop = node.scrollHeight
  }, [turns, activity, voice.liveTranscript])

  React.useEffect(() => {
    if (open) {
      setGreetingDone(false)
      setSessionKey((key) => key + 1)
      if (handsfree && canSpeak) voice.beginSession()
    } else {
      voice.endSession()
      stopManualListen.current?.()
      stopSpeaking()
      setManualListening(false)
    }
    return () => {
      stopManualListen.current?.()
      stopSpeaking()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setBriefingLoading(true)
    fetch('/api/v1/assistant/briefing')
      .then(async (response) => {
        if (!response.ok) throw new Error('Briefing unavailable')
        const body = (await response.json()) as { data?: AssistantBriefing }
        return body.data ?? null
      })
      .then((data) => {
        if (!cancelled) setBriefing(data)
      })
      .catch(() => {
        if (!cancelled) {
          setBriefing(null)
          setGreetingDone(true)
        }
      })
      .finally(() => {
        if (!cancelled) setBriefingLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  async function ask(text: string): Promise<string | null> {
    const trimmed = text.trim()
    if (!trimmed || busy) return null

    stopManualListen.current?.()
    setManualListening(false)
    voice.interrupt()
    setQuestion('')
    setNotice(null)
    setBusy(true)
    setActivity('Just a moment')
    voice.setProcessing()

    const history = turns
      .filter((turn) => !turn.error)
      .map((turn) => ({ role: turn.role, text: turn.text }))

    setTurns((current) => [...current, { role: 'user', text: trimmed }, { role: 'assistant', text: '' }])

    let answerText = ''

    try {
      const response = await fetch('/api/v1/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: trimmed, history, language }),
      })

      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(body?.error?.message ?? 'The assistant is unavailable right now.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const update = (change: (turn: Turn) => Turn) =>
        setTurns((current) =>
          current.map((turn, index) => (index === current.length - 1 ? change(turn) : turn)),
        )

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const event = parseAgentEvent(line)
          if (!event) continue

          switch (event.type) {
            case 'tool':
              setActivity(activityForLabel(event.label))
              break
            case 'text':
              setActivity(null)
              answerText += event.text
              update((turn) => ({ ...turn, text: turn.text + event.text }))
              break
            case 'source':
              update((turn) => ({
                ...turn,
                sources: [...(turn.sources ?? []), { label: event.label, href: event.href }],
              }))
              break
            case 'draft':
              update((turn) => ({
                ...turn,
                drafts: [
                  ...(turn.drafts ?? []),
                  { id: event.id, kind: event.kind, summary: event.summary, state: 'pending' },
                ],
              }))
              break
            case 'error':
              update((turn) => ({ ...turn, error: event.message }))
              break
            default:
              break
          }
        }
      }

      return answerText.trim() || null
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'
      setTurns((current) =>
        current.map((turn, index) =>
          index === current.length - 1 ? { ...turn, error: message } : turn,
        ),
      )
      return null
    } finally {
      setBusy(false)
      setActivity(null)
      inputRef.current?.focus()
    }
  }

  askRef.current = async (text: string) => {
    const answer = await ask(text)
    if (answer && handsfree && canSpeak) {
      speakAnswerRef.current(answer)
    } else if (handsfree && canSpeak && greetingDone) {
      voice.beginSession()
    }
    return answer
  }

  function toggleHandsfree() {
    const next = !handsfree
    setHandsfree(next)
    writeHandsfreePreference(next)
    if (next && open && greetingDone) {
      voice.beginSession()
    } else {
      voice.endSession()
    }
  }

  function toggleManualMic() {
    if (manualListening) {
      stopManualListen.current?.()
      setManualListening(false)
      return
    }
    voice.interrupt()
    setNotice(null)
    setManualListening(true)
    stopManualListen.current = listen({
      lang: language,
      onResult: ({ transcript, final }) => {
        setQuestion(transcript)
        if (final) void askRef.current(transcript)
      },
      onError: (message) => setNotice(message),
      onEnd: () => setManualListening(false),
    })
  }

  async function approve(draft: Draft, turnIndex: number) {
    setNotice(null)
    try {
      const response = await fetch('/api/v1/assistant/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draftId: draft.id }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(body?.error?.message ?? 'That could not be sent.')
      }
      setDraftState(turnIndex, draft.id, 'sent')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That could not be sent.')
    }
  }

  function setDraftState(turnIndex: number, draftId: string, state: Draft['state']) {
    setTurns((current) =>
      current.map((turn, index) =>
        index === turnIndex
          ? {
              ...turn,
              drafts: turn.drafts?.map((draft) =>
                draft.id === draftId ? { ...draft, state } : draft,
              ),
            }
          : turn,
      ),
    )
  }

  const listening = handsfree ? voice.phase === 'listening' : manualListening
  const voicePhase = busy ? 'processing' : voice.phase

  if (!open) return null

  return (
    <>
      <div
        className="assistant-backdrop fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] no-print"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="assistant-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-[30rem] flex-col border-l border-line bg-surface shadow-pop"
        role="complementary"
        aria-label="School assistant"
      >
        <header className="relative overflow-hidden border-b border-line px-4 py-4">
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[color-mix(in_srgb,var(--product-500)_14%,var(--surface))] via-surface to-surface"
            aria-hidden
          />
          <div className="relative flex items-center gap-3">
            <span
              className={cn(
                'assistant-header-icon grid size-10 place-items-center rounded-[12px] bg-gradient-to-br from-[var(--product-500)] to-[var(--product-700)] text-white shadow-md',
                voicePhase === 'listening' && 'assistant-orb-speak',
                voicePhase === 'speaking' && 'assistant-orb-speak',
              )}
            >
              <Sparkle className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">Campus Assistant</p>
              <p className="truncate text-xs text-ink-subtle">{schoolName}</p>
            </div>
            {canSpeak ? (
              <button
                type="button"
                onClick={toggleHandsfree}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors',
                  handsfree
                    ? 'border-[var(--product-400)] bg-[color-mix(in_srgb,var(--product-500)_12%,var(--surface))] text-[var(--product-700)]'
                    : 'border-line text-ink-subtle hover:text-ink',
                )}
                title={handsfree ? 'Handsfree on — speak after each answer' : 'Handsfree off'}
              >
                {handsfree ? <Mic className="size-3" /> : <MicOff className="size-3" />}
                {handsfree ? 'Handsfree' : 'Manual'}
              </button>
            ) : null}
            <IconButton label="Close assistant" onClick={onClose}>
              <X className="size-4" aria-hidden />
            </IconButton>
          </div>
        </header>

        <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {turns.length === 0 ? (
            <AssistantWelcome
              loading={briefingLoading}
              briefing={briefing}
              language={language}
              handsfree={handsfree}
              voicePhase={voicePhase}
              liveTranscript={voice.liveTranscript}
              greetingDone={greetingDone}
              onGreetingDone={handleGreetingDone}
              onSuggestion={(text) => void askRef.current(text)}
              onToggleVoiceGreeting={() => setVoiceGreeting((v) => !v)}
              voiceGreetingEnabled={voiceGreeting}
              sessionKey={sessionKey}
            />
          ) : null}

          {turns.map((turn, index) => (
            <div key={index} className={turn.role === 'user' ? 'flex justify-end' : undefined}>
              {turn.role === 'user' ? (
                <p className="max-w-[85%] rounded-[14px] bg-gradient-to-br from-[var(--product-500)] to-[var(--product-700)] px-3.5 py-2.5 text-sm text-white shadow-sm">
                  {turn.text}
                </p>
              ) : (
                <div className="space-y-3 rounded-[14px] border border-line bg-surface-2/70 px-3.5 py-3">
                  {turn.text ? (
                    <div className="space-y-2 text-sm leading-relaxed text-ink">
                      {turn.text.split('\n').map((line, lineIndex) =>
                        line.trim() ? <p key={lineIndex}>{line}</p> : null,
                      )}
                    </div>
                  ) : null}

                  {turn.error ? (
                    <p className="rounded-[10px] border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger)]">
                      {turn.error}
                    </p>
                  ) : null}

                  {turn.drafts?.map((draft) => (
                    <div
                      key={draft.id}
                      className="rounded-[10px] border border-dashed border-line-strong bg-surface-2 p-3"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.07em] text-ink-subtle">
                        {draft.state === 'sent'
                          ? 'Sent'
                          : draft.state === 'declined'
                            ? 'Discarded'
                            : 'Draft — nothing sent yet'}
                      </p>
                      <p className="mt-1.5 text-sm text-ink">{draft.summary}</p>
                      {draft.state === 'pending' ? (
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" onClick={() => void approve(draft, index)}>
                            <Check className="size-3.5" aria-hidden />
                            Send it
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDraftState(index, draft.id, 'declined')}
                          >
                            Discard
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}

                  {turn.sources?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {turn.sources.map((source) => (
                        <Link
                          key={source.href + source.label}
                          href={source.href}
                          className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                        >
                          {source.label}
                          <ExternalLink className="size-3" aria-hidden />
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {turn.text && !busy && !handsfree ? (
                    <button
                      type="button"
                      onClick={() => speak(turn.text, { lang: language })}
                      className="inline-flex items-center gap-1 text-xs text-ink-subtle transition-colors hover:text-ink"
                    >
                      <Volume2 className="size-3.5" aria-hidden />
                      Read aloud
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ))}

          {activity ? (
            <p className="flex items-center gap-2 text-sm text-ink-subtle" aria-live="polite">
              <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="size-1.5 animate-pulse rounded-full bg-[var(--product-500)]"
                    style={{ animationDelay: `${dot * 150}ms` }}
                  />
                ))}
              </span>
              {activity}…
            </p>
          ) : null}

          {handsfree && voice.liveTranscript && turns.length > 0 ? (
            <p className="text-sm italic text-ink-muted" aria-live="polite">
              {voice.liveTranscript}
            </p>
          ) : null}
        </div>

        {notice ? (
          <p className="border-t border-line bg-[var(--warning-bg)] px-4 py-2 text-xs text-[var(--warning)]">
            {notice}
          </p>
        ) : null}

        <form
          className="border-t border-line p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void askRef.current(question)
          }}
        >
          <div className="flex items-end gap-2 rounded-[12px] border border-line bg-surface px-2 py-1.5 focus-within:border-[var(--product-500)]">
            <label className="sr-only" htmlFor="assistant-input">
              Your question
            </label>
            <textarea
              id="assistant-input"
              ref={inputRef}
              rows={1}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void askRef.current(question)
                }
              }}
              placeholder={
                listening ? 'Listening…' : 'Ask about fees, attendance, students…'
              }
              className="max-h-28 min-h-8 flex-1 resize-none bg-transparent px-1 py-1 text-sm text-ink outline-none placeholder:text-ink-subtle"
            />

            {canSpeak ? (
              <select
                value={language}
                onChange={(e) => chooseLanguage(e.target.value)}
                aria-label="Language to speak in"
                title="Language to speak and hear answers in"
                className="h-8 shrink-0 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-1.5 text-xs text-ink-muted"
              >
                {SPEECH_LANGUAGES.map((option) => (
                  <option key={option.tag} value={option.tag}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : null}

            {canSpeak && !handsfree ? (
              <IconButton
                label={manualListening ? 'Stop listening' : 'Ask by voice'}
                onClick={toggleManualMic}
                variant={manualListening ? 'danger' : 'ghost'}
                type="button"
              >
                {manualListening ? (
                  <Square className="size-4" aria-hidden />
                ) : (
                  <Mic className="size-4" aria-hidden />
                )}
              </IconButton>
            ) : null}

            <IconButton
              label="Send question"
              type="submit"
              variant="primary"
              disabled={!question.trim() || busy}
            >
              {busy ? (
                <ArrowUp className="size-4 animate-pulse" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
            </IconButton>
          </div>

          <p className="mt-2 px-1 text-[11px] leading-snug text-ink-subtle">
            {canSpeak
              ? handsfree
                ? 'Handsfree mode: speak your question, hear the answer, then speak again. Say "stop" or "thank you" to end. Voice is transcribed by your browser. '
                : 'Voice uses your browser\'s speech recognition. '
              : 'Voice input needs Chrome or Edge. '}
            Answers link to the record they came from — always worth checking.
          </p>
        </form>
      </aside>
    </>
  )
}

/** The launcher. Lives in the header; opens the panel. */
export function AssistantLauncher({ schoolName }: { schoolName: string }) {
  const [open, setOpen] = React.useState(false)
  const [hasUrgent, setHasUrgent] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/v1/assistant/briefing')
      .then(async (response) => {
        if (!response.ok) return null
        const body = (await response.json()) as { data?: AssistantBriefing }
        return body.data ?? null
      })
      .then((data) => {
        if (!cancelled && data) setHasUrgent(data.hasUrgent)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        void primeMicrophone()
        setOpen((current) => !current)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => {
          void primeMicrophone()
          setOpen(true)
        }}
        className={cn(
          'assistant-launcher relative inline-flex items-center gap-1.5 rounded-[10px] border border-line px-2.5 py-1.5',
          'text-xs font-medium text-ink-muted transition-all hover:border-[var(--product-400)] hover:bg-[color-mix(in_srgb,var(--product-500)_8%,var(--surface))] hover:text-ink',
          open &&
            'border-[var(--product-400)] bg-[color-mix(in_srgb,var(--product-500)_10%,var(--surface))] text-ink',
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Sparkle className="size-3.5 text-[var(--product-600)]" aria-hidden />
        Ask Me
        {hasUrgent ? (
          <span
            className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[var(--danger)] ring-2 ring-surface"
            aria-label="Items need attention"
          />
        ) : null}
        <kbd className="hidden rounded border border-line px-1 text-[10px] text-ink-subtle sm:inline">
          ⌘K
        </kbd>
      </button>
      <AssistantPanel open={open} onClose={() => setOpen(false)} schoolName={schoolName} />
    </>
  )
}
