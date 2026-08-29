'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Modal dialog.
 *
 * One implementation so every modal in the product closes the same way — on
 * Escape, on a backdrop click and on the close button — and so focus, scroll
 * locking and labelling are handled once rather than per screen.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}) {
  const panelRef = React.useRef<HTMLDivElement>(null)

  // Call sites pass an inline `() => setOpen(false)`, so `onClose` is a new
  // function on every render. Held in a ref, the open effect below can depend
  // on `open` alone instead of re-running — and re-stealing focus — on every
  // keystroke inside the dialog.
  const onCloseRef = React.useRef(onClose)
  React.useEffect(() => {
    onCloseRef.current = onClose
  })

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    // Focus the panel so the keyboard lands inside the dialog, not behind it —
    // unless a field has already claimed the caret with autoFocus, which is the
    // better landing spot and must not be overruled.
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-60 grid place-items-center p-4 bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'pop-in w-full max-h-[85vh] flex flex-col bg-surface border border-line rounded-[var(--radius)] shadow-[var(--shadow-pop)] outline-none',
          size === 'sm' && 'max-w-md',
          size === 'md' && 'max-w-lg',
          size === 'lg' && 'max-w-2xl',
        )}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-line">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description ? (
              <p className="text-sm text-ink-muted mt-0.5">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="size-7 grid place-items-center rounded-[var(--radius-sm)] text-ink-subtle hover:bg-surface-2 hover:text-ink shrink-0"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="px-4 py-3 min-h-0 flex-1 overflow-y-auto overflow-x-visible scroll-thin">
          {children}
        </div>

        {footer ? (
          <div className="flex items-center gap-2 px-4 py-3 border-t border-line">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
