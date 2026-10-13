'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type ClassNode = {
  id: string
  name: string
  sections: { id: string; name: string }[]
}

const EXPORTS = [
  { format: 'xlsx', label: 'Excel (.xlsx)', target: '_self' as const },
  { format: 'csv', label: 'CSV', target: '_self' as const },
  { format: 'tally', label: 'Tally (CSV)', target: '_self' as const },
  { format: 'pdf', label: 'PDF (print / save)', target: '_blank' as const },
] as const

export function LedgerFilters({
  classes,
  canExport,
  resultCount,
}: {
  classes: ClassNode[]
  canExport: boolean
  resultCount: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const q = params.get('q') ?? ''
  const classId = params.get('classLevelId') ?? ''
  const sectionId = params.get('sectionId') ?? ''
  const balance = params.get('balance') ?? 'all'
  const sections = classes.find((c) => c.id === classId)?.sections ?? []

  const push = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString())
    mutate(next)
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`)
  }

  // When on Outstanding tab, keep view=outstanding and force balance=due in exports.
  const viewOutstanding = params.get('view') === 'outstanding'
  const effectiveBalance = viewOutstanding ? 'due' : balance

  const [open, setOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const exportHref = (format: string) => {
    const next = new URLSearchParams()
    next.set('format', format)
    if (q) next.set('q', q)
    if (classId) next.set('classLevelId', classId)
    if (sectionId) next.set('sectionId', sectionId)
    if (effectiveBalance && effectiveBalance !== 'all') next.set('balance', effectiveBalance)
    return `/api/v1/finance/ledger/export?${next.toString()}`
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-end gap-2"
        action={pathname}
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          push((next) => {
            const search = String(form.get('q') ?? '').trim()
            if (search) next.set('q', search)
            else next.delete('q')
          })
        }}
      >
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="ledger-q">
            Search
          </label>
          <Input
            id="ledger-q"
            name="q"
            defaultValue={q}
            placeholder="Name, admission no., parent or mobile"
            aria-label="Search student fee accounts"
          />
        </div>

        <div className="w-40">
          <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="ledger-class">
            Class
          </label>
          <Select
            id="ledger-class"
            value={classId}
            aria-label="Filter by class"
            onChange={(e) =>
              push((next) => {
                if (e.target.value) next.set('classLevelId', e.target.value)
                else next.delete('classLevelId')
                next.delete('sectionId')
              })
            }
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-36">
          <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="ledger-section">
            Section
          </label>
          <Select
            id="ledger-section"
            value={sectionId}
            aria-label="Filter by section"
            disabled={!classId}
            onChange={(e) =>
              push((next) =>
                e.target.value ? next.set('sectionId', e.target.value) : next.delete('sectionId'),
              )
            }
          >
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-40">
          <label className="mb-1 block text-xs font-medium text-ink-muted" htmlFor="ledger-balance">
            Balance
          </label>
          <Select
            id="ledger-balance"
            value={effectiveBalance}
            aria-label="Filter by balance"
            onChange={(e) =>
              push((next) => {
                next.delete('view')
                if (e.target.value && e.target.value !== 'all') next.set('balance', e.target.value)
                else next.delete('balance')
              })
            }
          >
            <option value="all">All</option>
            <option value="due">Due (balance &gt; 0)</option>
            <option value="clear">Cleared (0)</option>
            <option value="credit">Credit (balance &lt; 0)</option>
          </Select>
        </div>

        <Button type="submit" variant="secondary">
          Apply
        </Button>

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
              <ChevronDown
                className={cn('size-3.5 transition-transform', open && 'rotate-180')}
                aria-hidden
              />
            </Button>
            {open ? (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-[var(--shadow-pop)]"
              >
                <p className="border-b border-line px-3 py-1.5 caption text-ink-subtle">
                  {resultCount} student{resultCount === 1 ? '' : 's'} · current filters
                </p>
                {EXPORTS.map((item) => (
                  <a
                    key={item.format}
                    role="menuitem"
                    href={exportHref(item.format)}
                    target={item.target}
                    rel={item.target === '_blank' ? 'noreferrer' : undefined}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 text-sm text-ink hover:bg-surface-2"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    </div>
  )
}
