'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Shared current-page selection behavior for paginated data tables. */
export function useBulkSelection(ids: string[]) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const pageKey = ids.join('|')

  React.useEffect(() => {
    // A filter, sort, or page change must never carry invisible selections
    // into an unrelated bulk action.
    setSelected(new Set())
  }, [pageKey])

  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id))
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(ids))
  const clear = () => setSelected(new Set())

  return {
    selected,
    selectedIds: [...selected],
    allSelected,
    toggle,
    toggleAll,
    clear,
  }
}

export function BulkSelectionBar({
  count,
  noun,
  onClear,
  children,
}: {
  count: number
  noun: string
  onClear: () => void
  children?: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[var(--product-50)] px-3 py-2">
      <span className="mr-auto text-sm font-semibold text-[var(--product-700)]">
        {count} {noun}{count === 1 ? '' : 's'} selected
      </span>
      {children}
      <Button size="sm" variant="ghost" onClick={onClear}>
        <X aria-hidden />
        Clear
      </Button>
    </div>
  )
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value)
    return `"${text.replaceAll('"', '""')}"`
  }
  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
