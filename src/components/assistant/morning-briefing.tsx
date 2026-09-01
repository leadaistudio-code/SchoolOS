'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { Volume2, X } from 'lucide-react'
import { speak, stopSpeaking, primeMicrophone } from './speech'
import type { AssistantBriefing } from '@/server/assistant/briefing'

const MORNING_KEY = 'mycampusview.assistant.morning.date'
const MORNING_AUTO_KEY = 'mycampusview.assistant.morning.auto'

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Once per day on the dashboard, offer (or auto-play) the spoken morning briefing.
 */
export function MorningBriefingPrompt({ onOpenAssistant }: { onOpenAssistant: () => void }) {
  const pathname = usePathname()
  const [briefing, setBriefing] = React.useState<AssistantBriefing | null>(null)
  const [visible, setVisible] = React.useState(false)
  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    if (pathname !== '/') return
    try {
      if (window.localStorage.getItem(MORNING_KEY) === todayKey()) return
    } catch {
      return
    }

    let cancelled = false
    fetch('/api/v1/assistant/briefing')
      .then(async (response) => {
        if (!response.ok) throw new Error('offline')
        const body = (await response.json()) as { data?: AssistantBriefing }
        return body.data ?? null
      })
      .then((data) => {
        if (cancelled || !data) return
        setBriefing(data)
        setVisible(true)

        let auto = true
        try {
          auto = window.localStorage.getItem(MORNING_AUTO_KEY) !== 'false'
        } catch {
          // default on
        }
        if (auto) {
          void primeMicrophone()
          speak(data.greeting.spoken, {
            lang: 'en-IN',
            onEnd: () => {
              try {
                window.localStorage.setItem(MORNING_KEY, todayKey())
              } catch {
                // ignore
              }
            },
          })
        }
      })
      .catch(() => {
        // Offline or unavailable — no morning prompt.
      })

    return () => {
      cancelled = true
    }
  }, [pathname])

  if (!visible || dismissed || !briefing) return null

  return (
    <div className="assistant-morning fixed bottom-20 left-1/2 z-40 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[14px] border border-line bg-surface p-4 shadow-pop no-print">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--product-500)_14%,var(--surface))] text-[var(--product-600)]">
          <Volume2 className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Morning briefing</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{briefing.greeting.spoken}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-[var(--product-600)] px-3 py-1 text-xs font-medium text-white"
              onClick={() => {
                try {
                  window.localStorage.setItem(MORNING_KEY, todayKey())
                } catch {
                  // ignore
                }
                onOpenAssistant()
                setDismissed(true)
              }}
            >
              Open Ask Me
            </button>
            <button
              type="button"
              className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted"
              onClick={() => {
                stopSpeaking()
                try {
                  window.localStorage.setItem(MORNING_KEY, todayKey())
                  window.localStorage.setItem(MORNING_AUTO_KEY, 'false')
                } catch {
                  // ignore
                }
                setDismissed(true)
              }}
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="text-ink-subtle hover:text-ink"
          onClick={() => {
            stopSpeaking()
            try {
              window.localStorage.setItem(MORNING_KEY, todayKey())
            } catch {
              // ignore
            }
            setDismissed(true)
          }}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
