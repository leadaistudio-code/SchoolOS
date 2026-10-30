'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  setInvoiceChargeAmountAction,
  setFutureFeeAmountAction,
  grantConcessionAction,
} from '../../../actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'
import { InvoiceDatesButton } from '../../../invoices/invoice-dates-button'
import { cn } from '@/lib/utils'

export type EditFeeHeadRow = {
  key: string
  feeHeadId: string | null
  name: string
  classLinked: boolean
  annualMinor: number
  waiverMinor: number
  installments: {
    invoiceId: string | null
    /** Plan line this month comes from; set for months not invoiced yet. */
    installmentLineId?: string
    planAmountMinor?: number
    overridden?: boolean
    invoiceNumber?: string
    issuedOn?: string
    invoiceDueOn?: string
    dueOn: string
    label: string
    amountMinor: number
    paidMinor: number
  }[]
}

type Tab = 'class' | 'non-class' | 'waiver'

function FutureAmountRow({
  row,
  currency,
  draft,
  reason,
  pending,
  onDraft,
  onReason,
  onSave,
}: {
  row: EditFeeHeadRow['installments'][number]
  currency: string
  draft: string
  reason: string
  pending: boolean
  onDraft: (value: string) => void
  onReason: (value: string) => void
  onSave: () => void
}) {
  const unchanged = Math.round(Number(draft || 0) * 100) === row.amountMinor
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-subtle">₹</span>
      <Input
        className="w-28 tnum"
        inputMode="decimal"
        aria-label={`Amount for ${row.label}`}
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
      />
      <Input
        className="min-w-[12rem] flex-1"
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => onReason(e.target.value)}
      />
      <Button size="sm" variant="secondary" loading={pending} onClick={onSave} disabled={unchanged}>
        Save
      </Button>
      <span className="text-xs text-ink-subtle">
        not invoiced yet
        {row.overridden && row.planAmountMinor !== undefined
          ? ` · will bill this amount (plan ${formatMoney(row.planAmountMinor, currency)})`
          : ' · will bill this amount when generated'}
      </span>
      {row.overridden && row.planAmountMinor !== undefined ? (
        <button
          type="button"
          className="text-xs text-[var(--brand-600)] hover:underline"
          onClick={() => onDraft(String(row.planAmountMinor! / 100))}
        >
          Use plan amount
        </button>
      ) : null}
    </div>
  )
}

export function EditStudentFeesForm({
  studentId,
  currency,
  heads,
  concessionStudents,
  feeHeads,
}: {
  studentId: string
  currency: string
  heads: EditFeeHeadRow[]
  concessionStudents: { id: string; label: string }[]
  feeHeads: { id: string; name: string }[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [tab, setTab] = React.useState<Tab>('class')
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      heads.flatMap((head) =>
        head.installments
          .filter((row) => row.invoiceId)
          .map((row) => [row.invoiceId!, String(row.amountMinor / 100)]),
      ),
    ),
  )
  const [reasons, setReasons] = React.useState<Record<string, string>>({})
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [waiverName, setWaiverName] = React.useState('Concession')
  const [waiverKind, setWaiverKind] = React.useState<'PERCENT' | 'FLAT'>('FLAT')
  const [waiverValue, setWaiverValue] = React.useState('')
  const [waiverFeeHeadId, setWaiverFeeHeadId] = React.useState('')
  const [waiverReason, setWaiverReason] = React.useState('')
  const [waiverPending, startWaiver] = React.useTransition()

  const classHeads = heads.filter((head) => head.classLinked)
  const nonClassHeads = heads.filter((head) => !head.classLinked)
  const visible = tab === 'class' ? classHeads : tab === 'non-class' ? nonClassHeads : []

  const saveInvoice = (invoiceId: string) => {
    const amount = Number(drafts[invoiceId])
    const reason = (reasons[invoiceId] ?? '').trim() || 'Ledger fee edit'
    if (!Number.isFinite(amount) || amount < 0) {
      toast.push({ tone: 'error', title: 'Enter a valid amount' })
      return
    }
    setPendingId(invoiceId)
    void (async () => {
      const result = await setInvoiceChargeAmountAction({
        invoiceId,
        amount,
        reason,
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Amount updated' : 'Could not update',
        description: result.message,
      })
      setPendingId(null)
      if (result.ok) router.refresh()
    })()
  }

  const saveFuture = (lineId: string) => {
    const key = `line:${lineId}`
    const amount = Number(drafts[key])
    if (!Number.isFinite(amount) || amount < 0) {
      toast.push({ tone: 'error', title: 'Enter a valid amount' })
      return
    }
    setPendingId(key)
    void (async () => {
      const result = await setFutureFeeAmountAction({
        studentId,
        installmentLineId: lineId,
        amount,
        reason: (reasons[key] ?? '').trim() || undefined,
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Future amount saved' : 'Could not save',
        description: result.message,
      })
      setPendingId(null)
      if (result.ok) router.refresh()
    })()
  }

  const saveWaiver = () => startWaiver(async () => {
    const value = Number(waiverValue)
    if (!Number.isFinite(value) || value < 0) {
      toast.push({ tone: 'error', title: 'Enter a valid waiver amount' })
      return
    }
    const result = await grantConcessionAction({
      studentId,
      name: waiverName.trim() || 'Concession',
      kind: waiverKind,
      value,
      feeHeadId: waiverFeeHeadId || undefined,
      reason: waiverReason.trim() || undefined,
    })
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? 'Waiver saved' : 'Could not save waiver',
      description: result.message,
    })
    if (result.ok) {
      setWaiverValue('')
      setWaiverReason('')
      router.refresh()
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-line">
        {(
          [
            ['class', 'Class Linked Fee'],
            ['non-class', 'Non Class Linked Fee'],
            ['waiver', 'Waiver Fields'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === id
                ? 'border-[var(--brand-600)] text-[var(--brand-600)]'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'waiver' ? (
        <Card>
          <CardContent className="pt-4 space-y-4 max-w-xl">
            <p className="text-sm text-ink-muted">
              Grant a lasting concession for this student. It updates open invoices where it applies.
            </p>
            <Field label="Name" htmlFor="waiver-name" required>
              <Input id="waiver-name" value={waiverName} onChange={(e) => setWaiverName(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" htmlFor="waiver-kind" required>
                <Select
                  id="waiver-kind"
                  value={waiverKind}
                  onChange={(e) => setWaiverKind(e.target.value as 'PERCENT' | 'FLAT')}
                >
                  <option value="FLAT">Flat amount (₹)</option>
                  <option value="PERCENT">Percent (%)</option>
                </Select>
              </Field>
              <Field label="Value" htmlFor="waiver-value" required>
                <Input
                  id="waiver-value"
                  inputMode="decimal"
                  value={waiverValue}
                  onChange={(e) => setWaiverValue(e.target.value)}
                  placeholder={waiverKind === 'PERCENT' ? '10' : '500'}
                />
              </Field>
            </div>
            <Field label="Applies to" htmlFor="waiver-head">
              <Select
                id="waiver-head"
                value={waiverFeeHeadId}
                onChange={(e) => setWaiverFeeHeadId(e.target.value)}
              >
                <option value="">All fee heads</option>
                {feeHeads.map((head) => (
                  <option key={head.id} value={head.id}>
                    {head.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason" htmlFor="waiver-reason">
              <Textarea
                id="waiver-reason"
                rows={2}
                value={waiverReason}
                onChange={(e) => setWaiverReason(e.target.value)}
              />
            </Field>
            <Button onClick={saveWaiver} loading={waiverPending} disabled={!concessionStudents.length}>
              Save waiver
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {visible.length === 0 ? (
              <p className="px-4 py-10 text-sm text-ink-muted text-center">
                {tab === 'class'
                  ? 'No class-linked fees assigned to this student.'
                  : 'No non class linked fees on this account.'}{' '}
                <Link href="/finance/structures" className="text-[var(--brand-600)] hover:underline">
                  Open fee setup
                </Link>
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-info-bg/50 text-left text-xs font-medium text-ink-muted">
                    <tr>
                      <th className="px-3.5 py-2.5 w-14">S. No</th>
                      <th className="px-3.5 py-2.5">Head</th>
                      <th className="px-3.5 py-2.5">Annual Amount</th>
                      <th className="px-3.5 py-2.5">Waiver (if any)</th>
                      <th className="px-3.5 py-2.5">No of Installments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {visible.map((head, index) => {
                      const open = expanded[head.key]
                      return (
                        <React.Fragment key={head.key}>
                          <tr>
                            <td className="px-3.5 py-3 tnum">{index + 1}</td>
                            <td className="px-3.5 py-3 font-medium text-ink">{head.name}</td>
                            <td className="px-3.5 py-3 tnum">{formatMoney(head.annualMinor, currency)}</td>
                            <td className="px-3.5 py-3 tnum">{formatMoney(head.waiverMinor, currency)}</td>
                            <td className="px-3.5 py-3">
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 text-[var(--brand-600)] hover:underline"
                                onClick={() =>
                                  setExpanded((current) => ({
                                    ...current,
                                    [head.key]: !current[head.key],
                                  }))
                                }
                              >
                                {head.installments.length} Installment
                                {head.installments.length === 1 ? '' : 's'}
                                <span className="grid size-5 place-items-center rounded-full border border-[var(--brand-200)] text-xs">
                                  {open ? '−' : '+'}
                                </span>
                              </button>
                            </td>
                          </tr>
                          {open
                            ? head.installments.map((row) => (
                                <tr key={`${head.key}-${row.dueOn}-${row.invoiceId ?? row.label}`} className="bg-surface-2/60">
                                  <td className="px-3.5 py-2" />
                                  <td className="px-3.5 py-2 text-ink-muted" colSpan={1}>
                                    {row.label}
                                  </td>
                                  <td className="px-3.5 py-2" colSpan={3}>
                                    {row.invoiceId ? (
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs text-ink-subtle">₹</span>
                                        <Input
                                          className="w-28 tnum"
                                          inputMode="decimal"
                                          value={drafts[row.invoiceId] ?? String(row.amountMinor / 100)}
                                          onChange={(e) =>
                                            setDrafts((prev) => ({
                                              ...prev,
                                              [row.invoiceId!]: e.target.value,
                                            }))
                                          }
                                        />
                                        <Input
                                          className="min-w-[12rem] flex-1"
                                          placeholder="Reason for change"
                                          value={reasons[row.invoiceId] ?? ''}
                                          onChange={(e) =>
                                            setReasons((prev) => ({
                                              ...prev,
                                              [row.invoiceId!]: e.target.value,
                                            }))
                                          }
                                        />
                                        <Button
                                          size="sm"
                                          loading={pendingId === row.invoiceId}
                                          onClick={() => saveInvoice(row.invoiceId!)}
                                          disabled={
                                            Math.round(
                                              Number(drafts[row.invoiceId] ?? 0) * 100,
                                            ) === row.amountMinor
                                          }
                                        >
                                          Save
                                        </Button>
                                        {row.invoiceNumber && row.issuedOn && row.invoiceDueOn ? (
                                          <InvoiceDatesButton
                                            label="Dates"
                                            invoice={{
                                              id: row.invoiceId,
                                              number: row.invoiceNumber,
                                              issuedOn: row.issuedOn,
                                              dueOn: row.invoiceDueOn,
                                            }}
                                          />
                                        ) : null}
                                        {row.paidMinor > 0 ? (
                                          <span className="text-xs text-ink-subtle">
                                            paid {formatMoney(row.paidMinor, currency)}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : row.installmentLineId ? (
                                      <FutureAmountRow
                                        row={row}
                                        currency={currency}
                                        draft={drafts[`line:${row.installmentLineId}`] ?? String(row.amountMinor / 100)}
                                        reason={reasons[`line:${row.installmentLineId}`] ?? ''}
                                        pending={pendingId === `line:${row.installmentLineId}`}
                                        onDraft={(value) =>
                                          setDrafts((prev) => ({ ...prev, [`line:${row.installmentLineId}`]: value }))
                                        }
                                        onReason={(value) =>
                                          setReasons((prev) => ({ ...prev, [`line:${row.installmentLineId}`]: value }))
                                        }
                                        onSave={() => saveFuture(row.installmentLineId!)}
                                      />
                                    ) : (
                                      <span className="text-ink-muted tnum">
                                        {formatMoney(row.amountMinor, currency)} · not invoiced yet
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            : null}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
