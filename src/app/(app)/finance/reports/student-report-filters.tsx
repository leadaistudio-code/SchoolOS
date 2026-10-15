'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type ClassNode = { id: string; name: string; sections: { id: string; name: string }[] }

/** URL key on this page → export query key; the period dates are separate from the page's top filter. */
const EXPORT_KEYS: [string, string][] = [
  ['status', 'status'],
  ['classLevelId', 'classLevelId'],
  ['sectionId', 'sectionId'],
  ['q', 'q'],
  ['sfrom', 'from'],
  ['sto', 'to'],
]

/** Tabs, filters and export for the student lists on Fee reports. */
export function StudentReportFilters({
  classes,
  canExport,
  resultCount,
  defaultFrom,
  defaultTo,
}: {
  classes: ClassNode[]
  canExport: boolean
  resultCount: number
  defaultFrom: string
  defaultTo: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const view = params.get('view') === 'payers' ? 'payers' : 'status'
  const status = params.get('status') ?? 'all'
  const classId = params.get('classLevelId') ?? ''
  const sectionId = params.get('sectionId') ?? ''
  const sections = classes.find((c) => c.id === classId)?.sections ?? []

  const push = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`, { scroll: false })
  }
  const setParam = (key: string, value: string) => push((n) => (value ? n.set(key, value) : n.delete(key)))

  const [open, setOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const exportHref = (format: 'csv' | 'pdf') => {
    const next = new URLSearchParams({ format })
    for (const [key, as] of EXPORT_KEYS) {
      const value = params.get(key)
      if (value) next.set(as, value)
    }
    next.set('view', view)
    return `/api/v1/finance/reports/students/export?${next.toString()}`
  }

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Student fee lists" className="flex gap-1 border-b border-line">
        {[
          { key: 'status', label: 'Paid / not paid (session)' },
          { key: 'payers', label: 'Paid in a period' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={view === t.key}
            onClick={() => push((n) => {
              if (t.key === 'status') n.delete('view')
              else n.set('view', t.key)
            })}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              view === t.key ? 'border-[var(--brand-600)] font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const form = new FormData(e.currentTarget)
          push((n) => {
            for (const key of ['q', 'sfrom', 'sto']) {
              const value = String(form.get(key) ?? '').trim()
              if (value) n.set(key, value)
              else n.delete(key)
            }
          })
        }}
      >
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="sfr-q">Search</label>
          <Input id="sfr-q" name="q" defaultValue={params.get('q') ?? ''} placeholder="Student name or admission no." />
        </div>
        <div className="w-40">
          <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="sfr-class">Class</label>
          <Select
            id="sfr-class"
            value={classId}
            onChange={(e) => push((n) => {
              if (e.target.value) n.set('classLevelId', e.target.value)
              else n.delete('classLevelId')
              n.delete('sectionId')
            })}
          >
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="sfr-section">Section</label>
          <Select id="sfr-section" value={sectionId} disabled={!classId} onChange={(e) => setParam('sectionId', e.target.value)}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        {view === 'status' ? (
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="sfr-status">Status</label>
            <Select id="sfr-status" value={status} onChange={(e) => setParam('status', e.target.value === 'all' ? '' : e.target.value)}>
              <option value="all">All students</option>
              <option value="paid">Fully paid</option>
              <option value="partial">Partly paid</option>
              <option value="unpaid">Not paid</option>
              <option value="none">No fees billed</option>
            </Select>
          </div>
        ) : (
          <>
            <div className="w-40">
              <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="sfr-from">From</label>
              <Input id="sfr-from" name="sfrom" type="date" defaultValue={params.get('sfrom') ?? defaultFrom} />
            </div>
            <div className="w-40">
              <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="sfr-to">To</label>
              <Input id="sfr-to" name="sto" type="date" defaultValue={params.get('sto') ?? defaultTo} />
            </div>
          </>
        )}
        <Button type="submit" variant="secondary">Apply</Button>

        {canExport ? (
          <div className="relative ml-auto" ref={menuRef}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-haspopup="menu"
              disabled={resultCount === 0}
            >
              <Download className="size-4" aria-hidden />
              Export
              <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
            </Button>
            {open ? (
              <div role="menu" className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-[var(--shadow-pop)]">
                <p className="border-b border-line px-3 py-1.5 caption text-ink-subtle">
                  {resultCount} student{resultCount === 1 ? '' : 's'} · current filters
                </p>
                <a role="menuitem" href={exportHref('csv')} onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-ink hover:bg-surface-2">
                  CSV (Excel)
                </a>
                <a role="menuitem" href={exportHref('pdf')} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-ink hover:bg-surface-2">
                  PDF (print / save)
                </a>
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  )
}
