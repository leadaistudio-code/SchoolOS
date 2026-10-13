'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownUp, EyeOff, Eye, Pencil, Plus } from 'lucide-react'
import {
  adjustStockAction,
  createStoreItemAction,
  setStoreItemActiveAction,
  updateStoreItemAction,
} from '../actions'
import { ADJUSTMENT_REASONS, GST_RATES, STORE_CATEGORIES } from '@/lib/store/options'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

export type ItemDraft = {
  id: string
  sku: string
  name: string
  category: string
  variant: string | null
  unit: string
  barcode: string | null
  hsnCode: string | null
  taxPercent: number
  sellingPriceMinor: number
  reorderLevel: number
  description: string | null
  quantity: number
  isActive: boolean
}

type Form = {
  name: string
  category: string
  variants: string
  unit: string
  sku: string
  barcode: string
  hsnCode: string
  taxPercent: string
  sellingPrice: string
  reorderLevel: string
  description: string
  openingQuantity: string
  openingUnitCost: string
}

const blank: Form = {
  name: '',
  category: 'UNIFORM',
  variants: '',
  unit: 'pcs',
  sku: '',
  barcode: '',
  hsnCode: '',
  taxPercent: '0',
  sellingPrice: '',
  reorderLevel: '5',
  description: '',
  openingQuantity: '0',
  openingUnitCost: '',
}

const fromDraft = (d: ItemDraft): Form => ({
  name: d.name,
  category: d.category,
  variants: d.variant ?? '',
  unit: d.unit,
  sku: d.sku,
  barcode: d.barcode ?? '',
  hsnCode: d.hsnCode ?? '',
  taxPercent: String(d.taxPercent),
  sellingPrice: String(d.sellingPriceMinor / 100),
  reorderLevel: String(d.reorderLevel),
  description: d.description ?? '',
  openingQuantity: '0',
  openingUnitCost: '',
})

const UNITS = ['pcs', 'set', 'pair', 'book', 'pack', 'dozen', 'kit', 'metre']

function ItemFields({ form, set, editing }: { form: Form; set: (k: keyof Form, v: string) => void; editing: boolean }) {
  const sizes = editing ? [] : form.variants.split(',').map((v) => v.trim()).filter(Boolean)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Item name" htmlFor="si-name" required className="sm:col-span-2">
        <Input id="si-name" autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Summer shirt, Class 5 Maths book, School bag" />
      </Field>
      <Field label="Category" htmlFor="si-cat" required>
        <Select id="si-cat" value={form.category} onChange={(e) => set('category', e.target.value)}>
          {STORE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
      </Field>
      <Field
        label={editing ? 'Size / variant' : 'Sizes / variants'}
        htmlFor="si-var"
        hint={editing ? 'e.g. Size 32, Class 5, Blue' : 'Comma-separated to create one item per size: 28, 30, 32'}
      >
        <Input id="si-var" value={form.variants} onChange={(e) => set('variants', e.target.value)} placeholder={editing ? 'Size 32' : '28, 30, 32, 34'} />
      </Field>
      <Field label="Selling price (₹, incl. GST)" htmlFor="si-price" required>
        <Input id="si-price" type="number" min="0" step="0.01" value={form.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} />
      </Field>
      <Field label="GST %" htmlFor="si-gst" hint="Included in the price">
        <Select id="si-gst" value={form.taxPercent} onChange={(e) => set('taxPercent', e.target.value)}>
          {GST_RATES.map((r) => (
            <option key={r} value={String(r)}>{r === 0 ? 'No GST / exempt' : `${r}%`}</option>
          ))}
        </Select>
      </Field>
      <Field label="Unit" htmlFor="si-unit">
        <Select id="si-unit" value={form.unit} onChange={(e) => set('unit', e.target.value)}>
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </Select>
      </Field>
      <Field label="Reorder level" htmlFor="si-reorder" hint="Alert when stock falls to this">
        <Input id="si-reorder" type="number" min="0" value={form.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} />
      </Field>
      {sizes.length <= 1 ? (
        <>
          <Field label="SKU / item code" htmlFor="si-sku" hint="Leave blank to auto-generate">
            <Input id="si-sku" value={form.sku} onChange={(e) => set('sku', e.target.value)} />
          </Field>
          <Field label="Barcode" htmlFor="si-barcode" hint="Scan into this box">
            <Input id="si-barcode" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
          </Field>
        </>
      ) : (
        <p className="sm:col-span-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-muted">
          {sizes.length} items will be created ({sizes.join(', ')}) with auto-generated SKUs. Add barcodes per size later from Edit.
        </p>
      )}
      <Field label="HSN code" htmlFor="si-hsn" hint="For GST bills (optional)">
        <Input id="si-hsn" value={form.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} />
      </Field>
      {!editing ? (
        <>
          <div className="sm:col-span-2 mt-1 border-t border-line pt-3">
            <p className="text-sm font-medium text-ink">Opening stock</p>
            <p className="text-xs text-ink-subtle">Stock already on the shelf today{sizes.length > 1 ? ', per size' : ''}. New deliveries go through Stock in.</p>
          </div>
          <Field label={sizes.length > 1 ? 'Quantity per size' : 'Quantity in hand'} htmlFor="si-oq">
            <Input id="si-oq" type="number" min="0" value={form.openingQuantity} onChange={(e) => set('openingQuantity', e.target.value)} />
          </Field>
          <Field label="Purchase cost per unit (₹)" htmlFor="si-oc" hint="What the school paid; values stock">
            <Input id="si-oc" type="number" min="0" step="0.01" value={form.openingUnitCost} onChange={(e) => set('openingUnitCost', e.target.value)} />
          </Field>
        </>
      ) : null}
      <Field label="Description" htmlFor="si-desc" className="sm:col-span-2">
        <Textarea id="si-desc" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
    </div>
  )
}

export function ItemDialogButton({ item }: { item?: ItemDraft }) {
  const router = useRouter()
  const { push } = useToast()
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<Form>(item ? fromDraft(item) : blank)
  const [saving, setSaving] = React.useState(false)
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    const common = {
      name: form.name,
      category: form.category,
      unit: form.unit,
      hsnCode: form.hsnCode,
      taxPercent: form.taxPercent,
      sellingPrice: form.sellingPrice,
      reorderLevel: form.reorderLevel || '0',
      description: form.description,
    }
    let ok = true
    let message = ''
    if (item) {
      const res = await updateStoreItemAction({ ...common, id: item.id, variant: form.variants, sku: form.sku, barcode: form.barcode })
      ok = res.ok
      message = res.message
    } else {
      const sizes = form.variants.split(',').map((v) => v.trim()).filter(Boolean)
      const variants = sizes.length ? sizes : ['']
      let created = 0
      for (const variant of variants) {
        const res = await createStoreItemAction({
          ...common,
          variant,
          sku: variants.length > 1 ? '' : form.sku,
          barcode: variants.length > 1 ? '' : form.barcode,
          openingQuantity: form.openingQuantity || '0',
          openingUnitCost: form.openingUnitCost || '0',
        })
        if (!res.ok) {
          ok = false
          message = variant ? `${variant}: ${res.message}` : res.message
          break
        }
        created++
        message = res.message
      }
      if (ok && variants.length > 1) message = `${created} sizes of ${form.name} added.`
      else if (!ok && created) message = `${created} added, then stopped. ${message}`
    }
    setSaving(false)
    push({ tone: ok ? 'success' : 'error', title: message })
    if (ok) {
      setOpen(false)
      if (!item) setForm(blank)
      router.refresh()
    }
  }

  return (
    <>
      {item ? (
        <IconButton label="Edit item" small onClick={() => { setForm(fromDraft(item)); setOpen(true) }}>
          <Pencil />
        </IconButton>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus aria-hidden /> Add item
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={item ? `Edit ${item.name}` : 'Add store item'}
        description={item ? `In stock: ${item.quantity} ${item.unit}. Quantity only changes through stock in, sales and adjustments.` : 'Books, uniform, shoes, bags, stationery or anything the school sells.'}
        footer={
          <>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </>
        }
      >
        <ItemFields form={form} set={set} editing={!!item} />
      </Dialog>
    </>
  )
}

export function AdjustStockButton({ item }: { item: Pick<ItemDraft, 'id' | 'name' | 'variant' | 'quantity' | 'unit'> }) {
  const router = useRouter()
  const { push } = useToast()
  const [open, setOpen] = React.useState(false)
  const [direction, setDirection] = React.useState<'IN' | 'OUT'>('OUT')
  const [quantity, setQuantity] = React.useState('1')
  const [reason, setReason] = React.useState<string>(ADJUSTMENT_REASONS.OUT[0])
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const label = item.variant ? `${item.name} (${item.variant})` : item.name

  const switchTo = (d: 'IN' | 'OUT') => {
    setDirection(d)
    setReason(ADJUSTMENT_REASONS[d][0])
  }
  const n = Math.floor(Number(quantity) || 0)
  const after = direction === 'IN' ? item.quantity + n : item.quantity - n

  const save = async () => {
    setSaving(true)
    const res = await adjustStockAction({
      itemId: item.id,
      direction,
      quantity,
      reason: note.trim() ? `${reason}: ${note.trim()}` : reason,
    })
    setSaving(false)
    push({ tone: res.ok ? 'success' : 'error', title: res.message })
    if (res.ok) {
      setOpen(false)
      setQuantity('1')
      setNote('')
      router.refresh()
    }
  }

  return (
    <>
      <IconButton label="Adjust stock" small onClick={() => setOpen(true)}>
        <ArrowDownUp />
      </IconButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Adjust stock: ${label}`}
        description={`In hand: ${item.quantity} ${item.unit}. Use this for damage, loss or a physical stock count, never for sales or deliveries.`}
        footer={
          <>
            <Button onClick={save} disabled={saving || n <= 0 || after < 0}>{saving ? 'Saving…' : 'Save adjustment'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
            {(['OUT', 'IN'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => switchTo(d)}
                className={cn(
                  'rounded-md py-1.5 text-sm transition-all',
                  direction === d ? 'bg-surface font-semibold shadow-sm' : 'text-ink-muted',
                  direction === d && (d === 'OUT' ? 'text-[var(--danger)]' : 'text-success'),
                )}
              >
                {d === 'OUT' ? 'Remove stock' : 'Add stock'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity" htmlFor="adj-q" required>
              <Input id="adj-q" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <Field label="Reason" htmlFor="adj-r" required>
              <Select id="adj-r" value={reason} onChange={(e) => setReason(e.target.value)}>
                {ADJUSTMENT_REASONS[direction].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Note" htmlFor="adj-n" hint="Optional detail, kept in the stock ledger">
            <Input id="adj-n" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <p className={cn('text-sm', after < 0 ? 'text-[var(--danger)]' : 'text-ink-muted')}>
            {after < 0 ? `Only ${item.quantity} in hand.` : `Stock after adjustment: ${after} ${item.unit}`}
          </p>
        </div>
      </Dialog>
    </>
  )
}

export function ToggleActiveButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)
  return (
    <IconButton
      label={active ? 'Stop selling' : 'Sell again'}
      small
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const res = await setStoreItemActiveAction(id, !active)
        setBusy(false)
        push({ tone: res.ok ? 'success' : 'error', title: res.message })
        if (res.ok) router.refresh()
      }}
    >
      {active ? <EyeOff /> : <Eye />}
    </IconButton>
  )
}
