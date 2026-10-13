'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { createStorePurchaseAction } from '../../actions'
import { STORE_PAYMENT_MODES, itemLabel } from '@/lib/store/options'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'

export type GrnItem = {
  id: string
  sku: string
  name: string
  variant: string | null
  unit: string
  quantity: number
  avgCostMinor: number
}

type Line = { key: number; itemId: string; quantity: string; unitCost: string }

export function GrnForm({ items, today, currency, preselect }: { items: GrnItem[]; today: string; currency: string; preselect?: string }) {
  const router = useRouter()
  const { push } = useToast()
  const byId = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const nextKey = React.useRef(1)
  const lineFor = (itemId = ''): Line => {
    const it = byId.get(itemId)
    return { key: nextKey.current++, itemId, quantity: '', unitCost: it?.avgCostMinor ? String(it.avgCostMinor / 100) : '' }
  }
  const [lines, setLines] = React.useState<Line[]>(() => [lineFor(preselect && byId.has(preselect) ? preselect : '')])
  const [vendorName, setVendorName] = React.useState('')
  const [invoiceNo, setInvoiceNo] = React.useState('')
  const [purchaseDate, setPurchaseDate] = React.useState(today)
  const [paymentMode, setPaymentMode] = React.useState('BANK_TRANSFER')
  const [notes, setNotes] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l
        const next = { ...l, ...patch }
        if (patch.itemId && !l.unitCost) {
          const it = byId.get(patch.itemId)
          if (it?.avgCostMinor) next.unitCost = String(it.avgCostMinor / 100)
        }
        return next
      }),
    )

  const total = lines.reduce((s, l) => s + Math.round((Number(l.quantity) || 0) * (Number(l.unitCost) || 0) * 100), 0)
  const used = new Set(lines.map((l) => l.itemId))

  const save = async () => {
    const filled = lines.filter((l) => l.itemId)
    if (filled.length === 0) return push({ tone: 'error', title: 'Add at least one item' })
    setSaving(true)
    const res = await createStorePurchaseAction({
      vendorName,
      invoiceNo,
      purchaseDate,
      paymentMode,
      notes,
      lines: filled.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitCost: l.unitCost || '0' })),
    })
    setSaving(false)
    push({ tone: res.ok ? 'success' : 'error', title: res.message })
    if (res.ok && res.id) router.push(`/inventory/store/purchases/${res.id}`)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Vendor / supplier" htmlFor="grn-vendor" required className="lg:col-span-2">
          <Input id="grn-vendor" autoFocus value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g. Sharma Uniforms, City Book Depot" />
        </Field>
        <Field label="Vendor bill no." htmlFor="grn-inv">
          <Input id="grn-inv" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </Field>
        <Field label="Received on" htmlFor="grn-date" required>
          <Input id="grn-date" type="date" max={today} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </Field>
        <Field label="Paid by" htmlFor="grn-mode" required>
          <Select id="grn-mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
            {STORE_PAYMENT_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="grn-notes" className="sm:col-span-1 lg:col-span-3">
          <Textarea id="grn-notes" rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="hidden grid-cols-[minmax(0,1fr)_110px_140px_130px_40px] gap-2 border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-ink-muted sm:grid">
          <span>Item</span>
          <span className="text-right">Quantity</span>
          <span className="text-right">Cost per unit (₹)</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {lines.map((l) => {
            const it = byId.get(l.itemId)
            const amount = Math.round((Number(l.quantity) || 0) * (Number(l.unitCost) || 0) * 100)
            return (
              <li key={l.key} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_110px_140px_130px_40px] sm:items-center">
                <div>
                  <Select aria-label="Item" value={l.itemId} onChange={(e) => update(l.key, { itemId: e.target.value })}>
                    <option value="">Choose item…</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id} disabled={used.has(i.id) && i.id !== l.itemId}>
                        {itemLabel(i)} · {i.sku}
                      </option>
                    ))}
                  </Select>
                  {it ? <p className="mt-0.5 text-xs text-ink-subtle">In hand: {it.quantity} {it.unit}{it.avgCostMinor ? ` · avg cost ${formatMoney(it.avgCostMinor, currency)}` : ''}</p> : null}
                </div>
                <Input aria-label="Quantity" type="number" min="1" className="text-right" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                <Input aria-label="Unit cost" type="number" min="0" step="0.01" className="text-right" value={l.unitCost} onChange={(e) => update(l.key, { unitCost: e.target.value })} />
                <span className="text-right text-sm font-medium tnum text-ink">{formatMoney(amount, currency)}</span>
                <button
                  type="button"
                  aria-label="Remove line"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  className="justify-self-end text-ink-subtle hover:text-[var(--danger)] disabled:opacity-30"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, lineFor()])}>
            <Plus aria-hidden /> Add line
          </Button>
          <p className="text-base font-semibold text-ink">
            Total <span className="ml-2 tnum">{formatMoney(total, currency)}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save & add to stock'}</Button>
        <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <p className="text-xs text-ink-subtle">Saving increases stock and updates each item&apos;s average cost.</p>
      </div>
    </div>
  )
}
