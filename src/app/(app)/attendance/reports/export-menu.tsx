'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const EXPORTS = [
  { key: 'summary', label: 'Student summary' },
  { key: 'daily', label: 'Day-by-day records' },
] as const

/**
 * CSV downloads for the attendance report.
 *
 * Plain links to the export API so the browser handles the file. Query params
 * come from the current filters, so the spreadsheet matches what is on screen.
 */
export function AttendanceExportMenu({ from, to }: { from: string; to: string }) {
  const searchParams = useSearchParams()
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
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

  const href = (table: string) => {
    const params = new URLSearchParams()
    params.set('from', searchParams.get('from') ?? from)
    params.set('to', searchParams.get('to') ?? to)
    params.set('table', table)
    const classLevelId = searchParams.get('classLevelId')
    const sectionId = searchParams.get('sectionId')
    if (classLevelId) params.set('classLevelId', classLevelId)
    if (sectionId) params.set('sectionId', sectionId)
    return `/api/v1/attendance/report/export?${params.toString()}`
  }

  return (
    <div className="relative ml-auto" ref={ref}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Download className="size-4" aria-hidden />
        Export CSV
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
      </Button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-[var(--shadow-pop)]"
        >
          <p className="border-b border-line px-3 py-1.5 caption text-ink-subtle">
            Download as spreadsheet
          </p>
          {EXPORTS.map((table) => (
            <a
              key={table.key}
              role="menuitem"
              href={href(table.key)}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-ink hover:bg-surface-2"
            >
              {table.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}
