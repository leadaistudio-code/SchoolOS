'use client'

import * as React from 'react'
import { ChevronDown, Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReportDefinition } from '@/lib/reports'
import { cn } from '@/lib/utils'

/**
 * Export and print.
 *
 * A report page usually holds several tables and only one of them is the one
 * somebody needs in a spreadsheet, so the menu names them individually rather
 * than dumping the page. Each entry is a plain link to the export endpoint —
 * the browser handles the download, and the file is generated from the same
 * query the page rendered from, with the same window and filters.
 */
export function ExportMenu({
  report,
  range,
  extraQuery,
}: {
  report: ReportDefinition
  range?: { from: string; to: string }
  extraQuery?: Record<string, string | undefined>
}) {
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
    const params = new URLSearchParams({ report: report.key, table })
    if (range) {
      params.set('from', range.from)
      params.set('to', range.to)
    }
    for (const [key, value] of Object.entries(extraQuery ?? {})) {
      if (value) params.set(key, value)
    }
    return `/api/v1/reports/export?${params.toString()}`
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={() => window.print()} className="no-print">
        <Printer className="size-4" aria-hidden />
        Print
      </Button>

      <div className="relative no-print" ref={ref}>
        <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Download className="size-4" aria-hidden />
          Export CSV
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        </Button>

        {open ? (
          <div className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-[var(--shadow-pop)]">
            <p className="border-b border-line px-3 py-1.5 caption text-ink-subtle">
              Download as spreadsheet
            </p>
            {report.exports.map((table) => (
              <a
                key={table.key}
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
    </div>
  )
}
