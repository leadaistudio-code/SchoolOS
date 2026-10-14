'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { parseMoneyToMinor } from '@/server/modules/accounting/money'

export type ApiResult = { ok: true; data: unknown } | { ok: false; message: string }

export async function callApi(url: string, init: { method: string; body?: unknown; form?: FormData }): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      method: init.method,
      headers: init.form ? undefined : { 'Content-Type': 'application/json' },
      body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
    })
    const json = (await res.json().catch(() => null)) as { data?: unknown; error?: { message?: string } } | null
    if (!res.ok) return { ok: false, message: json?.error?.message ?? `Request failed (${res.status})` }
    return { ok: true, data: json?.data }
  } catch {
    return { ok: false, message: 'Network error. Nothing was saved; try again.' }
  }
}

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function rupees(minor: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(minor / 100)
}

/** Dialog shell: one idempotency key per opening, error display, submit lock. */
export function useSubmit(onDone: () => void) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const run = async (fn: () => Promise<ApiResult>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await fn()
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    onDone()
    router.refresh()
  }
  return { busy, error, setError, run }
}

export function FormDialog({
  trigger,
  title,
  description,
  size = 'lg',
  children,
}: {
  trigger: (open: () => void) => React.ReactNode
  title: string
  description?: string
  size?: 'sm' | 'md' | 'lg'
  children: (close: () => void, key: string) => React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [key, setKey] = React.useState(newKey)
  const show = () => {
    setKey(newKey())
    setOpen(true)
  }
  return (
    <>
      {trigger(show)}
      <Dialog open={open} onClose={() => setOpen(false)} title={title} description={description} size={size}>
        {open ? children(() => setOpen(false), key) : null}
      </Dialog>
    </>
  )
}

// ------------------------------------------------------------------ vendor

export type VendorFormValue = {
  id?: string
  code?: string
  name?: string
  contactPerson?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  gstin?: string | null
  pan?: string | null
  creditDays?: number
  isActive?: boolean
  notes?: string | null
}

export function VendorDialog({ vendor, label }: { vendor?: VendorFormValue; label: string }) {
  return (
    <FormDialog
      title={vendor?.id ? 'Edit vendor' : 'New vendor'}
      trigger={(open) => <Button size="sm" variant={vendor?.id ? 'secondary' : 'primary'} onClick={open}>{label}</Button>}
    >
      {(close) => <VendorForm vendor={vendor} onDone={close} />}
    </FormDialog>
  )
}

function VendorForm({ vendor, onDone }: { vendor?: VendorFormValue; onDone: () => void }) {
  const { busy, error, run } = useSubmit(onDone)
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const body = {
      name: s('name'),
      code: s('code'),
      contactPerson: s('contactPerson'),
      email: s('email'),
      phone: s('phone'),
      address: s('address'),
      gstin: s('gstin'),
      pan: s('pan'),
      creditDays: Number(s('creditDays') || 0),
      isActive: f.get('isActive') === 'on',
      notes: s('notes'),
    }
    void run(() => callApi(vendor?.id ? `/api/v1/accounting/vendors/${vendor.id}` : '/api/v1/accounting/vendors', {
      method: vendor?.id ? 'PATCH' : 'POST',
      body,
    }))
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Vendor name" required htmlFor="v-name"><Input id="v-name" name="name" defaultValue={vendor?.name ?? ''} required maxLength={160} /></Field>
        <Field label="Code" hint="Leave blank to number automatically" htmlFor="v-code"><Input id="v-code" name="code" defaultValue={vendor?.code ?? ''} maxLength={30} /></Field>
        <Field label="Contact person" htmlFor="v-contact"><Input id="v-contact" name="contactPerson" defaultValue={vendor?.contactPerson ?? ''} /></Field>
        <Field label="Phone" htmlFor="v-phone"><Input id="v-phone" name="phone" defaultValue={vendor?.phone ?? ''} inputMode="tel" /></Field>
        <Field label="Email" htmlFor="v-email"><Input id="v-email" name="email" type="email" defaultValue={vendor?.email ?? ''} /></Field>
        <Field label="Credit terms (days)" htmlFor="v-days"><Input id="v-days" name="creditDays" type="number" min={0} max={365} defaultValue={vendor?.creditDays ?? 0} /></Field>
        <Field label="GSTIN" hint="Optional. Checked for format and check digit." htmlFor="v-gstin"><Input id="v-gstin" name="gstin" defaultValue={vendor?.gstin ?? ''} maxLength={15} className="uppercase" /></Field>
        <Field label="PAN" hint="Optional. Taken from the GSTIN when left blank." htmlFor="v-pan"><Input id="v-pan" name="pan" defaultValue={vendor?.pan ?? ''} maxLength={10} className="uppercase" /></Field>
      </div>
      <Field label="Address" htmlFor="v-address"><Textarea id="v-address" name="address" rows={2} defaultValue={vendor?.address ?? ''} /></Field>
      <Field label="Notes" htmlFor="v-notes"><Textarea id="v-notes" name="notes" rows={2} defaultValue={vendor?.notes ?? ''} /></Field>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="isActive" defaultChecked={vendor?.isActive ?? true} /> Active
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save vendor'}</Button>
      </div>
    </form>
  )
}

// ------------------------------------------------------------------ purchase voucher

export type AccountOption = { id: string; label: string }

type DraftLine = { description: string; accountId: string; quantity: string; unitCost: string; taxPercent: string }

export function PurchaseVoucherDialog({ vendorId, accounts, creditDays }: { vendorId: string; accounts: AccountOption[]; creditDays: number }) {
  return (
    <FormDialog
      title="New purchase voucher"
      description="Enter the supplier's bill. It posts Dr expense / asset, Cr Sundry Creditors."
      trigger={(open) => <Button size="sm" onClick={open}>New purchase voucher</Button>}
    >
      {(close, key) => <PurchaseVoucherForm vendorId={vendorId} accounts={accounts} creditDays={creditDays} idempotencyKey={key} onDone={close} />}
    </FormDialog>
  )
}

function PurchaseVoucherForm({
  vendorId, accounts, creditDays, idempotencyKey, onDone,
}: { vendorId: string; accounts: AccountOption[]; creditDays: number; idempotencyKey: string; onDone: () => void }) {
  const { busy, error, setError, run } = useSubmit(onDone)
  const blank: DraftLine = { description: '', accountId: accounts[0]?.id ?? '', quantity: '1', unitCost: '', taxPercent: '0' }
  const [lines, setLines] = React.useState<DraftLine[]>([blank])
  const set = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const preview = lines.reduce((sum, l) => {
    const unit = parseMoneyToMinor(l.unitCost) ?? 0
    const qty = Number(l.quantity) || 0
    const amount = unit * qty
    return sum + amount + Math.round((amount * (Number(l.taxPercent) || 0)) / 100)
  }, 0)

  const send = (form: HTMLFormElement, post: boolean) => {
    const f = new FormData(form)
    const parsed = lines.map((l) => ({
      description: l.description.trim(),
      accountId: l.accountId,
      quantity: Number(l.quantity),
      unitCostMinor: parseMoneyToMinor(l.unitCost),
      taxPercent: Number(l.taxPercent || 0),
    }))
    if (parsed.some((l) => l.unitCostMinor === null)) {
      setError('Enter each unit cost in rupees, with at most two decimals')
      return
    }
    void run(() => callApi('/api/v1/accounting/purchase-vouchers', {
      method: 'POST',
      body: {
        vendorId,
        supplierInvoiceNo: String(f.get('supplierInvoiceNo') ?? ''),
        invoiceDate: String(f.get('invoiceDate') ?? ''),
        dueDate: String(f.get('dueDate') ?? '') || undefined,
        narration: String(f.get('narration') ?? '') || undefined,
        post,
        idempotencyKey,
        lines: parsed,
      },
    }))
  }

  const formRef = React.useRef<HTMLFormElement>(null)
  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault()
        send(e.currentTarget, true)
      }}
      className="space-y-3"
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {accounts.length === 0 ? <Notice tone="warning">No expense or asset account heads are active. Add one in the chart of accounts first.</Notice> : null}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Supplier invoice no." required htmlFor="pv-no"><Input id="pv-no" name="supplierInvoiceNo" required maxLength={60} /></Field>
        <Field label="Invoice date" required htmlFor="pv-date"><Input id="pv-date" name="invoiceDate" type="date" required /></Field>
        <Field label="Due date" hint={`Defaults to ${creditDays} day terms`} htmlFor="pv-due"><Input id="pv-due" name="dueDate" type="date" /></Field>
      </div>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end border-b border-line pb-2">
            <Field label="Description" className="col-span-12 sm:col-span-4"><Input value={l.description} onChange={(e) => set(i, { description: e.target.value })} required maxLength={200} /></Field>
            <Field label="Account head" className="col-span-12 sm:col-span-3">
              <Select value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })} required>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </Select>
            </Field>
            <Field label="Qty" className="col-span-3 sm:col-span-1"><Input type="number" min={1} step={1} value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} required /></Field>
            <Field label="Unit cost (₹)" className="col-span-4 sm:col-span-2"><Input inputMode="decimal" value={l.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} required /></Field>
            <Field label="Tax %" className="col-span-3 sm:col-span-1"><Input type="number" min={0} max={100} step="0.01" value={l.taxPercent} onChange={(e) => set(i, { taxPercent: e.target.value })} /></Field>
            <div className="col-span-2 sm:col-span-1 flex justify-end">
              {lines.length > 1 ? <Button type="button" size="sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove line">✕</Button> : null}
            </div>
          </div>
        ))}
        <Button type="button" size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, blank])}>Add line</Button>
      </div>
      <Field label="Narration" htmlFor="pv-narration"><Textarea id="pv-narration" name="narration" rows={2} maxLength={500} /></Field>
      <p className="text-sm text-ink">Estimated total <span className="font-semibold tnum">{rupees(preview)}</span> <span className="text-ink-subtle">(the server recalculates)</span></p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !accounts.length}
          onClick={() => {
            const form = formRef.current
            if (form?.reportValidity()) send(form, false)
          }}
        >
          Save as draft
        </Button>
        <Button type="submit" disabled={busy || !accounts.length}>{busy ? 'Posting…' : 'Save and post'}</Button>
      </div>
    </form>
  )
}

// ------------------------------------------------------------------ payment

export type OpenBillOption = { voucherId: string; number: string; supplierInvoiceNo: string; dueDate: string; reducibleMinor: number }

export function VendorPaymentDialog({ vendorId, bills }: { vendorId: string; bills: OpenBillOption[] }) {
  return (
    <FormDialog
      title="Record payment"
      description="Posts Dr Sundry Creditors, Cr cash or bank. Leave allocations blank to settle oldest bills first."
      trigger={(open) => <Button size="sm" variant="secondary" onClick={open}>Record payment</Button>}
    >
      {(close, key) => <VendorPaymentForm vendorId={vendorId} bills={bills} idempotencyKey={key} onDone={close} />}
    </FormDialog>
  )
}

function VendorPaymentForm({ vendorId, bills, idempotencyKey, onDone }: { vendorId: string; bills: OpenBillOption[]; idempotencyKey: string; onDone: () => void }) {
  const { busy, error, setError, run } = useSubmit(onDone)
  const [alloc, setAlloc] = React.useState<Record<string, string>>({})
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const amountMinor = parseMoneyToMinor(String(f.get('amount') ?? ''))
    if (!amountMinor) {
      setError('Enter the amount paid in rupees')
      return
    }
    const allocations: { voucherId: string; amountMinor: number }[] = []
    for (const [voucherId, v] of Object.entries(alloc)) {
      if (!v.trim()) continue
      const m = parseMoneyToMinor(v)
      if (!m) {
        setError('Allocation amounts must be in rupees, with at most two decimals')
        return
      }
      allocations.push({ voucherId, amountMinor: m })
    }
    void run(() => callApi('/api/v1/accounting/vendor-payments', {
      method: 'POST',
      body: {
        vendorId,
        paidOn: String(f.get('paidOn') ?? ''),
        mode: String(f.get('mode') ?? 'CASH'),
        reference: String(f.get('reference') ?? '') || undefined,
        amountMinor,
        narration: String(f.get('narration') ?? '') || undefined,
        allocations: allocations.length ? allocations : undefined,
        idempotencyKey,
      },
    }))
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Paid on" required htmlFor="vp-date"><Input id="vp-date" name="paidOn" type="date" required /></Field>
        <Field label="Amount (₹)" required htmlFor="vp-amount"><Input id="vp-amount" name="amount" inputMode="decimal" required /></Field>
        <Field label="Mode" htmlFor="vp-mode">
          <Select id="vp-mode" name="mode" defaultValue="BANK_TRANSFER">
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CHEQUE">Cheque</option>
            <option value="UPI">UPI</option>
          </Select>
        </Field>
        <Field label="Reference" hint="Cheque no., UTR or UPI reference (required unless cash)" htmlFor="vp-ref"><Input id="vp-ref" name="reference" maxLength={60} /></Field>
      </div>
      {bills.length ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">Allocate to bills (optional)</p>
          {bills.map((b) => (
            <div key={b.voucherId} className="flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-0 truncate">{b.number} · bill {b.supplierInvoiceNo} · due {b.dueDate}</span>
              <span className="tnum text-ink-muted">{rupees(b.reducibleMinor)}</span>
              <Input className="w-32" inputMode="decimal" placeholder="0.00" value={alloc[b.voucherId] ?? ''} onChange={(e) => setAlloc((a) => ({ ...a, [b.voucherId]: e.target.value }))} aria-label={`Amount for ${b.number}`} />
            </div>
          ))}
        </div>
      ) : <Notice tone="info">No bills are open; the payment will be held on account as an advance to this vendor.</Notice>}
      <Field label="Narration" htmlFor="vp-narration"><Textarea id="vp-narration" name="narration" rows={2} maxLength={500} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Posting…' : 'Record payment'}</Button>
      </div>
    </form>
  )
}

// ------------------------------------------------------------------ debit note

export type ReturnableLine = { id: string; description: string; quantity: number; remainingQuantity: number; remainingMinor: number }

export function DebitNoteDialog({ voucherId, voucherNumber, lines, approvals }: { voucherId: string; voucherNumber: string; lines: ReturnableLine[]; approvals: boolean }) {
  return (
    <FormDialog
      title={`Debit note against ${voucherNumber}`}
      description={approvals ? 'Goes for approval; posts only when another authorised user approves it.' : 'Posts on save: Dr Sundry Creditors, Cr the original account heads.'}
      trigger={(open) => <Button size="sm" variant="ghost" onClick={open}>Debit note</Button>}
    >
      {(close, key) => <DebitNoteForm voucherId={voucherId} lines={lines} idempotencyKey={key} onDone={close} />}
    </FormDialog>
  )
}

function DebitNoteForm({ voucherId, lines, idempotencyKey, onDone }: { voucherId: string; lines: ReturnableLine[]; idempotencyKey: string; onDone: () => void }) {
  const { busy, error, setError, run } = useSubmit(onDone)
  const [qty, setQty] = React.useState<Record<string, string>>({})
  const [value, setValue] = React.useState<Record<string, string>>({})
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const picked: { voucherLineId: string; quantity: number; amountMinor?: number }[] = []
    for (const l of lines) {
      const q = Number(qty[l.id] || 0)
      const v = (value[l.id] ?? '').trim()
      if (q > 0) picked.push({ voucherLineId: l.id, quantity: q })
      else if (v) {
        const m = parseMoneyToMinor(v)
        if (!m) {
          setError('Allowance amounts must be in rupees, with at most two decimals')
          return
        }
        picked.push({ voucherLineId: l.id, quantity: 0, amountMinor: m })
      }
    }
    if (!picked.length) {
      setError('Enter a quantity or an amount on at least one line')
      return
    }
    void run(() => callApi('/api/v1/accounting/debit-notes', {
      method: 'POST',
      body: { voucherId, noteDate: String(f.get('noteDate') ?? ''), reason: String(f.get('reason') ?? ''), lines: picked, idempotencyKey },
    }))
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label="Note date" required htmlFor="dn-date"><Input id="dn-date" name="noteDate" type="date" required className="w-44" /></Field>
      <div className="space-y-1">
        <div className="grid grid-cols-12 gap-2 text-xs text-ink-muted">
          <span className="col-span-5">Line</span><span className="col-span-3 text-right">Still returnable</span><span className="col-span-2">Qty</span><span className="col-span-2">or ₹ (pre-tax)</span>
        </div>
        {lines.map((l) => (
          <div key={l.id} className="grid grid-cols-12 gap-2 items-center text-sm">
            <span className="col-span-5 truncate">{l.description}</span>
            <span className="col-span-3 text-right tnum text-ink-muted">{l.remainingQuantity} of {l.quantity} · {rupees(l.remainingMinor)}</span>
            <Input className="col-span-2" type="number" min={0} max={l.remainingQuantity} step={1} value={qty[l.id] ?? ''} onChange={(e) => setQty((s) => ({ ...s, [l.id]: e.target.value }))} disabled={l.remainingMinor <= 0} aria-label={`Quantity returned for ${l.description}`} />
            <Input className="col-span-2" inputMode="decimal" value={value[l.id] ?? ''} onChange={(e) => setValue((s) => ({ ...s, [l.id]: e.target.value }))} disabled={l.remainingMinor <= 0 || Number(qty[l.id] || 0) > 0} aria-label={`Allowance for ${l.description}`} />
          </div>
        ))}
      </div>
      <Field label="Inspection / rejection reason" required htmlFor="dn-reason"><Textarea id="dn-reason" name="reason" rows={3} required minLength={3} maxLength={1000} /></Field>
      <p className="text-xs text-ink-subtle">Attach the inspection report after saving. Limits count every earlier return still pending or approved.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Raise debit note'}</Button>
      </div>
    </form>
  )
}

// ------------------------------------------------------------------ discount / write-off

export function VendorAdjustmentDialog({ voucherId, voucherNumber, reducibleMinor }: { voucherId: string; voucherNumber: string; reducibleMinor: number }) {
  return (
    <FormDialog
      title={`Discount or write-off on ${voucherNumber}`}
      description={`Up to ${rupees(reducibleMinor)}. Recorded separately from debit notes.`}
      size="md"
      trigger={(open) => <Button size="sm" variant="ghost" onClick={open} disabled={reducibleMinor <= 0}>Discount / write-off</Button>}
    >
      {(close, key) => <AdjustmentForm voucherId={voucherId} idempotencyKey={key} onDone={close} />}
    </FormDialog>
  )
}

function AdjustmentForm({ voucherId, idempotencyKey, onDone }: { voucherId: string; idempotencyKey: string; onDone: () => void }) {
  const { busy, error, setError, run } = useSubmit(onDone)
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const amountMinor = parseMoneyToMinor(String(f.get('amount') ?? ''))
    if (!amountMinor) {
      setError('Enter the amount in rupees')
      return
    }
    void run(() => callApi('/api/v1/accounting/vendor-adjustments', {
      method: 'POST',
      body: {
        voucherId,
        type: String(f.get('type')),
        adjustedOn: String(f.get('adjustedOn') ?? ''),
        amountMinor,
        reason: String(f.get('reason') ?? ''),
        idempotencyKey,
      },
    }))
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Type" htmlFor="va-type">
          <Select id="va-type" name="type" defaultValue="DISCOUNT">
            <option value="DISCOUNT">Discount received</option>
            <option value="WRITE_OFF">Write-off (balance written back)</option>
          </Select>
        </Field>
        <Field label="Date" required htmlFor="va-date"><Input id="va-date" name="adjustedOn" type="date" required /></Field>
        <Field label="Amount (₹)" required htmlFor="va-amount"><Input id="va-amount" name="amount" inputMode="decimal" required /></Field>
      </div>
      <Field label="Reason" required htmlFor="va-reason"><Textarea id="va-reason" name="reason" rows={2} required minLength={3} maxLength={1000} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post adjustment'}</Button>
      </div>
    </form>
  )
}

// ------------------------------------------------------------------ actions and attachments

export function DocumentAction({
  url,
  action,
  label,
  needsReason,
  variant = 'ghost',
}: {
  url: string
  action: 'post' | 'cancel' | 'approve' | 'reject' | 'reverse' | 'reverse-disposal'
  label: string
  needsReason?: boolean
  variant?: 'ghost' | 'secondary' | 'danger' | 'primary'
}) {
  return (
    <FormDialog
      title={label}
      size="sm"
      trigger={(open) => <Button size="sm" variant={variant} onClick={open}>{label}</Button>}
    >
      {(close) => <ActionForm url={url} action={action} label={label} needsReason={needsReason} onDone={close} />}
    </FormDialog>
  )
}

function ActionForm({ url, action, label, needsReason, onDone }: { url: string; action: string; label: string; needsReason?: boolean; onDone: () => void }) {
  const { busy, error, run } = useSubmit(onDone)
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '')
    void run(() => callApi(url, { method: 'POST', body: needsReason ? { action, reason } : { action } }))
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {needsReason ? (
        <Field label="Reason" required htmlFor="act-reason"><Textarea id="act-reason" name="reason" rows={3} required minLength={3} maxLength={1000} /></Field>
      ) : (
        <p className="text-sm text-ink-muted">This posts to the ledger. Corrections afterwards are made by reversal, never by editing.</p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Back</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Working…' : label}</Button>
      </div>
    </form>
  )
}

export function AttachmentUpload({ url, current, downloadUrl }: { url: string; current?: string | null; downloadUrl?: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.set('file', file)
    const result = await callApi(url, { method: 'POST', form })
    setBusy(false)
    if (!result.ok) setError(result.message)
    else router.refresh()
  }
  return (
    <span className="inline-flex items-center gap-2">
      {current ? <a href={downloadUrl ?? url} className="text-sm text-[var(--brand-600)] hover:underline">{current}</a> : null}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
          e.target.value = ''
        }}
      />
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Uploading…' : current ? 'Replace file' : 'Attach file'}
      </Button>
      {error ? <span className="text-xs text-[var(--danger)]" role="alert">{error}</span> : null}
    </span>
  )
}
