'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Plus, Receipt, Search, Split, X } from 'lucide-react'
import { collectPaymentAction } from '../actions'
import { EditableInvoiceAmounts } from '../students/invoice-amount-editor'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'
import { formatDay, toDateInput } from '@/lib/dates'

const MODE_LABELS: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  CHEQUE: 'Cheque',
  BANK_TRANSFER: 'Bank transfer',
  NET_BANKING: 'Net banking',
}
const MODES = Object.keys(MODE_LABELS)

/** One-tap starting points for charges a counter adds on the spot. */
const CHARGE_PRESETS = ['Late fine', 'School trip', 'Exam fee', 'Other charge']

// crypto.randomUUID only exists in secure contexts (HTTPS / localhost).
function newIdempotencyKey() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

let rowSeq = 0
const rowKey = () => `r${++rowSeq}`

type StudentHit = {
  id: string
  admissionNo: string
  firstName: string
  lastName: string
  className: string | null
  sectionName: string | null
  /** Primary parent / guardian display name when linked. */
  parentName: string | null
  dueMinor: number
}

type Invoice = {
  id: string
  number: string
  title: string
  dueOn: string
  totalMinor: number
  paidMinor: number
  balanceMinor: number
  status: string
}

type CollectorOption = {
  id: string
  name: string
  employeeCode: string | null
}

type ChargeRow = { key: string; feeHeadId: string; label: string; amount: string }
type SplitRow = { key: string; mode: string; amount: string; reference: string }

const toMinor = (value: string) => {
  const n = Math.round(Number(value || 0) * 100)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * The fee counter.
 *
 * Built around what a cashier actually does: find the student, see what is
 * owed, add anything charged on the spot, take the money (in one mode or
 * split across several), hand over a receipt. The idempotency key is minted
 * once per form session so a double-click or a retried submit cannot take the
 * money twice.
 */
export function CollectForm({
  currency,
  initialStudentId,
  currentUserId,
  collectors,
  canDiscount,
  canEditAmounts,
  canViewLedger,
  feeHeads,
  nextBillBookNo,
}: {
  currency: string
  initialStudentId?: string
  currentUserId: string
  collectors: CollectorOption[]
  canDiscount: boolean
  canEditAmounts: boolean
  canViewLedger: boolean
  feeHeads: { id: string; name: string }[]
  nextBillBookNo: string
}) {
  const router = useRouter()
  const toast = useToast()

  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState<StudentHit[]>([])
  const [searching, setSearching] = React.useState(false)
  const [searchError, setSearchError] = React.useState<string | null>(null)
  const [student, setStudent] = React.useState<StudentHit | null>(null)
  const [invoices, setInvoices] = React.useState<Invoice[]>([])

  const [amount, setAmount] = React.useState('')
  const [splitting, setSplitting] = React.useState(false)
  const [splits, setSplits] = React.useState<SplitRow[]>([])
  const [charges, setCharges] = React.useState<ChargeRow[]>([])
  const [paidOn, setPaidOn] = React.useState(() => toDateInput(new Date()))
  const [discount, setDiscount] = React.useState('')
  const [discountReason, setDiscountReason] = React.useState('')
  const [mode, setMode] = React.useState('CASH')
  const [collectedById, setCollectedById] = React.useState(
    collectors.some((collector) => collector.id === currentUserId)
      ? currentUserId
      : (collectors[0]?.id ?? ''),
  )
  const [reference, setReference] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [pending, startTransition] = React.useTransition()
  const [confirming, setConfirming] = React.useState(false)
  const [receipt, setReceipt] = React.useState<{
    paymentId: string
    number: string
    advance: number
    discount: number
    billBookNo: string | null
    extraInvoiceNumber: string | null
    receipts: { paymentId: string; receiptNumber: string; mode: string; amountMinor: number }[]
  } | null>(null)

  // One key per attempt; regenerated only after a successful collection.
  const idempotencyKey = React.useRef(newIdempotencyKey())

  const loadStudent = React.useCallback(async (id: string, suggestAmount = true) => {
    const res = await fetch(`/api/v1/finance/collect/students/${id}`)
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.data) {
      toast.push({
        tone: 'error',
        title: 'Could not load this student',
        description: json?.error?.message ?? 'Check your connection and try again.',
      })
      return
    }
    setStudent(json.data.student as StudentHit)
    const rows = json.data.invoices as Invoice[]
    setInvoices(rows)
    if (!suggestAmount) return
    const now = new Date()
    const dueNow = rows
      .filter((invoice) => invoice.balanceMinor > 0 && new Date(invoice.dueOn) <= now)
      .reduce((sum, invoice) => sum + invoice.balanceMinor, 0)
    const due = dueNow || rows.reduce((sum, i) => sum + Math.max(0, i.balanceMinor), 0)
    setAmount(due > 0 ? String(due / 100) : '')
  }, [toast])

  React.useEffect(() => {
    if (!initialStudentId) return
    void loadStudent(initialStudentId)
  }, [initialStudentId, loadStudent])

  React.useEffect(() => {
    if (query.trim().length < 2 || student) {
      setHits([])
      setSearchError(null)
      return
    }
    const controller = new AbortController()
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/finance/collect/students?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setHits([])
          setSearchError(json?.error?.message ?? 'Search failed')
          return
        }
        setSearchError(null)
        setHits((json?.data ?? []) as StudentHit[])
      } catch {
        /* aborted */
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [query, student])

  const openInvoices = invoices.filter((i) => i.balanceMinor > 0)
  const totalDue = openInvoices.reduce((sum, i) => sum + i.balanceMinor, 0)
  const totalAnnual = invoices.reduce((sum, i) => sum + i.totalMinor, 0)
  const totalPaid = invoices.reduce((sum, i) => sum + i.paidMinor, 0)
  const now = new Date()
  const dueNow = openInvoices
    .filter((invoice) => new Date(invoice.dueOn) <= now)
    .reduce((sum, invoice) => sum + invoice.balanceMinor, 0)
  const upcoming = openInvoices
    .filter((invoice) => new Date(invoice.dueOn) > now)
    .reduce((sum, invoice) => sum + invoice.balanceMinor, 0)
  const overdue = openInvoices
    .filter((invoice) => new Date(invoice.dueOn) < now)
    .reduce((sum, invoice) => sum + invoice.balanceMinor, 0)

  const validCharges = charges.filter((c) => c.label.trim().length >= 2 && toMinor(c.amount) > 0)
  const extraMinor = validCharges.reduce((sum, c) => sum + toMinor(c.amount), 0)
  const validSplits = splits.filter((s) => toMinor(s.amount) > 0)
  const amountMinor = splitting
    ? validSplits.reduce((sum, s) => sum + toMinor(s.amount), 0)
    : toMinor(amount)
  const discountMinor = canDiscount ? toMinor(discount) : 0
  const payableMinor = Math.max(0, totalDue + extraMinor - discountMinor)
  const advance = Math.max(0, amountMinor - payableMinor)
  const incompleteCharge = charges.some(
    (c) => (c.label.trim().length > 0 || c.amount !== '') && !(c.label.trim().length >= 2 && toMinor(c.amount) > 0),
  )

  // Adding or removing a charge moves the suggested amount with it, so the
  // cashier is never one edit away from under-collecting.
  const lastExtra = React.useRef(0)
  React.useEffect(() => {
    const delta = extraMinor - lastExtra.current
    lastExtra.current = extraMinor
    if (delta === 0 || splitting) return
    setAmount((current) => {
      const next = Math.max(0, toMinor(current) + delta)
      return next > 0 ? String(next / 100) : ''
    })
  }, [extraMinor, splitting])

  const startSplit = () => {
    const total = toMinor(amount)
    const first = Math.ceil(total / 200) * 100
    setSplits([
      { key: rowKey(), mode, amount: total > 0 ? String(first / 100) : '', reference },
      { key: rowKey(), mode: mode === 'CASH' ? 'UPI' : 'CASH', amount: total > 0 ? String((total - first) / 100) : '', reference: '' },
    ])
    setSplitting(true)
  }

  const stopSplit = () => {
    const total = validSplits.reduce((sum, s) => sum + toMinor(s.amount), 0)
    setAmount(total > 0 ? String(total / 100) : '')
    setMode(validSplits[0]?.mode ?? mode)
    setReference(validSplits[0]?.reference ?? '')
    setSplitting(false)
    setSplits([])
  }

  const addCharge = (label = '') => {
    const head = feeHeads.find((h) => h.name.toLowerCase() === label.toLowerCase())
    setCharges((rows) => [...rows, { key: rowKey(), feeHeadId: head?.id ?? '', label, amount: '' }])
  }

  const submit = () => {
    if (!student) return
    setConfirming(false)
    startTransition(async () => {
      const result = await collectPaymentAction({
        studentId: student.id,
        collectedById,
        ...(splitting
          ? {
              payments: validSplits.map((s) => ({
                mode: s.mode,
                amount: toMinor(s.amount) / 100,
                reference: s.reference.trim() || undefined,
              })),
            }
          : { amount: amountMinor / 100, mode, reference: reference || undefined }),
        extraCharges: validCharges.length
          ? validCharges.map((c) => ({
              feeHeadId: c.feeHeadId || undefined,
              label: c.label.trim(),
              amount: toMinor(c.amount) / 100,
            }))
          : undefined,
        paidOn,
        discount: discountMinor > 0 ? discountMinor / 100 : undefined,
        discountReason: discountMinor > 0 ? discountReason.trim() : undefined,
        notes: notes || undefined,
        idempotencyKey: idempotencyKey.current,
      })

      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Payment not recorded', description: result.message })
        return
      }

      toast.push({ tone: 'success', title: 'Payment recorded', description: result.message })
      setReceipt({
        paymentId: result.data?.paymentId ?? '',
        number: result.data?.receiptNumber ?? '',
        advance: result.data?.unallocatedMinor ?? 0,
        discount: result.data?.discountedMinor ?? 0,
        billBookNo: result.data?.billBookNo ?? null,
        extraInvoiceNumber: result.data?.extraInvoiceNumber ?? null,
        receipts: result.data?.receipts ?? [],
      })
      idempotencyKey.current = newIdempotencyKey()
      router.refresh()
    })
  }

  const reset = () => {
    setStudent(null)
    setInvoices([])
    setQuery('')
    setAmount('')
    setSplitting(false)
    setSplits([])
    setCharges([])
    lastExtra.current = 0
    setPaidOn(toDateInput(new Date()))
    setDiscount('')
    setDiscountReason('')
    setCollectedById(
      collectors.some((collector) => collector.id === currentUserId)
        ? currentUserId
        : (collectors[0]?.id ?? ''),
    )
    setReference('')
    setNotes('')
    setReceipt(null)
  }

  if (receipt) {
    return (
      <Card>
        <CardContent className="pt-8 pb-8 text-center">
          <div className="size-12 rounded-full bg-success-bg text-success grid place-items-center mx-auto mb-4">
            <CheckCircle2 className="size-6" aria-hidden />
          </div>
          <p className="text-xl font-semibold text-ink">Payment recorded</p>
          <p className="text-base text-ink-muted mt-1">
            {receipt.receipts.length > 1 ? 'Receipts ' : 'Receipt '}
            <span className="font-medium text-ink tnum">
              {receipt.receipts.length > 1
                ? receipt.receipts.map((r) => r.receiptNumber).join(', ')
                : receipt.number}
            </span>
            {receipt.billBookNo
              ? <> · bill book <span className="font-medium text-ink tnum">{receipt.billBookNo}</span></>
              : null}
            {receipt.discount > 0
              ? ` · ${formatMoney(receipt.discount, currency)} discounted`
              : ''}
            {receipt.advance > 0
              ? ` · ${formatMoney(receipt.advance, currency)} held as advance`
              : ''}
          </p>
          {receipt.receipts.length > 1 ? (
            <p className="mt-1 text-sm text-ink-muted">
              Paid as{' '}
              {receipt.receipts
                .map((r) => `${MODE_LABELS[r.mode] ?? r.mode} ${formatMoney(r.amountMinor, currency)}`)
                .join(' + ')}
            </p>
          ) : null}
          {receipt.extraInvoiceNumber ? (
            <p className="mt-1 text-sm text-ink-muted">
              Extra charges billed on invoice{' '}
              <span className="font-medium text-ink tnum">{receipt.extraInvoiceNumber}</span>
            </p>
          ) : null}
          <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
            <Button onClick={reset}>Collect another payment</Button>
            {student && canViewLedger ? (
              <Link
                href={`/finance/students/${student.id}`}
                className={buttonVariants({ variant: 'secondary' })}
              >
                View ledger
              </Link>
            ) : null}
            <Link href={`/finance/payments/${receipt.paymentId}`} className={buttonVariants({ variant: 'secondary' })}>
              <Receipt className="size-4" aria-hidden />
              Print or download receipt
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
      <Card>
        <CardHeader>
          <CardTitle>{student ? 'Payment details' : 'Find the student'}</CardTitle>
          {student ? (
            <Button variant="ghost" size="sm" onClick={reset}>
              Change student
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="pt-0 space-y-4">
          {!student ? (
            <>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-subtle"
                  aria-hidden
                />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Name, admission number, parent or phone"
                  className="pl-9"
                  aria-label="Search for a student"
                />
                {searching ? (
                  <Loader2
                    className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-ink-subtle"
                    aria-hidden
                  />
                ) : null}
              </div>

              {searchError ? (
                <p className="text-sm text-[var(--danger)]">{searchError}</p>
              ) : hits.length > 0 ? (
                <ul className="divide-y divide-[var(--border)] border border-line rounded-[var(--radius)]">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button
                        onClick={async () => {
                          setStudent(h)
                          await loadStudent(h.id)
                        }}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-surface-2 flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm text-ink truncate">
                            {h.firstName} {h.lastName}
                          </span>
                          <span className="block text-xs text-ink-subtle truncate">
                            {h.admissionNo}
                            {h.parentName ? ` · Parent: ${h.parentName}` : ''}
                            {h.className ? ` · ${h.className} ${h.sectionName ?? ''}`.trimEnd() : ''}
                          </span>
                        </span>
                        {h.dueMinor > 0 ? (
                          <Badge tone="warning">{formatMoney(h.dueMinor, currency)} due</Badge>
                        ) : (
                          <Badge tone="success">paid up</Badge>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : query.trim().length >= 2 && !searching ? (
                <p className="text-sm text-ink-muted">No students match that search.</p>
              ) : null}
            </>
          ) : (
            <>
              <div className="rounded-[var(--radius)] bg-surface-2 border border-line px-3.5 py-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-medium text-ink">
                    {student.firstName} {student.lastName}
                  </p>
                  <p className="text-xs text-ink-subtle">
                    {student.admissionNo}
                    {student.parentName ? ` · Parent: ${student.parentName}` : ''}
                    {student.className ? ` · ${student.className} ${student.sectionName ?? ''}`.trimEnd() : ''}
                  </p>
                </div>
                {canViewLedger ? (
                  <Link
                    href={`/finance/students/${student.id}`}
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                  >
                    View ledger
                  </Link>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-[var(--radius-sm)] border border-line px-3.5 py-3 sm:grid-cols-4">
                <div><p className="text-xs text-ink-muted">Annual fee</p><p className="text-sm font-medium tnum">{formatMoney(totalAnnual, currency)}</p></div>
                <div><p className="text-xs text-ink-muted">Paid</p><p className="text-sm font-medium tnum text-success">{formatMoney(totalPaid, currency)}</p></div>
                <div><p className="text-xs text-ink-muted">Due now</p><p className="text-sm font-semibold tnum">{formatMoney(dueNow, currency)}</p></div>
                <div><p className="text-xs text-ink-muted">Upcoming</p><p className="text-sm font-medium tnum">{formatMoney(upcoming, currency)}</p></div>
                {overdue > 0 ? <p className="col-span-2 text-xs text-[var(--danger)] sm:col-span-4">{formatMoney(overdue, currency)} is overdue</p> : null}
              </div>

              <section className="rounded-[var(--radius)] border border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-ink">Extra charges</p>
                    <p className="text-xs text-ink-subtle">
                      Fine, school trip or anything else to bill and collect right now
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CHARGE_PRESETS.map((preset) => (
                      <Button
                        key={preset}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => addCharge(preset === 'Other charge' ? '' : preset)}
                      >
                        <Plus className="size-3.5" aria-hidden />
                        {preset}
                      </Button>
                    ))}
                  </div>
                </div>
                {charges.length > 0 ? (
                  <ul className="divide-y divide-[var(--border)] border-t border-line">
                    {charges.map((charge) => (
                      <li key={charge.key} className="grid gap-2 px-3.5 py-2.5 sm:grid-cols-[180px_1fr_120px_auto] sm:items-center">
                        <Select
                          aria-label="Fee head"
                          value={charge.feeHeadId}
                          onChange={(e) => {
                            const id = e.target.value
                            const head = feeHeads.find((h) => h.id === id)
                            setCharges((rows) => rows.map((r) => r.key === charge.key
                              ? { ...r, feeHeadId: id, label: head && (!r.label || feeHeads.some((h) => h.name === r.label)) ? head.name : r.label }
                              : r))
                          }}
                        >
                          <option value="">No fee head</option>
                          {feeHeads.map((head) => (
                            <option key={head.id} value={head.id}>{head.name}</option>
                          ))}
                        </Select>
                        <Input
                          aria-label="What is this charge for"
                          placeholder="e.g. School trip to Science City"
                          value={charge.label}
                          maxLength={120}
                          onChange={(e) => setCharges((rows) => rows.map((r) => r.key === charge.key ? { ...r, label: e.target.value } : r))}
                        />
                        <Input
                          aria-label="Charge amount"
                          type="number"
                          min={1}
                          step="1"
                          placeholder="Amount"
                          className="tnum"
                          value={charge.amount}
                          onChange={(e) => setCharges((rows) => rows.map((r) => r.key === charge.key ? { ...r, amount: e.target.value } : r))}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label="Remove charge"
                          onClick={() => setCharges((rows) => rows.filter((r) => r.key !== charge.key))}
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                      </li>
                    ))}
                    <li className="flex items-center justify-between px-3.5 py-2 text-sm">
                      <span className="text-ink-muted">Extra charges total</span>
                      <span className="font-semibold tnum text-ink">{formatMoney(extraMinor, currency)}</span>
                    </li>
                  </ul>
                ) : null}
              </section>

              {!splitting ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Amount received" htmlFor="amount" required>
                    <Input
                      id="amount"
                      type="number"
                      min={1}
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      autoFocus
                    />
                    {amountMinor > 0 ? (
                      <p className="mt-1.5 text-xs text-ink-muted">
                        Outstanding after payment:{' '}
                        <span className="font-medium text-ink tnum">
                          {formatMoney(Math.max(0, payableMinor - amountMinor), currency)}
                        </span>
                        {advance > 0
                          ? ` · ${formatMoney(advance, currency)} held as advance`
                          : ''}
                      </p>
                    ) : null}
                  </Field>

                  <Field label="Mode" htmlFor="mode" required>
                    <Select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                      {MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
                    </Select>
                    <button
                      type="button"
                      onClick={startSplit}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-600)] hover:underline"
                    >
                      <Split className="size-3.5" aria-hidden />
                      Split across cash, UPI and other modes
                    </button>
                  </Field>

                  {mode !== 'CASH' ? (
                    <Field label="Reference" htmlFor="reference" hint="Cheque number, UPI reference or UTR">
                      <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
                    </Field>
                  ) : null}
                </div>
              ) : (
                <section className="rounded-[var(--radius)] border border-line">
                  <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-ink">Split payment</p>
                      <p className="text-xs text-ink-subtle">
                        Each mode gets its own receipt line; together they settle the dues
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={stopSplit}>
                      Use one mode
                    </Button>
                  </div>
                  <ul className="divide-y divide-[var(--border)] border-t border-line">
                    {splits.map((row, index) => (
                      <li key={row.key} className="grid gap-2 px-3.5 py-2.5 sm:grid-cols-[150px_130px_1fr_auto] sm:items-center">
                        <Select
                          aria-label={`Mode ${index + 1}`}
                          value={row.mode}
                          onChange={(e) => setSplits((rows) => rows.map((r) => r.key === row.key ? { ...r, mode: e.target.value } : r))}
                        >
                          {MODES.map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
                        </Select>
                        <Input
                          aria-label={`Amount ${index + 1}`}
                          type="number"
                          min={1}
                          step="1"
                          className="tnum"
                          value={row.amount}
                          onChange={(e) => setSplits((rows) => rows.map((r) => r.key === row.key ? { ...r, amount: e.target.value } : r))}
                        />
                        <Input
                          aria-label={`Reference ${index + 1}`}
                          placeholder={row.mode === 'CASH' ? 'No reference needed' : 'UPI ref / cheque no. / UTR'}
                          disabled={row.mode === 'CASH'}
                          value={row.mode === 'CASH' ? '' : row.reference}
                          onChange={(e) => setSplits((rows) => rows.map((r) => r.key === row.key ? { ...r, reference: e.target.value } : r))}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label="Remove this mode"
                          disabled={splits.length <= 2}
                          onClick={() => setSplits((rows) => rows.filter((r) => r.key !== row.key))}
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3.5 py-2.5 text-sm">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={splits.length >= 6}
                      onClick={() => {
                        const left = Math.max(0, payableMinor - amountMinor)
                        setSplits((rows) => [...rows, { key: rowKey(), mode: 'CARD', amount: left > 0 ? String(left / 100) : '', reference: '' }])
                      }}
                    >
                      <Plus className="size-3.5" aria-hidden />
                      Add another mode
                    </Button>
                    <span className="text-ink-muted">
                      Total <span className="font-semibold tnum text-ink">{formatMoney(amountMinor, currency)}</span>
                      {payableMinor - amountMinor > 0
                        ? ` · ${formatMoney(payableMinor - amountMinor, currency)} still outstanding`
                        : advance > 0
                          ? ` · ${formatMoney(advance, currency)} held as advance`
                          : ' · dues cleared'}
                    </span>
                  </div>
                </section>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Payment date"
                  htmlFor="paidOn"
                  required
                  hint="Use an earlier date for a backdated receipt"
                >
                  <Input
                    id="paidOn"
                    type="date"
                    value={paidOn}
                    max={toDateInput(new Date())}
                    onChange={(e) => setPaidOn(e.target.value)}
                  />
                </Field>

                <Field
                  label="Bill book number"
                  htmlFor="billBookNo"
                  required
                  hint="Issued automatically and never repeated"
                >
                  <Input
                    id="billBookNo"
                    value={nextBillBookNo}
                    readOnly
                    aria-readonly
                    className="tnum bg-surface-2"
                  />
                </Field>
              </div>

              {canDiscount ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Discount"
                    htmlFor="discount"
                    hint="Optional waive applied to the oldest dues first"
                  >
                    <Input
                      id="discount"
                      type="number"
                      min={0}
                      step="1"
                      value={discount}
                      onChange={(e) => {
                        const next = e.target.value
                        setDiscount(next)
                        if (splitting) return
                        const nextDiscountMinor = Math.round(Number(next || 0) * 100)
                        if (Number.isFinite(nextDiscountMinor) && nextDiscountMinor >= 0) {
                          const nextPayable = Math.max(0, totalDue + extraMinor - nextDiscountMinor)
                          setAmount(nextPayable > 0 ? String(nextPayable / 100) : '0')
                        }
                      }}
                    />
                  </Field>
                  <Field
                    label="Discount reason"
                    htmlFor="discountReason"
                    hint={discountMinor > 0 ? 'Required when a discount is given' : 'Shown on the receipt'}
                    required={discountMinor > 0}
                  >
                    <Input
                      id="discountReason"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      placeholder="Sibling concession, principal approval…"
                      maxLength={300}
                    />
                  </Field>
                </div>
              ) : null}

              {discountMinor > 0 ? (
                <p className="text-xs text-ink-muted">
                  Outstanding after discount:{' '}
                  <span className="font-medium text-ink tnum">
                    {formatMoney(payableMinor, currency)}
                  </span>
                </p>
              ) : null}

              <Field
                label="Collected by"
                htmlFor="collectedById"
                hint="Name shown on the receipt"
                required
              >
                <Select
                  id="collectedById"
                  value={collectedById}
                  onChange={(event) => setCollectedById(event.target.value)}
                  required
                  disabled={collectors.length === 0}
                >
                  {collectors.length === 0 ? (
                    <option value="">No active accountant account</option>
                  ) : (
                    collectors.map((collector) => (
                      <option key={collector.id} value={collector.id}>
                        {collector.name}
                        {collector.employeeCode ? ` · ${collector.employeeCode}` : ''}
                        {collector.id === currentUserId ? ' · You' : ''}
                      </option>
                    ))
                  )}
                </Select>
              </Field>

              <Field label="Notes" htmlFor="notes">
                <Textarea
                  id="notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>

              {advance > 0 ? (
                <p className="text-xs text-warning">
                  This is {formatMoney(advance, currency)} more than the outstanding balance. The
                  excess will be recorded as an advance.
                </p>
              ) : null}
              {incompleteCharge ? (
                <p className="text-xs text-[var(--danger)]">
                  Give every extra charge a name and an amount, or remove it.
                </p>
              ) : null}

              <Button
                onClick={() => setConfirming(true)}
                loading={pending}
                disabled={
                  !collectedById ||
                  incompleteCharge ||
                  (splitting && validSplits.length !== splits.length) ||
                  (amountMinor <= 0 && discountMinor <= 0) ||
                  (discountMinor > 0 && discountReason.trim().length < 3)
                }
                size="lg"
              >
                {amountMinor > 0
                  ? `Collect ${formatMoney(amountMinor, currency)}${
                      discountMinor > 0 ? ` · discount ${formatMoney(discountMinor, currency)}` : ''
                    }`
                  : `Apply discount ${formatMoney(discountMinor, currency)}`}
              </Button>

              <Dialog
                open={confirming}
                onClose={() => setConfirming(false)}
                title={amountMinor > 0 ? 'Confirm payment' : 'Confirm discount'}
                size="sm"
                description="Check the details before the receipt is issued."
                footer={
                  <>
                    <Button onClick={submit} loading={pending} autoFocus>
                      {amountMinor > 0 ? `Yes, collect ${formatMoney(amountMinor, currency)}` : 'Yes, apply discount'}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(false)}>Go back</Button>
                  </>
                }
              >
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-ink-muted">Student</dt>
                  <dd className="text-ink">
                    {student.firstName} {student.lastName}
                    <span className="text-ink-subtle"> · {student.admissionNo}</span>
                  </dd>
                  {extraMinor > 0 ? (
                    <>
                      <dt className="text-ink-muted">Extra charges</dt>
                      <dd className="text-ink">
                        {validCharges.map((c) => (
                          <span key={c.key} className="block">
                            {c.label.trim()} <span className="tnum">{formatMoney(toMinor(c.amount), currency)}</span>
                          </span>
                        ))}
                      </dd>
                    </>
                  ) : null}
                  {amountMinor > 0 ? (
                    <>
                      <dt className="text-ink-muted">Amount received</dt>
                      <dd className="text-base font-semibold text-ink tnum">{formatMoney(amountMinor, currency)}</dd>
                    </>
                  ) : null}
                  {discountMinor > 0 ? (
                    <>
                      <dt className="text-ink-muted">Discount</dt>
                      <dd className="text-ink tnum">
                        {formatMoney(discountMinor, currency)}
                        <span className="text-ink-subtle"> · {discountReason.trim()}</span>
                      </dd>
                    </>
                  ) : null}
                  <dt className="text-ink-muted">Mode</dt>
                  <dd className="text-ink">
                    {splitting
                      ? validSplits.map((s) => (
                          <span key={s.key} className="block">
                            {MODE_LABELS[s.mode] ?? s.mode}{' '}
                            <span className="tnum">{formatMoney(toMinor(s.amount), currency)}</span>
                            {s.reference && s.mode !== 'CASH' ? <span className="text-ink-subtle"> · {s.reference}</span> : null}
                          </span>
                        ))
                      : <>
                          {MODE_LABELS[mode] ?? mode}
                          {reference ? <span className="text-ink-subtle"> · {reference}</span> : null}
                        </>}
                  </dd>
                  <dt className="text-ink-muted">Payment date</dt>
                  <dd className="text-ink">{paidOn ? formatDay(new Date(`${paidOn}T00:00:00.000Z`), 'd MMM yyyy') : '—'}</dd>
                  <dt className="text-ink-muted">Collected by</dt>
                  <dd className="text-ink">{collectors.find((collector) => collector.id === collectedById)?.name ?? '—'}</dd>
                  <dt className="text-ink-muted">Bill book no.</dt>
                  <dd className="text-ink tnum">{nextBillBookNo} <span className="text-ink-subtle">(confirmed on save)</span></dd>
                  <dt className="text-ink-muted">Outstanding after</dt>
                  <dd className="text-ink tnum">{formatMoney(Math.max(0, payableMinor - amountMinor), currency)}</dd>
                </dl>
                {advance > 0 ? (
                  <p className="mt-3 text-xs text-warning">
                    {formatMoney(advance, currency)} is more than what is owed and will be held as an advance.
                  </p>
                ) : null}
              </Dialog>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Outstanding</CardTitle>
            <p className="text-sm text-ink-muted mt-0.5">
              {student
                ? canEditAmounts
                  ? `${formatMoney(totalDue, currency)} due · edit any charge below`
                  : formatMoney(totalDue, currency)
                : 'Select a student'}
            </p>
          </div>
        </CardHeader>
        <CardContent className="py-1">
          {!student ? (
            <p className="text-sm text-ink-subtle">
              The unpaid invoices will be listed here, oldest first — which is the order the
              payment settles them in.
            </p>
          ) : openInvoices.length === 0 && extraMinor === 0 ? (
            <p className="text-sm text-success">Nothing outstanding for this student.</p>
          ) : canEditAmounts ? (
            <EditableInvoiceAmounts
              invoices={openInvoices}
              currency={currency}
              canEdit
              onSaved={() => {
                if (student) void loadStudent(student.id, false)
              }}
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {openInvoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">{i.title}</p>
                    <p className="text-xs text-ink-subtle tnum">{i.number}</p>
                  </div>
                  <span className="text-sm font-medium tnum text-ink shrink-0">
                    {formatMoney(i.balanceMinor, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {student && extraMinor > 0 ? (
            <div className="mt-2 border-t border-line pt-2">
              {validCharges.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-sm text-ink truncate">{c.label.trim()} <Badge tone="info">new</Badge></span>
                  <span className="text-sm font-medium tnum text-ink">{formatMoney(toMinor(c.amount), currency)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
