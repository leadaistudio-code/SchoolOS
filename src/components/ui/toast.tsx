'use client'

import * as React from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'success' | 'error' | 'info'
type Toast = { id: number; title: string; description?: string; tone: Tone }

const ToastContext = React.createContext<{
  push: (t: Omit<Toast, 'id'>) => void
} | null>(null)

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const nextId = React.useRef(1)

  const push = React.useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId.current++
    setToasts((prev) => [...prev, { ...t, id }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5200)
  }, [])

  const dismiss = (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id))

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        className="fixed z-100 bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 pointer-events-none"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pop-in pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius)] border bg-surface shadow-[var(--shadow-pop)] px-3 py-2.5 sm:w-88',
              t.tone === 'success' && 'border-[color-mix(in_srgb,var(--success)_35%,transparent)]',
              t.tone === 'error' && 'border-[color-mix(in_srgb,var(--danger)_35%,transparent)]',
              t.tone === 'info' && 'border-line',
            )}
          >
            <span
              className={cn(
                'mt-0.5',
                t.tone === 'success' && 'text-success',
                t.tone === 'error' && 'text-[var(--danger)]',
                t.tone === 'info' && 'text-info',
              )}
            >
              {t.tone === 'success' ? (
                <CheckCircle2 className="size-4" aria-hidden />
              ) : t.tone === 'error' ? (
                <XCircle className="size-4" aria-hidden />
              ) : (
                <Info className="size-4" aria-hidden />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-ink">{t.title}</p>
              {t.description ? (
                <p className="text-sm text-ink-muted mt-0.5">{t.description}</p>
              ) : null}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-ink-subtle hover:text-ink"
              aria-label="Dismiss notification"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
