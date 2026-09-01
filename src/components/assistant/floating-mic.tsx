'use client'

import * as React from 'react'
import { Mic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { readHandsfreePreference } from './use-voice-session'
import type { VoiceSessionPhase } from './use-voice-session'

export function AssistantFloatingMic({
  open,
  handsfree,
  phase,
  speechActive,
  onOpen,
}: {
  open: boolean
  handsfree: boolean
  phase: VoiceSessionPhase
  speechActive: boolean
  onOpen: () => void
}) {
  const [enabled, setEnabled] = React.useState(true)

  React.useEffect(() => {
    setEnabled(readHandsfreePreference())
  }, [])

  if (!enabled || !handsfree || open) return null

  const listening = phase === 'listening' || phase === 'speaking'

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open Ask Me and listen"
      className={cn(
        'assistant-floating-mic fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-full',
        'border border-[var(--product-400)] bg-gradient-to-br from-[var(--product-500)] to-[var(--product-700)] text-white shadow-pop',
        listening && 'assistant-orb-speak',
        speechActive && 'assistant-floating-mic-active',
      )}
    >
      <Mic className="size-6" aria-hidden />
      {speechActive ? (
        <span className="assistant-wave absolute -bottom-1 flex gap-0.5" aria-hidden>
          {[0, 1, 2].map((bar) => (
            <span
              key={bar}
              className="assistant-wave-bar h-2 w-0.5 rounded-full bg-white/90"
              style={{ animationDelay: `${bar * 80}ms` }}
            />
          ))}
        </span>
      ) : null}
    </button>
  )
}
