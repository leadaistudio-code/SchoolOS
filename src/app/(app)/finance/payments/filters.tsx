'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Input, Select } from '@/components/ui/input'
import { PERIOD_PRESETS } from '@/lib/periods'

export function PaymentFilters({ hideChannel = false }: { hideChannel?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`)
  }
  const set = (key: string, value: string) => update({ [key]: value })

  return (
    <>
      <Select
        value={params.get('preset') ?? (params.get('from') || params.get('to') ? 'custom' : '')}
        aria-label="Period"
        className="w-40"
        onChange={(e) =>
          e.target.value === 'custom'
            ? update({ preset: '' })
            : update({ preset: e.target.value, from: '', to: '' })}
      >
        <option value="">All dates</option>
        {PERIOD_PRESETS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
        <option value="custom">Custom range</option>
      </Select>
      {!params.get('preset') ? (
        <>
          <Input
            type="date"
            aria-label="From date"
            className="w-36"
            value={params.get('from') ?? ''}
            onChange={(e) => set('from', e.target.value)}
          />
          <Input
            type="date"
            aria-label="To date"
            className="w-36"
            value={params.get('to') ?? ''}
            onChange={(e) => set('to', e.target.value)}
          />
        </>
      ) : null}

      <Select
        value={params.get('view') ?? ''}
        aria-label="Filter by receipt status"
        className="w-44"
        onChange={(e) => update({ view: e.target.value, status: '' })}
      >
        <option value="">All receipts</option>
        <option value="cleared">Cleared / received</option>
        <option value="pending_cheque">Cheque pending clearance</option>
        <option value="bounced">Bounced cheques</option>
        <option value="void">Cancelled (void)</option>
      </Select>

      {hideChannel ? null : (
        <Select
          value={params.get('channel') ?? ''}
          aria-label="Filter by channel"
          className="w-36"
          onChange={(e) => set('channel', e.target.value)}
        >
          <option value="">Office + online</option>
          <option value="office">Office counter</option>
          <option value="online">Online / app</option>
        </Select>
      )}

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
        <option value="CHEQUE">Cheque / DD</option>
        <option value="ONLINE">Online</option>
        <option value="NET_BANKING">Net banking</option>
        <option value="BANK_TRANSFER">Bank transfer</option>
      </Select>
    </>
  )
}
