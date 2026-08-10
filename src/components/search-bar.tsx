'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { SearchInput } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableToolbar } from '@/components/ui/table'

/**
 * Debounced, URL-backed search for list pages. The query lives in the address
 * bar so the filtered view is shareable and the server does the searching.
 *
 * Extra filters are passed as children so every list page gets the same
 * toolbar rather than drawing its own.
 */
export function SearchBar({
  placeholder = 'Search',
  children,
}: {
  placeholder?: string
  children?: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [value, setValue] = React.useState(params.get('q') ?? '')

  React.useEffect(() => {
    const current = params.get('q') ?? ''
    if (value === current) return
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (value) next.set('q', value)
      else next.delete('q')
      next.delete('page')
      router.push(`${pathname}?${next.toString()}`)
    }, 300)
    return () => clearTimeout(t)
  }, [value, params, pathname, router])

  return (
    <TableToolbar>
      <SearchInput
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {children}
      {params.toString() ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setValue('')
            router.push(pathname)
          }}
        >
          <X aria-hidden />
          Clear
        </Button>
      ) : null}
    </TableToolbar>
  )
}
