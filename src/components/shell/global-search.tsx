'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CornerDownLeft, Loader2, Search } from 'lucide-react'
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

  const groups = React.useMemo(() => {
    const byType = new Map<string, SearchHit[]>()
    for (const hit of hits) {
      byType.set(hit.type, [...(byType.get(hit.type) ?? []), hit])
    }
    // The flat index the cursor walks has to match the render order, so it is
    // rebuilt from the grouping rather than from the raw response.
    let index = 0
    return [...byType.entries()].map(([type, rows]) => ({
      type,
      rows: rows.map((hit) => ({ hit, index: index++ })),
    }))
  }, [hits])

  const ordered = React.useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.hit)), [groups])

  const go = (hit: SearchHit) => {
    setOpen(false)
    setQuery('')
    router.push(hit.href)
  }

  return (
    <div ref={boxRef} className="relative max-w-md flex-1">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-ink-subtle pointer-events-none" aria-hidden />
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
              setCursor((c) => Math.min(c + 1, ordered.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((c) => Math.max(c - 1, 0))
            }
            if (e.key === 'Enter' && ordered[cursor]) go(ordered[cursor]!)
            if (e.key === 'Home') {
              e.preventDefault()
              setCursor(0)
            }
            if (e.key === 'End') {
              e.preventDefault()
              setCursor(Math.max(0, ordered.length - 1))
            }
          }}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="global-search-results"
          placeholder="Search students, staff, fees, admissions..."
          className="h-9 w-full rounded-[10px] border border-line bg-surface-2 pl-8 pr-16 text-base text-ink transition-colors placeholder:text-ink-subtle focus:border-[var(--product-500)] focus:bg-surface"
        />
        <kbd className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-[4px] border border-line px-1 text-xs text-ink-subtle sm:block">
          Ctrl K
        </kbd>
      </div>

      {open && query.trim().length >= 2 ? (
        <div
          id="global-search-results"
          role="listbox"
          className="pop-in scroll-thin absolute z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-[var(--radius)] border border-line bg-surface py-1 shadow-[var(--shadow-pop)]"
        >
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Searching
            </div>
          ) : hits.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-ink-muted">
              No matches for <span className="text-ink font-medium">{query}</span>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.type} role="group" aria-label={group.type}>
                <p className="caption sticky top-0 bg-surface px-3 py-1.5">{group.type}</p>
                {group.rows.map(({ hit, index }) => (
                  <button
                    key={`${hit.type}-${hit.id}`}
                    role="option"
                    aria-selected={index === cursor}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => go(hit)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                      index === cursor ? 'bg-[var(--product-50)]' : 'hover:bg-surface-2',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{hit.title}</span>
                      {hit.subtitle ? (
                        <span className="block truncate text-xs text-ink-subtle">{hit.subtitle}</span>
                      ) : null}
                    </span>
                    {index === cursor ? (
                      <CornerDownLeft className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                    ) : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
