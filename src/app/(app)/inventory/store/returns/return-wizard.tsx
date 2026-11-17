'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus } from 'lucide-react'
import { createStoreExchangeAction, createStoreReturnAction } from '../actions'
import {
  STORE_CATEGORIES,
  STORE_PAYMENT_MODES,
  itemDiscountMinor,
  itemLabel,
  priceLine,
} from '@/lib/store/options'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { cn, formatMoney } from '@/lib/utils'

type ReturnLine = {
  id: string
  description: string
  quantity: number
  amountMinor: number
  returnableQty: number
  unitReturnMinor: number
  item: { sku: string | null; unit: string }
}

type CatalogueItem = {
  id: string
  sku: string
  name: string
  variant: string | null
  category: string
  unit: string
  sellingPriceMinor: number
  discountPercent: number
  taxPercent: number
  quantity: number
}

type CartLine = { itemId: string; quantity: number }

export function ReturnWizard({
  saleId,
  saleNumber,
  buyerLabel,
  lines,
  items,
  currency,
}: {
  saleId: string
  saleNumber: string
  buyerLabel: string
  lines: ReturnLine[]
  items: CatalogueItem[]
  currency: string
}) {
  const router = useRouter()
  const { push } = useToast()
  const byId = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const returnable = lines.filter((l) => l.returnableQty > 0)

  const [returnQty, setReturnQty] = React.useState<Record<string, number>>({})
  const [kind, setKind] = React.useState<'RETURN' | 'EXCHANGE'>('RETURN')
  const [refundMode, setRefundMode] = React.useState('CASH')
  const [collectedMode, setCollectedMode] = React.useState('CASH')
  const [exchangePayment, setExchangePayment] = React.useState('CASH')
  const [paymentRef, setPaymentRef] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [cart, setCart] = React.useState<CartLine[]>([])
  const [catQuery, setCatQuery] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const returnLines = returnable
    .map((l) => ({ saleLineId: l.id, quantity: returnQty[l.id] ?? 0 }))
    .filter((l) => l.quantity > 0)

  const returnTotal = returnable.reduce((s, l) => {
    const q = returnQty[l.id] ?? 0
    if (q <= 0) return s
    return s + (q >= l.quantity ? l.amountMinor : Math.round((l.amountMinor * q) / l.quantity))
  }, 0)

  const exchangeTotal = cart.reduce((s, c) => {
    const item = byId.get(c.itemId)
    if (!item || c.quantity <= 0) return s
    const discount = itemDiscountMinor(c.quantity, item.sellingPriceMinor, item.discountPercent)
    return s + priceLine({ quantity: c.quantity, unitPriceMinor: item.sellingPriceMinor, discountMinor: discount, taxPercent: item.taxPercent }).amount
  }, 0)

  const diff = exchangeTotal - returnTotal

  const setReturnLineQty = (id: string, max: number, quantity: number) => {
    setReturnQty((q) => ({ ...q, [id]: Math.min(Math.max(0, quantity), max) }))
  }

  const addExchange = (item: CatalogueItem) => {
    if (item.quantity <= 0) {
      push({ tone: 'error', title: `${itemLabel(item)} is out of stock` })
      return
    }
    const have = cart.find((l) => l.itemId === item.id)?.quantity ?? 0
    if (have >= item.quantity) {
      push({ tone: 'error', title: `Only ${item.quantity} in stock` })
      return
    }
    setCart((c) =>
      have > 0 ? c.map((l) => (l.itemId === item.id ? { ...l, quantity: l.quantity + 1 } : l)) : [...c, { itemId: item.id, quantity: 1 }],
    )
  }

  const visibleItems = React.useMemo(() => {
    const q = catQuery.trim().toLowerCase()
    return items.filter(
      (i) =>
        (!category || i.category === category) &&
        (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || (i.variant ?? '').toLowerCase().includes(q)),
    )
  }, [items, catQuery, category])

  const submit = async () => {
    if (!returnLines.length) {
      push({ tone: 'error', title: 'Choose quantities to return' })
      return
    }
    if (kind === 'RETURN' && returnTotal > 0 && !refundMode) {
      push({ tone: 'error', title: 'Choose refund payment mode' })
      return
    }
    if (kind === 'EXCHANGE') {
      if (!cart.length) {
        push({ tone: 'error', title: 'Add replacement items for the exchange' })
        return
      }
      if (diff < 0 && !refundMode) {
        push({ tone: 'error', title: 'Choose how to refund the balance' })
        return
      }
    }
    setSaving(true)
    const exchangeLines = cart.map((c) => ({
      itemId: c.itemId,
      quantity: c.quantity,
      discount: itemDiscountMinor(c.quantity, byId.get(c.itemId)!.sellingPriceMinor, byId.get(c.itemId)!.discountPercent),
    }))
    const res =
      kind === 'RETURN'
        ? await createStoreReturnAction({
            saleId,
            lines: returnLines,
            refundMode: returnTotal > 0 ? refundMode : undefined,
            notes: notes || undefined,
          })
        : await createStoreExchangeAction({
            saleId,
            lines: returnLines,
            refundMode: diff < 0 ? refundMode : undefined,
            collectedMode: diff > 0 ? collectedMode : undefined,
            notes: notes || undefined,
            exchange: {
              paymentMode: exchangePayment,
              paymentRef: paymentRef || undefined,
              lines: exchangeLines,
            },
          })
    setSaving(false)
    push({ tone: res.ok ? 'success' : 'error', title: res.message })
    if (res.ok && res.id) router.push(`/inventory/store/returns/${res.id}`)
    else if (res.ok) router.refresh()
  }

  if (!returnable.length) {
    return (
      <p className="rounded-lg border border-line bg-surface-2 p-4 text-sm text-ink-muted">
        Every line on bill {saleNumber} has already been fully returned. Open another bill or void the bill if the whole sale was wrong.
      </p>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
        <header>
          <p className="text-sm font-semibold text-ink">Return from {saleNumber}</p>
          <p className="text-xs text-ink-muted">{buyerLabel}</p>
        </header>
        <ul className="divide-y divide-line text-sm">
          {returnable.map((l) => {
            const q = returnQty[l.id] ?? 0
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{l.description}</p>
                  <p className="text-xs text-ink-subtle">
                    Sold {l.quantity} · {l.returnableQty} can still be returned
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" size="icon-sm" variant="ghost" disabled={q <= 0} onClick={() => setReturnLineQty(l.id, l.returnableQty, q - 1)}>
                    <Minus className="size-3.5" />
                  </Button>
                  <Input
                    className="w-14 text-center tnum"
                    inputMode="numeric"
                    value={q || ''}
                    onChange={(e) => setReturnLineQty(l.id, l.returnableQty, parseInt(e.target.value || '0', 10) || 0)}
                  />
                  <Button type="button" size="icon-sm" variant="ghost" disabled={q >= l.returnableQty} onClick={() => setReturnLineQty(l.id, l.returnableQty, q + 1)}>
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                <p className="w-full text-right text-xs text-ink-muted sm:w-auto">
                  {q > 0 ? formatMoney(q >= l.quantity ? l.amountMinor : Math.round((l.amountMinor * q) / l.quantity), currency) : '—'}
                </p>
              </li>
            )
          })}
        </ul>
        <p className="text-right text-sm font-semibold text-ink">Return value {formatMoney(returnTotal, currency)}</p>
      </section>

      <section className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
        <div className="flex gap-2">
          {(['RETURN', 'EXCHANGE'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition',
                kind === k ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--brand-700)]' : 'border-line text-ink-muted hover:bg-surface-2',
              )}
              onClick={() => setKind(k)}
            >
              {k === 'RETURN' ? 'Refund only' : 'Exchange'}
            </button>
          ))}
        </div>

        {kind === 'RETURN' ? (
          <Field label="Refund paid as" htmlFor="refund-mode">
            <select id="refund-mode" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" value={refundMode} onChange={(e) => setRefundMode(e.target.value)} disabled={returnTotal <= 0}>
              {STORE_PAYMENT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              {STORE_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={cn('rounded-full px-2 py-0.5 text-xs', category === c.value ? 'bg-ink text-surface' : 'bg-surface-2 text-ink-muted')}
                  onClick={() => setCategory(category === c.value ? '' : c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <Input placeholder="Search replacements…" value={catQuery} onChange={(e) => setCatQuery(e.target.value)} />
            <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
              {visibleItems.slice(0, 40).map((i) => (
                <li key={i.id}>
                  <button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1 hover:bg-surface-2" onClick={() => addExchange(i)}>
                    <span>
                      {itemLabel(i)} <span className="text-ink-subtle">({i.quantity} left)</span>
                    </span>
                    <span className="tnum">{formatMoney(i.sellingPriceMinor, currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {cart.length ? (
              <ul className="border-t border-line pt-2 text-sm">
                {cart.map((c) => {
                  const item = byId.get(c.itemId)!
                  return (
                    <li key={c.itemId} className="flex items-center justify-between py-1">
                      <span>
                        {itemLabel(item)} × {c.quantity}
                      </span>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setCart((x) => x.filter((l) => l.itemId !== c.itemId))}>
                        Remove
                      </Button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-xs text-ink-muted">Tap items above to add replacements.</p>
            )}
            <p className="text-sm text-ink-muted">
              New goods {formatMoney(exchangeTotal, currency)}
              {diff > 0 ? ` · collect ${formatMoney(diff, currency)} more` : diff < 0 ? ` · refund ${formatMoney(-diff, currency)}` : ' · even exchange'}
            </p>
            <Field label="Payment for new goods" htmlFor="ex-pay">
              <select id="ex-pay" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" value={exchangePayment} onChange={(e) => setExchangePayment(e.target.value)}>
                {STORE_PAYMENT_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            {diff > 0 ? (
              <Field label="Extra collected as" htmlFor="collected-mode">
                <select id="collected-mode" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" value={collectedMode} onChange={(e) => setCollectedMode(e.target.value)}>
                  {STORE_PAYMENT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {diff < 0 ? (
              <Field label="Balance refund as" htmlFor="ex-refund">
                <select id="ex-refund" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" value={refundMode} onChange={(e) => setRefundMode(e.target.value)}>
                  {STORE_PAYMENT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="UPI / card ref. (optional)" htmlFor="pay-ref">
              <Input id="pay-ref" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
            </Field>
          </>
        )}

        <Field label="Notes (optional)" htmlFor="ret-notes">
          <Textarea id="ret-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condition of goods, reason…" />
        </Field>

        <Button type="button" className="w-full" disabled={saving || !returnLines.length} onClick={submit}>
          {saving ? 'Saving…' : kind === 'RETURN' ? 'Save return & restore stock' : 'Save exchange'}
        </Button>
      </section>
    </div>
  )
}