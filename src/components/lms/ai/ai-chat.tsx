'use client'

import * as React from 'react'
import { Bot, Check, Loader2, Send, ShieldCheck, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ActivityCard, Feedback, Pill } from '../robotics/activity-kit'
import { useLessonState } from '../robotics/lesson-state'
import { useAskAi } from './chat-context'
import { useResult, type Of } from './use-result'

const MAX_CHARS = 400
const GOAL = 3

type Message = { role: 'user' | 'assistant'; text: string }
type Saved = { replies: number; missions: string[] }

const MISSIONS: { id: string; label: string; starter: string; test: (text: string, hadReply: boolean) => boolean }[] = [
  {
    id: 'explain',
    label: 'Ask a clear question about something you are learning (say what, how long and who for)',
    starter: 'Explain in 3 short points how plants make food, for a Class 6 student.',
    test: (t) => t.split(/\s+/).length >= 8,
  },
  {
    id: 'quiz',
    label: 'Ask it to quiz you',
    starter: 'Quiz me with 3 questions on fractions, then tell me the answers.',
    test: (t) => /\b(quiz|questions?|test me)\b/i.test(t),
  },
  {
    id: 'simpler',
    label: 'Ask a follow-up: make it simpler or give an example',
    starter: 'Can you explain that more simply, with an example?',
    test: (t, hadReply) => hadReply && /\b(simpl\w*|easier|example|again|explain more)\b/i.test(t),
  },
]

export function AiChat({ block }: { block: Of<'ai-chat'> }) {
  const ask = useAskAi()
  const { result, record } = useResult(block.id)
  const { get, set } = useLessonState()
  const saved = get<Saved>(`chat:${block.id}`, { replies: 0, missions: [] })
  const [messages, setMessages] = React.useState<Message[]>([])
  const [draft, setDraft] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [notice, setNotice] = React.useState<{ tone: 'wrong' | 'info'; text: string } | null>(null)
  const [remaining, setRemaining] = React.useState<number | null>(null)
  const list = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  async function send(text: string) {
    const t = text.trim()
    if (!t || pending || !ask) return
    setNotice(null)
    setPending(true)
    const hadReply = messages.some((m) => m.role === 'assistant')
    const next = [...messages, { role: 'user' as const, text: t }]
    try {
      const r = await ask({ messages: next })
      if (!r.ok) {
        setNotice({ tone: r.reason === 'personal' || r.reason === 'unsafe' ? 'wrong' : 'info', text: r.message })
        return
      }
      setMessages([...next, { role: 'assistant', text: r.reply }])
      setDraft('')
      setRemaining(r.remaining)
      const missions = new Set(saved.missions)
      for (const m of MISSIONS) if (m.test(t, hadReply)) missions.add(m.id)
      const s: Saved = { replies: saved.replies + 1, missions: [...missions] }
      set(`chat:${block.id}`, s)
      if (s.replies >= GOAL && !result?.done) record({ done: true, score: Math.round((s.missions.length / MISSIONS.length) * 100) })
    } catch {
      setNotice({ tone: 'info', text: 'The study helper is not available right now. Try again in a minute.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <ActivityCard kicker="Live AI lab" title="Chat with the study helper" done={result?.done}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <div ref={list} className="h-80 space-y-3 overflow-y-auto rounded-[var(--radius)] border border-line bg-surface-2 p-3" aria-live="polite" aria-label="Conversation">
            {messages.length === 0 ? (
              <p className="flex items-start gap-2 text-sm text-ink-muted">
                <Bot className="mt-0.5 size-4 shrink-0" aria-hidden />
                Hi! I am an AI study helper. Ask me to explain something, quiz you, or help you think. I can make mistakes, so check important facts.
              </p>
            ) : null}
            {messages.map((m, i) => (
              <div key={i} className={cn('flex gap-2', m.role === 'user' && 'flex-row-reverse')}>
                <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', m.role === 'user' ? 'bg-ink text-white' : 'bg-[var(--brand-500)] text-white')} aria-hidden>
                  {m.role === 'user' ? <User className="size-4" /> : <Bot className="size-4" />}
                </span>
                <p className={cn('max-w-[85%] whitespace-pre-wrap rounded-[var(--radius)] px-3 py-2 text-sm', m.role === 'user' ? 'bg-ink text-white' : 'border border-line bg-surface text-ink')}>
                  <span className="sr-only">{m.role === 'user' ? 'You: ' : 'Study helper: '}</span>
                  {m.text}
                </p>
              </div>
            ))}
            {pending ? (
              <p className="flex items-center gap-2 text-sm text-ink-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Checking your message and thinking…
              </p>
            ) : null}
          </div>
          {ask ? (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void send(draft)
              }}
            >
              <label htmlFor={`${block.id}-msg`} className="sr-only">
                Your message
              </label>
              <input
                id={`${block.id}-msg`}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value.slice(0, MAX_CHARS))
                  setNotice(null)
                }}
                placeholder="Ask a clear question…"
                autoComplete="off"
                className="min-h-10 min-w-0 flex-1 rounded-[var(--radius)] border border-line bg-surface px-3 text-sm"
              />
              <Button type="submit" loading={pending} disabled={!draft.trim()}>
                <Send /> Send
              </Button>
            </form>
          ) : (
            <Feedback tone="info">The study helper runs for students on the course and in the school’s lesson preview. It is not available here.</Feedback>
          )}
          {notice ? <Feedback tone={notice.tone}>{notice.text}</Feedback> : null}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-subtle">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            Messages are safety-checked and not saved. {remaining !== null ? `${remaining} messages left today.` : 'You can send a limited number each day.'}
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Missions</p>
          <ul className="space-y-2">
            {MISSIONS.map((m) => {
              const done = saved.missions.includes(m.id)
              return (
                <li key={m.id} className={cn('rounded-[var(--radius)] border border-line p-2', done && 'border-[var(--success)] bg-success-bg')}>
                  <p className="flex items-start gap-1.5">
                    <Check className={cn('mt-0.5 size-4 shrink-0', done ? 'text-success' : 'opacity-20')} aria-hidden /> {m.label}
                  </p>
                  {ask && !done ? (
                    <Pill className="mt-1.5 min-h-7 text-xs" onClick={() => setDraft(m.starter)}>
                      Use an example
                    </Pill>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-ink-muted">
            Answers received: {Math.min(saved.replies, GOAL)} of {GOAL}
          </p>
          {result?.done ? <Feedback tone="right">Nice prompting! Remember: the helper predicts words. It sounds sure even when it is wrong, so check facts.</Feedback> : null}
        </div>
      </div>
    </ActivityCard>
  )
}
