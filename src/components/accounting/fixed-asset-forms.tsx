'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { parseMoneyToMinor } from '@/server/modules/accounting/money'
import { defaultResidualMinor, parseRateToBp, suggestWdvRateBp } from '@/server/modules/accounting/fixed-assets'
import { callApi, FormDialog, useSubmit } from './payables-forms'

export type LedgerOption = { id: string; label: string }

function rupees(minor: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(minor / 100)
}

function moneyOrNull(value: FormDataEntryValue | null): number | null | 'invalid' {
  const text = String(value ?? '').trim()
  if (!text) return null
  return parseMoneyToMinor(text) ?? 'invalid'
}

// ------------------------------------------------------------------ new asset

export function FixedAssetDialog({
  assetLedgers,
  funding,
  inventory,
  categories,
  defaultAssetLedgerId,
  today,
  prefill,
}: {
  assetLedgers: LedgerOption[]
  funding: LedgerOption[]
  inventory: LedgerOption[]
  categories: string[]
  defaultAssetLedgerId: string | null
  today: string
  /** Capitalising an inventory register item: opens the dialog with its details filled in. */
  prefill?: FixedAssetPrefill
}) {
  return (
    <FormDialog
      title="Add fixed asset"
      description="Depreciated by written-down value at an annual rate. Cost already in the books (purchase voucher, journal or opening balance) is not posted again."
      trigger={(open) => <Button size="sm" onClick={open}>Add asset</Button>}
      defaultOpen={!!prefill}
    >
      {(close, key) => (
        <FixedAssetForm
          assetLedgers={assetLedgers}
          funding={funding}
          inventory={inventory}
          categories={categories}
          defaultAssetLedgerId={defaultAssetLedgerId}
          today={today}
          idempotencyKey={key}
          onDone={close}
          prefill={prefill}
        />
      )}
    </FormDialog>
  )
}

export type FixedAssetPrefill = {
  inventoryAssetId: string
  name: string
  location: string | null
  capitalisedOn: string | null
  costMinor: number | null
}

function FixedAssetForm({
  assetLedgers,
  funding,
  inventory,
  categories,
  defaultAssetLedgerId,
  today,
  idempotencyKey,
  onDone,
  prefill,
}: {
  assetLedgers: LedgerOption[]
  funding: LedgerOption[]
  inventory: LedgerOption[]
  categories: string[]
  defaultAssetLedgerId: string | null
  today: string
  idempotencyKey: string
  onDone: () => void
  prefill?: FixedAssetPrefill
}) {
  const { busy, error, setError, run } = useSubmit(onDone)
  const [cost, setCost] = React.useState(prefill?.costMinor ? (prefill.costMinor / 100).toFixed(2) : '')
  const [residual, setResidual] = React.useState('')
  const [lifeYears, setLifeYears] = React.useState('')
  const [rate, setRate] = React.useState('')
  const [capitalisation, setCapitalisation] = React.useState<'EXISTING' | 'POSTED'>('EXISTING')
  const costMinor = parseMoneyToMinor(cost)
  const defaultResidual = costMinor ? defaultResidualMinor(costMinor) : null

  const suggest = () => {
    const residualMinor = residual.trim() ? parseMoneyToMinor(residual) : defaultResidual
    const months = Math.round(Number(lifeYears) * 12)
    const bp = costMinor && residualMinor && months > 0 ? suggestWdvRateBp(costMinor, residualMinor, months) : null
    if (!bp) {
      setError('Enter the cost, a useful life in years and a residual value above zero to suggest a rate')
      return
    }
    setError(null)
    setRate((bp / 100).toFixed(2))
  }

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const residualMinor = moneyOrNull(residual)
    const openingAccumulatedMinor = moneyOrNull(f.get('openingAccumulated'))
    const rateBp = parseRateToBp(rate)
    if (!costMinor) return setError('Enter the cost in rupees, with at most two decimals')
    if (residualMinor === 'invalid' || openingAccumulatedMinor === 'invalid') return setError('Amounts must be in rupees, with at most two decimals')
    if (!rateBp) return setError('Enter the annual WDV rate as a percentage, e.g. 18.10')
    const life = lifeYears.trim() ? Math.round(Number(lifeYears) * 12) : null
    if (life !== null && !(life > 0 && life <= 1200)) return setError('Useful life must be between 1 month and 100 years')
    void run(() => callApi('/api/v1/accounting/fixed-assets', {
      method: 'POST',
      body: {
        name: String(f.get('name') ?? ''),
        category: String(f.get('category') ?? ''),
        location: String(f.get('location') ?? ''),
        department: String(f.get('department') ?? ''),
        inventoryAssetId: String(f.get('inventoryAssetId') ?? ''),
        capitalisedOn: String(f.get('capitalisedOn') ?? ''),
        depreciationStartOn: String(f.get('depreciationStartOn') ?? '') || undefined,
        costMinor,
        residualMinor: residualMinor ?? undefined,
        usefulLifeMonths: life,
        rateBp,
        openingAccumulatedMinor: openingAccumulatedMinor ?? 0,
        assetAccountId: String(f.get('assetAccountId') ?? ''),
        capitalisation,
        fundingAccountId: capitalisation === 'POSTED' ? String(f.get('fundingAccountId') ?? '') : '',
        notes: String(f.get('notes') ?? ''),
        idempotencyKey,
      },
    }))
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Asset name" required htmlFor="fa-name"><Input id="fa-name" name="name" required minLength={2} maxLength={160} defaultValue={prefill?.name} /></Field>
        <Field label="Category" required htmlFor="fa-category">
          <Input id="fa-category" name="category" required minLength={2} maxLength={80} list="fa-categories" placeholder="Furniture, Computers, Vehicles…" />
          <datalist id="fa-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Location" htmlFor="fa-location"><Input id="fa-location" name="location" maxLength={120} defaultValue={prefill?.location ?? undefined} /></Field>
        <Field label="Department" htmlFor="fa-dept"><Input id="fa-dept" name="department" maxLength={120} /></Field>
        <Field label="Capitalised on" required htmlFor="fa-cap"><Input id="fa-cap" name="capitalisedOn" type="date" required defaultValue={prefill?.capitalisedOn ?? today} /></Field>
        <Field label="Depreciation starts" hint="Defaults to the capitalisation date (put to use)" htmlFor="fa-start"><Input id="fa-start" name="depreciationStartOn" type="date" /></Field>
        <Field label="Cost (₹)" required htmlFor="fa-cost"><Input id="fa-cost" inputMode="decimal" required value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
        <Field label="Residual value (₹)" hint={defaultResidual !== null ? `Leave blank for 5% of cost: ${rupees(defaultResidual)}` : '5% of cost if left blank'} htmlFor="fa-residual">
          <Input id="fa-residual" inputMode="decimal" value={residual} onChange={(e) => setResidual(e.target.value)} />
        </Field>
        <Field label="Useful life (years)" hint="Optional; the last year writes down to residual" htmlFor="fa-life">
          <Input id="fa-life" inputMode="decimal" value={lifeYears} onChange={(e) => setLifeYears(e.target.value)} />
        </Field>
        <Field label="Annual WDV rate (%)" required htmlFor="fa-rate">
          <div className="flex gap-2">
            <Input id="fa-rate" inputMode="decimal" required value={rate} onChange={(e) => setRate(e.target.value)} placeholder="18.10" />
            <Button type="button" size="sm" variant="secondary" onClick={suggest}>From life</Button>
          </div>
        </Field>
        <Field label="Asset ledger" htmlFor="fa-ledger">
          <Select id="fa-ledger" name="assetAccountId" defaultValue={defaultAssetLedgerId ?? ''}>
            {assetLedgers.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
        <Field label="Depreciation brought forward (₹)" hint="Only for assets already part-depreciated in the books" htmlFor="fa-opening">
          <Input id="fa-opening" name="openingAccumulated" inputMode="decimal" disabled={capitalisation === 'POSTED'} />
        </Field>
        {inventory.length ? (
          <Field label="Inventory item" hint="Optional link to the inventory register" htmlFor="fa-inv" className="sm:col-span-2">
            <Select id="fa-inv" name="inventoryAssetId" defaultValue={prefill?.inventoryAssetId ?? ''}>
              <option value="">Not linked</option>
              {inventory.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </Select>
          </Field>
        ) : null}
      </div>
      <fieldset className="space-y-2 rounded-lg border border-[var(--border)] p-3">
        <legend className="px-1 text-sm font-medium text-ink">Cost in the books</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="capitalisation" checked={capitalisation === 'EXISTING'} onChange={() => setCapitalisation('EXISTING')} />
          <span>Already in the books (purchase voucher, journal or opening balance). Nothing is posted.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="capitalisation" checked={capitalisation === 'POSTED'} onChange={() => setCapitalisation('POSTED')} />
          <span>Post now: Dr the asset ledger, Cr the ledger it was paid from.</span>
        </label>
        {capitalisation === 'POSTED' ? (
          <Field label="Paid from" required htmlFor="fa-funding">
            <Select id="fa-funding" name="fundingAccountId" required defaultValue="">
              <option value="" disabled>Choose cash, bank or opening balance</option>
              {funding.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </Field>
        ) : null}
      </fieldset>
      <Field label="Notes" htmlFor="fa-notes"><Textarea id="fa-notes" name="notes" rows={2} maxLength={1000} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add asset'}</Button>
      </div>
    </form>
  )
}

// ------------------------------------------------------------------ edit

export type EditableAsset = {
  id: string
  name: string
  category: string
  location: string | null
  department: string | null
  notes: string | null
  rateBp: number
  residualMinor: number
  usefulLifeMonths: number | null
}

export function EditFixedAssetDialog({ asset, hasPosted, termsLocked }: { asset: EditableAsset; hasPosted: boolean; termsLocked: boolean }) {
  return (
    <FormDialog
      title={`Edit ${asset.name}`}
      description={hasPosted ? 'Posted depreciation is never recalculated. A new rate applies from the day after the last posted period.' : undefined}
      trigger={(open) => <Button size="sm" variant="secondary" onClick={open}>Edit</Button>}
    >
      {(close) => <EditForm asset={asset} hasPosted={hasPosted} termsLocked={termsLocked} onDone={close} />}
    </FormDialog>
  )
}

function EditForm({ asset, hasPosted, termsLocked, onDone }: { asset: EditableAsset; hasPosted: boolean; termsLocked: boolean; onDone: () => void }) {
  const { busy, error, setError, run } = useSubmit(onDone)
  const [rate, setRate] = React.useState((asset.rateBp / 100).toFixed(2))
  const rateBp = parseRateToBp(rate)
  const rateChanged = rateBp !== null && rateBp !== asset.rateBp

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const body: Record<string, unknown> = {
      name: String(f.get('name') ?? ''),
      category: String(f.get('category') ?? ''),
      location: String(f.get('location') ?? ''),
      department: String(f.get('department') ?? ''),
      notes: String(f.get('notes') ?? ''),
    }
    if (!termsLocked) {
      if (!rateBp) return setError('Enter the annual WDV rate as a percentage')
      const residualMinor = parseMoneyToMinor(String(f.get('residual') ?? ''))
      if (residualMinor === null) return setError('Residual value must be in rupees')
      const lifeText = String(f.get('life') ?? '').trim()
      const life = lifeText ? Math.round(Number(lifeText) * 12) : null
      if (life !== null && !(life > 0 && life <= 1200)) return setError('Useful life must be between 1 month and 100 years')
      if (rateChanged) {
        body.rateBp = rateBp
        body.rateReason = String(f.get('rateReason') ?? '')
      }
      if (residualMinor !== asset.residualMinor) body.residualMinor = residualMinor
      if (life !== asset.usefulLifeMonths) body.usefulLifeMonths = life
    }
    void run(() => callApi(`/api/v1/accounting/fixed-assets/${asset.id}`, { method: 'PATCH', body }))
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Asset name" required htmlFor="fe-name"><Input id="fe-name" name="name" required defaultValue={asset.name} maxLength={160} /></Field>
        <Field label="Category" required htmlFor="fe-cat"><Input id="fe-cat" name="category" required defaultValue={asset.category} maxLength={80} /></Field>
        <Field label="Location" htmlFor="fe-loc"><Input id="fe-loc" name="location" defaultValue={asset.location ?? ''} maxLength={120} /></Field>
        <Field label="Department" htmlFor="fe-dept"><Input id="fe-dept" name="department" defaultValue={asset.department ?? ''} maxLength={120} /></Field>
      </div>
      {termsLocked ? (
        <Notice tone="info">Depreciation terms cannot change while the asset is disposed of or in a run awaiting approval.</Notice>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Annual WDV rate (%)" required htmlFor="fe-rate"><Input id="fe-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} required /></Field>
          <Field label="Residual value (₹)" required htmlFor="fe-res"><Input id="fe-res" name="residual" inputMode="decimal" required defaultValue={(asset.residualMinor / 100).toFixed(2)} /></Field>
          <Field label="Useful life (years)" htmlFor="fe-life"><Input id="fe-life" name="life" inputMode="decimal" defaultValue={asset.usefulLifeMonths ? String(+(asset.usefulLifeMonths / 12).toFixed(2)) : ''} /></Field>
          {rateChanged && hasPosted ? (
            <Field label="Reason for the rate change" required htmlFor="fe-reason" className="sm:col-span-3">
              <Textarea id="fe-reason" name="rateReason" rows={2} required minLength={3} maxLength={500} />
            </Field>
          ) : null}
        </div>
      )}
      <Field label="Notes" htmlFor="fe-notes"><Textarea id="fe-notes" name="notes" rows={2} defaultValue={asset.notes ?? ''} maxLength={1000} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  )
}

// ------------------------------------------------------------------ dispose

export function DisposeAssetDialog({ assetId, cashAccounts, today }: { assetId: string; cashAccounts: LedgerOption[]; today: string }) {
  return (
    <FormDialog
      title="Dispose of asset"
      description="Depreciates up to and including the disposal date, removes cost and accumulated depreciation, and books the gain or loss."
      size="md"
      trigger={(open) => <Button size="sm" variant="secondary" onClick={open}>Dispose</Button>}
    >
      {(close) => <DisposeForm assetId={assetId} cashAccounts={cashAccounts} today={today} onDone={close} />}
    </FormDialog>
  )
}

function DisposeForm({ assetId, cashAccounts, today, onDone }: { assetId: string; cashAccounts: LedgerOption[]; today: string; onDone: () => void }) {
  const { busy, error, setError, run } = useSubmit(onDone)
  const [proceeds, setProceeds] = React.useState('')
  const proceedsMinor = proceeds.trim() ? parseMoneyToMinor(proceeds) : 0
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (proceedsMinor === null) return setError('Sale proceeds must be in rupees, with at most two decimals')
    void run(() => callApi(`/api/v1/accounting/fixed-assets/${assetId}`, {
      method: 'POST',
      body: {
        action: 'dispose',
        disposedOn: String(f.get('disposedOn') ?? ''),
        proceedsMinor,
        proceedsAccountId: proceedsMinor > 0 ? String(f.get('proceedsAccountId') ?? '') : undefined,
        reason: String(f.get('reason') ?? ''),
      },
    }))
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Disposal date" required htmlFor="fd-date"><Input id="fd-date" name="disposedOn" type="date" required defaultValue={today} max={today} /></Field>
        <Field label="Sale proceeds (₹)" hint="0 if scrapped or written off" htmlFor="fd-proceeds"><Input id="fd-proceeds" inputMode="decimal" value={proceeds} onChange={(e) => setProceeds(e.target.value)} /></Field>
        {proceedsMinor ? (
          <Field label="Received into" required htmlFor="fd-account" className="sm:col-span-2">
            <Select id="fd-account" name="proceedsAccountId" required defaultValue="">
              <option value="" disabled>Choose cash or bank</option>
              {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </Field>
        ) : null}
      </div>
      <Field label="Reason" required htmlFor="fd-reason"><Textarea id="fd-reason" name="reason" rows={2} required minLength={3} maxLength={500} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Back</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Posting…' : 'Dispose and post'}</Button>
      </div>
    </form>
  )
}

// ------------------------------------------------------------------ runs + settings

export function RunDepreciationButton({ periodEnd, label }: { periodEnd: string; label: string }) {
  const router = useRouter()
  const [key] = React.useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const runIt = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await callApi('/api/v1/accounting/fixed-assets/depreciation', { method: 'POST', body: { periodEnd, idempotencyKey: key } })
    setBusy(false)
    if (!result.ok) setError(result.message)
    else router.refresh()
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button onClick={() => void runIt()} disabled={busy}>{busy ? 'Working…' : label}</Button>
      {error ? <span className="text-sm text-[var(--danger)]">{error}</span> : null}
    </span>
  )
}

export function FrequencySelect({ value }: { value: 'MONTHLY' | 'YEARLY' }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const change = async (next: string) => {
    setBusy(true)
    setError(null)
    const result = await callApi('/api/v1/accounting/fixed-assets/settings', { method: 'POST', body: { depreciationFrequency: next } })
    setBusy(false)
    if (!result.ok) setError(result.message)
    else router.push('/accounts/fixed-assets/depreciation')
  }
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="text-ink-muted">Runs</span>
      <Select value={value} disabled={busy} onChange={(e) => void change(e.target.value)} className="w-32" aria-label="Depreciation frequency">
        <option value="YEARLY">Yearly</option>
        <option value="MONTHLY">Monthly</option>
      </Select>
      {error ? <span className="text-[var(--danger)]">{error}</span> : null}
    </span>
  )
}
