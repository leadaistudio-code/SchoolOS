'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/input'

export function StaffTypeFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  return (
    <Select
      value={params.get('staffType') ?? ''}
      aria-label="Filter by staff type"
      className="w-44"
      onChange={(e) => {
        const next = new URLSearchParams(params.toString())
        if (e.target.value) next.set('staffType', e.target.value)
        else next.delete('staffType')
        next.delete('page')
        router.push(`${pathname}?${next.toString()}`)
      }}
    >
      <option value="">All staff</option>
      <option value="TEACHING">Teaching</option>
      <option value="ADMIN">Administrative</option>
      <option value="ACCOUNTANT">Accounts</option>
      <option value="LIBRARIAN">Library</option>
      <option value="DRIVER">Drivers</option>
      <option value="SUPPORT">Support</option>
      <option value="OTHER">Other</option>
    </Select>
  )
}
