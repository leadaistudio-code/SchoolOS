'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Minus, Plus, ScanBarcode, ShoppingCart, Trash2, User, UserX, X } from 'lucide-react'
import { createStoreSaleAction } from '../actions'
import {
  STORE_CATEGORIES,
  STORE_PAYMENT_MODES,
  itemLabel,
  priceLine,
  storeCategory,
} from '@/lib/store/options'
import { Button } from '@/components/ui/button'
import { Field, Input, SearchInput } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { cn, formatMoney } from '@/lib/utils'

export type PosItem = {
  id: string
  sku: string
  barcode: string | null
  name: string
  variant: string | null
  category: string
  unit: string
  sellingPriceMinor: number
  taxPercent: number
  quantity: number
}

type CartLine = { itemId: string; quantity: number; discount: string }

type StudentHit = {
  id: string
  admissionNo: string
  firstName: string
  lastName: string
  className?: string | null
  sectionName?: string | null
}

export function PointOfSale({ items, currency }: { items: PosItem[]; currency: string }) {
  const router = useRouter()
  const { push } = useToast()
  const byId = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const [query, setQuery] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [cart, setCart] = React.useState<CartLine[]>([])
  const [buyerType, setBuyerType] = React.useState<'student' | 'walkin'>('student')
  const [student, setStudent] = React.useState<StudentHit | null>(null)
  const [studentQuery, setStudentQuery] = React.useState('')
  const [hits, setHits] = React.useState<StudentHit[]>([])
  const [customerName, setCustomerName] = React.useState('')
  const [customerPhone, setCustomerPhone] = React.useState('')
  const [paymentMode, setPaymentMode] = React.useState('CASH')
  const [paymentRef, setPaymentRef] = React.useState('')
  const [feeDue, setFeeDue] = React.useState<'CURRENT' | 'NEXT'>('CURRENT')
  const [cashGiven, setCashGiven] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const searchRef = React.useRef<HTMLInputElement>(null)

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter(
      (i) =>
        (!category || i.category === category) &&
        (!q ||
          i.name.toLowerCase().includes(q) ||
          i.sku.toLowerCase().includes(q) ||
          (i.variant ?? '').toLowerCase().includes(q) ||
          i.barcode === query.trim()),
    )
  }, [items, query, category])

  const inCart = (id: string) => cart.find((l) => l.itemId === id)?.quantity ?? 0

  const add = (item: PosItem, n = 1) => {
    const have = inCart(item.id)
    if (have + n > item.quantity) {
      push({ tone: 'error', title: `Only ${item.quantity} of ${itemLabel(item)} in stock` })
      return
    }
    setCart((c) =>
      have > 0
        ? c.map((l) => (l.itemId === item.id ? { ...l, quantity: l.quantity + n } : l))
        : [...c, { itemId: item.id, quantity: n, discount: '' }],
    )
  }

  const setQty = (id: string, quantity: number) => {
    const item = byId.get(id)
    if (!item) return
    if (quantity <= 0) return setCart((c) => c.filter((l) => l.itemId !== id))
    if (quantity > item.quantity) {
      push({ tone: 'error', title: `Only ${item.quantity} of ${itemLabel(item)} in stock` })
      quantity = item.quantity
    }
    setCart((c) => c.map((l) => (l.itemId === id ? { ...l, quantity } : l)))
  }

  const onScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const code = query.trim().toLowerCase()
    if (!code) return
    const exact = items.find((i) => i.barcode?.toLowerCase() === code || i.sku.toLowerCase() === code)
    const pick = exact ?? (visible.length === 1 ? visible[0] : undefined)
    if (pick) {
      add(pick)
      setQuery('')
    }
  }

  React.useEffect(() => {
    if (buyerType !== 'student' || student || studentQuery.trim().length < 2) {
      setHits([])
      return
    }
    const controller = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/students?q=${encodeURIComponent(studentQuery)}&pageSize=8`, { signal: controller.signal })
        const json = await res.json()
        setHits((json.data ?? []) as StudentHit[])
      } catch {
        /* aborted */
      }
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(t)
    }
  }, [studentQuery, student, buyerType])

  const priced = cart.map((l) => {
    const item = byId.get(l.itemId)!
    const p = priceLine({
      quantity: l.quantity,
      unitPriceMinor: item.sellingPriceMinor,
      discountMinor: Math.round((Number(l.discount) || 0) * 100),
      taxPercent: item.taxPercent,
    })
    return { line: l, item, ...p }
  })
  const gross = priced.reduce((s, l) => s + l.gross, 0)
  const discount = priced.reduce((s, l) => s + l.discount, 0)
  const tax = priced.reduce((s, l) => s + l.tax, 0)
  const total = priced.reduce((s, l) => s + l.amount, 0)
  const units = cart.reduce((s, l) => s + l.quantity, 0)
  const change = paymentMode === 'CASH' && cashGiven ? Math.round(Number(cashGiven) * 100) - total : null

  const reset = () => {
    setCart([])
    setStudent(null)
    setStudentQuery('')
    setCustomerName('')
    setCustomerPhone('')
    setPaymentRef('')
    setCashGiven('')
    setPaymentMode('CASH')
    setFeeDue('CURRENT')
  }

  React.useEffect(() => {
    if (buyerType === 'walkin' && paymentMode === 'FEE_ACCOUNT') setPaymentMode('CASH')
  }, [buyerType, paymentMode])

  const submit = async () => {
    if (cart.length === 0) return push({ tone: 'error', title: 'Add items to the bill first' })
    if (buyerType === 'student' && !student) return push({ tone: 'error', title: 'Pick the student, or switch to walk-in' })
    if (buyerType === 'walkin' && customerName.trim().length < 2) return push({ tone: 'error', title: 'Enter the buyer name' })
    if (change !== null && change < 0) return push({ tone: 'error', title: 'Cash received is less than the bill total' })
    setSaving(true)
    const res = await createStoreSaleAction({
      studentId: buyerType === 'student' ? student?.id : null,
      customerName: buyerType === 'walkin' ? customerName : undefined,
      customerPhone: customerPhone || undefined,
      paymentMode,
      feeDue,
      paymentRef: paymentMode === 'CASH' || paymentMode === 'FEE_ACCOUNT' ? undefined : paymentRef || undefined,
      lines: cart.map((l) => ({ itemId: l.itemId, quantity: l.quantity, discount: Number(l.discount) || 0 })),
    })
    setSaving(false)
    push({ tone: res.ok ? 'success' : 'error', title: res.message })
    if (res.ok && res.id) {
      reset()
      router.push(`/inventory/store/sales/${res.id}?print=1`)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
          <div className="relative flex-1">
            <SearchInput
              ref={searchRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onScan}
              placeholder="Search item, SKU or scan barcode, then press Enter"
              aria-label="Search items"
            />
          </div>
          <ScanBarcode className="size-5 text-ink-subtle" aria-hidden />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CategoryChip active={!category} colour="#475569" onClick={() => setCategory('')}>
            All
          </CategoryChip>
          {STORE_CATEGORIES.filter((c) => items.some((i) => i.category === c.value)).map((c) => (
            <CategoryChip key={c.value} active={category === c.value} colour={c.colour} onClick={() => setCategory(c.value)}>
              {c.label}
            </CategoryChip>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-16 text-center text-sm text-ink-muted">
            {items.length === 0 ? 'No items yet. Add items under Items & stock first.' : 'No item matches that search.'}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visible.map((item) => {
              const left = item.quantity - inCart(item.id)
              const colour = storeCategory(item.category).colour
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={left <= 0}
                  onClick={() => add(item)}
                  style={{ '--c': colour } as React.CSSProperties}
                  className="group relative overflow-hidden rounded-xl border border-line bg-surface p-3 text-left transition-all hover:-translate-y-px hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                >
                  <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: 'var(--c)' }} />
                  <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                  <p className="truncate text-xs text-ink-subtle">{[item.variant, item.sku].filter(Boolean).join(' · ')}</p>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="text-base font-semibold tnum text-ink">{formatMoney(item.sellingPriceMinor, currency)}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-px text-[11px] font-semibold tnum',
                        left <= 0 ? 'bg-danger-bg text-[var(--danger)]' : left <= 5 ? 'bg-warning-bg text-warning' : 'bg-surface-2 text-ink-muted',
                      )}
                    >
                      {left <= 0 ? 'Out' : `${left} ${item.unit}`}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
        <div className="rounded-xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
              <ShoppingCart className="size-4" aria-hidden /> Bill
              <span className="text-xs font-normal text-ink-subtle">{units} items</span>
            </h2>
            {cart.length ? (
              <button type="button" onClick={() => setCart([])} className="text-xs text-ink-subtle hover:text-[var(--danger)]">
                Clear
              </button>
            ) : null}
          </div>

          <div className="max-h-[38vh] overflow-y-auto scroll-thin">
            {priced.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-ink-muted">Tap an item or scan a barcode to add it.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {priced.map(({ line, item, amount }) => (
                  <li key={line.itemId} className="space-y-1.5 px-4 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{itemLabel(item)}</p>
                        <p className="text-xs text-ink-subtle">
                          {formatMoney(item.sellingPriceMinor, currency)} each{item.taxPercent ? ` · GST ${item.taxPercent}% incl.` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tnum text-ink">{formatMoney(amount, currency)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-lg border border-line">
                        <button type="button" aria-label="One less" onClick={() => setQty(line.itemId, line.quantity - 1)} className="grid size-7 place-items-center text-ink-muted hover:text-ink">
                          <Minus className="size-3.5" />
                        </button>
                        <input
                          aria-label="Quantity"
                          inputMode="numeric"
                          value={line.quantity}
                          onChange={(e) => setQty(line.itemId, Math.floor(Number(e.target.value) || 0))}
                          className="w-10 bg-transparent text-center text-sm tnum outline-none"
                        />
                        <button type="button" aria-label="One more" onClick={() => setQty(line.itemId, line.quantity + 1)} className="grid size-7 place-items-center text-ink-muted hover:text-ink">
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <label className="flex items-center gap-1 text-xs text-ink-subtle">
                        Disc ₹
                        <input
                          inputMode="decimal"
                          value={line.discount}
                          onChange={(e) =>
                            setCart((c) => c.map((l) => (l.itemId === line.itemId ? { ...l, discount: e.target.value } : l)))
                          }
                          placeholder="0"
                          className="h-7 w-16 rounded-md border border-line bg-surface px-1.5 text-sm tnum text-ink outline-none focus:border-[var(--brand-500)]"
                        />
                      </label>
                      <button type="button" aria-label="Remove" onClick={() => setQty(line.itemId, 0)} className="ml-auto text-ink-subtle hover:text-[var(--danger)]">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <dl className="space-y-1 border-t border-line px-4 py-3 text-sm">
            <Row label="Items total" value={formatMoney(gross, currency)} />
            {discount > 0 ? <Row label="Discount" value={`− ${formatMoney(discount, currency)}`} /> : null}
            {tax > 0 ? <Row label="GST included" value={formatMoney(tax, currency)} muted /> : null}
            <div className="flex items-center justify-between pt-1 text-lg font-semibold text-ink">
              <dt>Total</dt>
              <dd className="tnum">{formatMoney(total, currency)}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
            <SegButton active={buyerType === 'student'} onClick={() => setBuyerType('student')}>
              <User className="size-4" aria-hidden /> Student
            </SegButton>
            <SegButton active={buyerType === 'walkin'} onClick={() => setBuyerType('walkin')}>
              <UserX className="size-4" aria-hidden /> Walk-in
            </SegButton>
          </div>

          {buyerType === 'student' ? (
            student ? (
              <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-ink">{student.firstName} {student.lastName}</p>
                  <p className="text-xs text-ink-subtle">
                    {student.admissionNo}
                    {student.className ? ` · ${student.className}${student.sectionName ? `-${student.sectionName}` : ''}` : ''}
                  </p>
                </div>
                <button type="button" aria-label="Change student" onClick={() => setStudent(null)} className="text-ink-subtle hover:text-ink">
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Search student name or admission no."
                  aria-label="Search student"
                />
                {hits.length ? (
                  <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setStudent(h)
                            setHits([])
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-surface-2"
                        >
                          <p className="text-sm text-ink">{h.firstName} {h.lastName}</p>
                          <p className="text-xs text-ink-subtle">
                            {h.admissionNo}
                            {h.className ? ` · ${h.className}${h.sectionName ? `-${h.sectionName}` : ''}` : ''}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Buyer name" htmlFor="pos-name" required>
                <Input id="pos-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Parent / visitor" />
              </Field>
              <Field label="Phone" htmlFor="pos-phone">
                <Input id="pos-phone" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </Field>
            </div>
          )}

          <div>
            <p className="mb-1 text-sm font-medium text-ink">Payment</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                ...STORE_PAYMENT_MODES,
                ...(buyerType === 'student' ? [{ value: 'FEE_ACCOUNT', label: 'Add to fees' }] : []),
              ].map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMode(m.value)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                    paymentMode === m.value
                      ? 'border-[var(--brand-500)] bg-[var(--brand-50)] font-semibold text-[var(--brand-600)]'
                      : 'border-line text-ink-muted hover:text-ink',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          {paymentMode === 'FEE_ACCOUNT' ? (
            <div className="space-y-2 rounded-lg bg-surface-2 p-3">
              <p className="text-xs text-ink-muted">
                Nothing is taken now. The bill is added to {student ? `${student.firstName}'s` : "the student's"} fee
                account and collected at the fee counter.
              </p>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
                <SegButton active={feeDue === 'CURRENT'} onClick={() => setFeeDue('CURRENT')}>
                  With current fees
                </SegButton>
                <SegButton active={feeDue === 'NEXT'} onClick={() => setFeeDue('NEXT')}>
                  With next fees
                </SegButton>
              </div>
            </div>
          ) : paymentMode === 'CASH' ? (
            <div className="grid grid-cols-2 items-end gap-2">
              <Field label="Cash received (₹)" htmlFor="pos-cash">
                <Input id="pos-cash" inputMode="decimal" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} placeholder={String(total / 100)} />
              </Field>
              <p className={cn('pb-2 text-sm', change !== null && change < 0 ? 'text-[var(--danger)]' : 'text-ink')}>
                {change === null ? '' : change < 0 ? `Short by ${formatMoney(-change, currency)}` : `Return ${formatMoney(change, currency)}`}
              </p>
            </div>
          ) : (
            <Field label="Transaction / cheque no." htmlFor="pos-ref">
              <Input id="pos-ref" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Optional" />
            </Field>
          )}

          <Button type="button" className="w-full" size="lg" disabled={saving || cart.length === 0} onClick={submit}>
            {saving
              ? 'Saving bill…'
              : paymentMode === 'FEE_ACCOUNT'
                ? `Add ${formatMoney(total, currency)} to fees`
                : `Save bill · ${formatMoney(total, currency)}`}
          </Button>
        </div>
      </aside>
    </div>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between', muted ? 'text-ink-subtle' : 'text-ink-muted')}>
      <dt>{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  )
}

function SegButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm transition-all',
        active ? 'bg-surface font-semibold text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function CategoryChip({
  active,
  colour,
  onClick,
  children,
}: {
  active: boolean
  colour: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active ? { background: colour, borderColor: colour } : { borderColor: `color-mix(in srgb, ${colour} 35%, transparent)` }}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-all',
        active ? 'text-white shadow-sm' : 'text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
