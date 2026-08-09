'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * Debounced, URL-backed search for list pages. The query lives in the address
 * bar so the filtered view is shareable and the server does the searching.
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
    <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
      <div className="relative flex-1 min-w-52">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-subtle"
          aria-hidden
        />
        <Input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pl-9"
        />
      </div>
      {children}
      {params.toString() ? (
        <Button variant="ghost" size="sm" onClick={() => { setValue(''); router.push(pathname) }}>
          <X className="size-4" aria-hidden />
          Clear
        </Button>
      ) : null}
    </div>
  )
}
