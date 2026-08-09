'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/input'

export function PaymentFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <>
      <Select
        value={params.get('status') ?? ''}
        aria-label="Filter by status"
        className="w-40"
        onChange={(e) => set('status', e.target.value)}
      >
        <option value="">All statuses</option>
        <option value="SUCCESS">Successful</option>
        <option value="INITIATED">Initiated</option>
        <option value="FAILED">Failed</option>
        <option value="REFUNDED">Refunded</option>
        <option value="PARTIALLY_REFUNDED">Partly refunded</option>
      </Select>

      <Select
        value={params.get('mode') ?? ''}
        aria-label="Filter by mode"
        className="w-36"
        onChange={(e) => set('mode', e.target.value)}
      >
        <option value="">All modes</option>
        <option value="CASH">Cash</option>
        <option value="UPI">UPI</option>
        <option value="CARD">Card</option>
        <option value="CHEQUE">Cheque</option>
        <option value="ONLINE">Online</option>
        <option value="BANK_TRANSFER">Bank transfer</option>
      </Select>
    </>
  )
}
