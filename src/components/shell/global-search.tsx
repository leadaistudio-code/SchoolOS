'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

type SearchHit = {
  id: string
  type: string
  title: string
  subtitle?: string
  href: string
}

/**
 * Global search. Queries the server (debounced) rather than filtering a
 * client-side list, so it stays correct and fast as a school grows and never
 * ships records the user is not allowed to see.
 */
export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState<SearchHit[]>([])
  const [loading, setLoading] = React.useState(false)
  const [cursor, setCursor] = React.useState(0)
  const boxRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  React.useEffect(() => {
    if (query.trim().length < 2) {
      setHits([])
      return
    }
    const controller = new AbortController()
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        const json = await res.json()
        setHits(json.data ?? [])
        setCursor(0)
      } catch {
        /* aborted or offline; the input keeps working */
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [query])

  const go = (hit: SearchHit) => {
    setOpen(false)
    setQuery('')
    router.push(hit.href)
  }

  return (
    <div ref={boxRef} className="relative flex-1 max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-subtle" aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor((c) => Math.min(c + 1, hits.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((c) => Math.max(c - 1, 0))
            }
            if (e.key === 'Enter' && hits[cursor]) go(hits[cursor]!)
          }}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-search-results"
          placeholder="Search students, staff, invoices..."
          className="w-full h-9 pl-9 pr-14 rounded-full bg-surface-2 border border-line text-sm text-ink placeholder:text-ink-subtle"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-subtle border border-line rounded px-1.5 py-0.5 hidden sm:block">
          Ctrl K
        </kbd>
      </div>

      {open && query.trim().length >= 2 ? (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute z-50 mt-2 w-full max-h-96 overflow-y-auto scroll-thin rounded-[var(--radius)] border border-line bg-surface shadow-xl"
        >
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Searching...
            </div>
          ) : hits.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-ink-muted">
              No matches for <span className="text-ink font-medium">{query}</span>
            </div>
          ) : (
            hits.map((hit, i) => (
              <button
                key={`${hit.type}-${hit.id}`}
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(hit)}
                className={cn(
                  'w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-line last:border-0',
                  i === cursor && 'bg-surface-2',
                )}
              >
                <span className="text-[11px] uppercase tracking-wide text-ink-subtle w-16 shrink-0">
                  {hit.type}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-ink truncate">{hit.title}</span>
                  {hit.subtitle ? (
                    <span className="block text-[12px] text-ink-muted truncate">{hit.subtitle}</span>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
