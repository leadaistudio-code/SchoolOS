'use client'

import * as React from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

type Mode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'mycampusview-theme'

function apply(mode: Mode) {
  const root = document.documentElement
  const dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.setAttribute('data-theme', dark ? 'dark' : 'light')
}

export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = React.useState<Mode>('system')

  React.useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? 'system'
    setMode(stored)
    apply(stored)
  }, [])

  const choose = (next: Mode) => {
    setMode(next)
    localStorage.setItem(STORAGE_KEY, next)
    apply(next)
  }

  const options: { value: Mode; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <Sun className="size-3.5" />, label: 'Light' },
    { value: 'dark', icon: <Moon className="size-3.5" />, label: 'Dark' },
    { value: 'system', icon: <Monitor className="size-3.5" />, label: 'System' },
  ]

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-[var(--radius-sm)] border border-line bg-surface p-px',
        className,
      )}
      role="group"
      aria-label="Colour theme"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => choose(o.value)}
          aria-pressed={mode === o.value}
          title={o.label}
          className={cn(
            'size-6.5 grid place-items-center rounded-[4px] transition-colors',
            mode === o.value
              ? 'bg-surface-3 text-ink'
              : 'text-ink-subtle hover:text-ink',
          )}
        >
          {o.icon}
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/** Applies the stored theme before paint to avoid a flash of the wrong mode. */
export function ThemeScript() {
  const js = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}')||'system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})()`
  return <script dangerouslySetInnerHTML={{ __html: js }} />
}
