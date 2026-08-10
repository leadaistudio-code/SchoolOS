'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Receipt, Search } from 'lucide-react'
import { collectPaymentAction } from '../actions'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'

type StudentHit = {
  id: string
  admissionNo: string
  firstName: string
  lastName: string
  className: string | null
  sectionName: string | null
  dueMinor: number
}

type Invoice = {
  id: string
  number: string
  title: string
  dueOn: string
  balanceMinor: number
  status: string
}

/**
 * The fee counter.
 *
 * Built around what a cashier actually does: find the student, see what is
 * owed, take an amount, hand over a receipt. The idempotency key is minted
 * once per form session so a double-click or a retried submit cannot take the
 * money twice.
 */
export function CollectForm({ currency, initialStudentId }: { currency: string; initialStudentId?: string }) {
  const router = useRouter()
  const toast = useToast()

  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState<StudentHit[]>([])
  const [searching, setSearching] = React.useState(false)
  const [student, setStudent] = React.useState<StudentHit | null>(null)
  const [invoices, setInvoices] = React.useState<Invoice[]>([])

  const [amount, setAmount] = React.useState('')
  const [mode, setMode] = React.useState('CASH')
  const [reference, setReference] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [pending, startTransition] = React.useTransition()
  const [receipt, setReceipt] = React.useState<{ number: string; advance: number } | null>(null)

  // One key per attempt; regenerated only after a successful collection.
  const idempotencyKey = React.useRef(crypto.randomUUID())

  const loadStudent = React.useCallback(async (id: string) => {
    const res = await fetch(`/api/v1/finance/invoices?studentId=${id}&pageSize=50`)
    const json = await res.json()
    const rows: Invoice[] = (json.data?.invoices ?? [])
      .filter((i: { balanceMinor: number }) => i.balanceMinor > 0)
      .map((i: Invoice & { dueOn: string }) => ({
        id: i.id,
        number: i.number,
        title: i.title,
        dueOn: i.dueOn,
        balanceMinor: i.balanceMinor,
        status: i.status,
      }))
    setInvoices(rows)
    const due = rows.reduce((sum, i) => sum + i.balanceMinor, 0)
    setAmount(due > 0 ? String(due / 100) : '')
  }, [])

  React.useEffect(() => {
    if (!initialStudentId) return
    void (async () => {
      const res = await fetch(`/api/v1/students/${initialStudentId}`)
      const json = await res.json()
      if (!json.data) return
      const s = json.data
      setStudent({
        id: s.id,
        admissionNo: s.admissionNo,
        firstName: s.firstName,
        lastName: s.lastName,
        className: s.enrollments?.[0]?.classLevel?.name ?? null,
        sectionName: s.enrollments?.[0]?.section?.name ?? null,
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
        setHits(json.data ?? [])
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
  const amountMinor = Math.round(Number(amount || 0) * 100)
  const advance = Math.max(0, amountMinor - totalDue)

  const submit = () => {
    if (!student) return
    startTransition(async () => {
      const result = await collectPaymentAction({
        studentId: student.id,
        amount: Number(amount),
        mode,
        reference: reference || undefined,
        notes: notes || undefined,
        idempotencyKey: idempotencyKey.current,
      })

      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Payment not recorded', description: result.message })
        return
      }

      toast.push({ tone: 'success', title: 'Payment recorded', description: result.message })
      setReceipt({
        number: result.data?.receiptNumber ?? '',
        advance: result.data?.unallocatedMinor ?? 0,
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
            Receipt <span className="font-medium text-ink tnum">{receipt.number}</span>
            {receipt.advance > 0
              ? ` · ${formatMoney(receipt.advance, currency)} held as advance`
              : ''}
          </p>
          <div className="flex items-center justify-center gap-2 mt-5">
            <Button onClick={reset}>Collect another payment</Button>
            <Link href="/finance/payments" className={buttonVariants({ variant: 'secondary' })}>
              <Receipt className="size-4" aria-hidden />
              View payments
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
                  placeholder="Name or admission number"
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
                          <span className="block text-xs text-ink-subtle">
                            {h.admissionNo}
                            {h.className ? ` · ${h.className} ${h.sectionName ?? ''}` : ''}
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
                  {student.className ? ` · ${student.className} ${student.sectionName ?? ''}` : ''}
                </p>
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
                disabled={!amount || Number(amount) <= 0}
                size="lg"
              >
                Record payment and issue receipt
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
              {student ? formatMoney(totalDue, currency) : 'Select a student'}
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
