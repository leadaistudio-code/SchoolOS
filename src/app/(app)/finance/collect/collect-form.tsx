'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Receipt, Search } from 'lucide-react'
import { collectPaymentAction } from '../actions'
import { EditableInvoiceAmounts } from '../students/invoice-amount-editor'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'
import { toDateInput } from '@/lib/dates'

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

/**
 * The fee counter.
 *
 * Built around what a cashier actually does: find the student, see what is
 * owed, take an amount, hand over a receipt. The idempotency key is minted
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
}: {
  currency: string
  initialStudentId?: string
  currentUserId: string
  collectors: CollectorOption[]
  canDiscount: boolean
  canEditAmounts: boolean
}) {
  const router = useRouter()
  const toast = useToast()

  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState<StudentHit[]>([])
  const [searching, setSearching] = React.useState(false)
  const [student, setStudent] = React.useState<StudentHit | null>(null)
  const [invoices, setInvoices] = React.useState<Invoice[]>([])

  const [amount, setAmount] = React.useState('')
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
  const [billBookNo, setBillBookNo] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [pending, startTransition] = React.useTransition()
  const [receipt, setReceipt] = React.useState<{
    paymentId: string
    number: string
    advance: number
    discount: number
    billBookNo: string | null
  } | null>(null)

  // One key per attempt; regenerated only after a successful collection.
  const idempotencyKey = React.useRef(crypto.randomUUID())

  const loadStudent = React.useCallback(async (id: string) => {
    const res = await fetch(`/api/v1/finance/invoices?studentId=${id}&pageSize=50`)
    const json = await res.json()
    const rows: Invoice[] = (json.data?.invoices ?? [])
      .map((i: Invoice & { dueOn: string }) => ({
        id: i.id,
        number: i.number,
        title: i.title,
        dueOn: i.dueOn,
        totalMinor: i.totalMinor,
        paidMinor: i.paidMinor,
        balanceMinor: i.balanceMinor,
        status: i.status,
      }))
    setInvoices(rows)
    const now = new Date()
    const dueNow = rows
      .filter((invoice) => invoice.balanceMinor > 0 && new Date(invoice.dueOn) <= now)
      .reduce((sum, invoice) => sum + invoice.balanceMinor, 0)
    const due = dueNow || rows.reduce((sum, i) => sum + i.balanceMinor, 0)
    setAmount(due > 0 ? String(due / 100) : '')
  }, [])

  React.useEffect(() => {
    if (!initialStudentId) return
    void (async () => {
      const res = await fetch(`/api/v1/students/${initialStudentId}`)
      const json = await res.json()
      if (!json.data) return
      const s = json.data
      const primaryGuardian = Array.isArray(s.guardians)
        ? s.guardians.find((g: { isPrimary?: boolean }) => g.isPrimary) ?? s.guardians[0]
        : null
      const parent = primaryGuardian?.parent
      setStudent({
        id: s.id,
        admissionNo: s.admissionNo,
        firstName: s.firstName,
        lastName: s.lastName,
        className: s.enrollments?.[0]?.classLevel?.name ?? null,
        sectionName: s.enrollments?.[0]?.section?.name ?? null,
        parentName: parent ? `${parent.firstName} ${parent.lastName}`.trim() : null,
        dueMinor: 0,
      })
      await loadStudent(initialStudentId)
    })()
  }, [initialStudentId, loadStudent])

  React.useEffect(() => {
    if (query.trim().length < 2 || student) {
      setHits([])
      return
    }
    const controller = new AbortController()
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/students?q=${encodeURIComponent(query)}&pageSize=8`, {
          signal: controller.signal,
        })
        const json = await res.json()
        const rows = (json.data ?? []) as Array<StudentHit & { guardianName?: string | null }>
        setHits(
          rows.map((row) => ({
            id: row.id,
            admissionNo: row.admissionNo,
            firstName: row.firstName,
            lastName: row.lastName,
            className: row.className,
            sectionName: row.sectionName,
            parentName: row.parentName ?? row.guardianName ?? null,
            dueMinor: row.dueMinor ?? 0,
          })),
        )
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

  const totalDue = invoices.reduce((sum, i) => sum + i.balanceMinor, 0)
  const totalAnnual = invoices.reduce((sum, i) => sum + i.totalMinor, 0)
  const totalPaid = invoices.reduce((sum, i) => sum + i.paidMinor, 0)
  const now = new Date()
  const dueNow = invoices
    .filter((invoice) => invoice.balanceMinor > 0 && new Date(invoice.dueOn) <= now)
    .reduce((sum, invoice) => sum + invoice.balanceMinor, 0)
  const upcoming = invoices
    .filter((invoice) => invoice.balanceMinor > 0 && new Date(invoice.dueOn) > now)
    .reduce((sum, invoice) => sum + invoice.balanceMinor, 0)
  const overdue = invoices
    .filter((invoice) => invoice.balanceMinor > 0 && new Date(invoice.dueOn) < now)
    .reduce((sum, invoice) => sum + invoice.balanceMinor, 0)
  const amountMinor = Math.round(Number(amount || 0) * 100)
  const discountMinor = canDiscount ? Math.round(Number(discount || 0) * 100) : 0
  const payableMinor = Math.max(0, totalDue - discountMinor)
  const advance = Math.max(0, amountMinor - payableMinor)

  const submit = () => {
    if (!student) return
    startTransition(async () => {
      const result = await collectPaymentAction({
        studentId: student.id,
        collectedById,
        amount: Number(amount),
        paidOn,
        discount: discountMinor > 0 ? Number(discount) : undefined,
        discountReason: discountMinor > 0 ? discountReason.trim() : undefined,
        mode,
        reference: reference || undefined,
        billBookNo: billBookNo || undefined,
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
        billBookNo: billBookNo || null,
      })
      idempotencyKey.current = crypto.randomUUID()
      router.refresh()
    })
  }

  const reset = () => {
    setStudent(null)
    setInvoices([])
    setQuery('')
    setAmount('')
    setPaidOn(toDateInput(new Date()))
    setDiscount('')
    setDiscountReason('')
    setCollectedById(
      collectors.some((collector) => collector.id === currentUserId)
        ? currentUserId
        : (collectors[0]?.id ?? ''),
    )
    setReference('')
    setBillBookNo('')
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
            Receipt <span className="font-medium text-ink tnum">{receipt.number}</span>
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
          <div className="flex items-center justify-center gap-2 mt-5">
            <Button onClick={reset}>Collect another payment</Button>
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
                  placeholder="Name, admission number or parent"
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

              {hits.length > 0 ? (
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
              <div className="rounded-[var(--radius)] bg-surface-2 border border-line px-3.5 py-3">
                <p className="text-base font-medium text-ink">
                  {student.firstName} {student.lastName}
                </p>
                <p className="text-xs text-ink-subtle">
                  {student.admissionNo}
                  {student.parentName ? ` · Parent: ${student.parentName}` : ''}
                  {student.className ? ` · ${student.className} ${student.sectionName ?? ''}`.trimEnd() : ''}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-[var(--radius-sm)] border border-line px-3.5 py-3 sm:grid-cols-4">
                <div><p className="text-xs text-ink-muted">Annual fee</p><p className="text-sm font-medium tnum">{formatMoney(totalAnnual, currency)}</p></div>
                <div><p className="text-xs text-ink-muted">Paid</p><p className="text-sm font-medium tnum text-success">{formatMoney(totalPaid, currency)}</p></div>
                <div><p className="text-xs text-ink-muted">Due now</p><p className="text-sm font-semibold tnum">{formatMoney(dueNow, currency)}</p></div>
                <div><p className="text-xs text-ink-muted">Upcoming</p><p className="text-sm font-medium tnum">{formatMoney(upcoming, currency)}</p></div>
                {overdue > 0 ? <p className="col-span-2 text-xs text-[var(--danger)] sm:col-span-4">{formatMoney(overdue, currency)} is overdue</p> : null}
              </div>

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
                      Outstanding fees after payment:{' '}
                      <span className="font-medium text-ink tnum">
                        {formatMoney(Math.max(0, payableMinor - amountMinor), currency)}
                      </span>
                      {advance > 0
                        ? ` · ${formatMoney(advance, currency)} held as advance`
                        : ''}
                    </p>
                  ) : null}
                </Field>

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

                <Field label="Mode" htmlFor="mode" required>
                  <Select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="NET_BANKING">Net banking</option>
                  </Select>
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
                        const nextDiscountMinor = Math.round(Number(next || 0) * 100)
                        if (Number.isFinite(nextDiscountMinor) && nextDiscountMinor >= 0) {
                          const nextPayable = Math.max(0, totalDue - nextDiscountMinor)
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
                hint="Accountant name shown on the receipt"
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

              <div className="grid gap-4 sm:grid-cols-2">
                {mode !== 'CASH' ? (
                  <Field
                    label="Reference"
                    htmlFor="reference"
                    hint="Cheque number, UPI reference or UTR"
                  >
                    <Input
                      id="reference"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </Field>
                ) : null}

                {/* The serial off the paper receipt book. Left free-form and
                    unvalidated on purpose: a school running two counters from
                    two books will have numbers that repeat, and a cashier with
                    a queue must never be blocked by this field. */}
                <Field
                  label="Bill book number"
                  htmlFor="billBookNo"
                  hint="Serial on the paper receipt, if one was issued"
                >
                  <Input
                    id="billBookNo"
                    value={billBookNo}
                    onChange={(e) => setBillBookNo(e.target.value)}
                    inputMode="text"
                    autoComplete="off"
                    maxLength={40}
                  />
                </Field>
              </div>

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

              <Button
                onClick={submit}
                loading={pending}
                disabled={
                  !collectedById ||
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
          ) : invoices.length === 0 ? (
            <p className="text-sm text-success">Nothing outstanding for this student.</p>
          ) : canEditAmounts ? (
            <EditableInvoiceAmounts
              invoices={invoices}
              currency={currency}
              canEdit
              onSaved={() => {
                if (student) void loadStudent(student.id)
              }}
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {invoices.map((i) => (
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
        </CardContent>
      </Card>
    </div>
  )
}
