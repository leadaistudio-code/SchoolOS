'use client'

import * as React from 'react'
import { MinusCircle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  createAppraisalAction,
  deletePayslipAction,
  generatePayslipAction,
  setPayslipStatusAction,
  setSalaryAction,
  updatePayslipDeductionAction,
} from '../actions'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Recording a salary revision.
 *
 * Components rather than one number, because a payslip has to be able to say
 * what it is made of, and because a school that raises only the allowance
 * should not have to restate the basic. The net is shown live as it is typed
 * — an arithmetic error caught before saving is worth more than a validation
 * message after.
 */
export function SetSalaryButton({
  staffId,
  current,
  label = 'Revise salary',
}: {
  staffId: string
  current?: {
    basicMinor: number
    hraMinor: number
    allowancesMinor: number
    deductionsMinor: number
  } | null
  label?: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [effectiveFrom, setEffectiveFrom] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const rupees = (minor?: number) => (minor ? String(minor / 100) : '')
  const [basic, setBasic] = React.useState(rupees(current?.basicMinor))
  const [hra, setHra] = React.useState(rupees(current?.hraMinor))
  const [allowances, setAllowances] = React.useState(rupees(current?.allowancesMinor))
  const [deductions, setDeductions] = React.useState(rupees(current?.deductionsMinor))
  const [notes, setNotes] = React.useState('')

  const n = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  const gross = n(basic) + n(hra) + n(allowances)
  const net = gross - n(deductions)

  const submit = () =>
    startTransition(async () => {
      const result = await setSalaryAction({
        staffId,
        effectiveFrom,
        basic: n(basic),
        hra: n(hra),
        allowances: n(allowances),
        deductions: n(deductions),
        notes: notes.trim() || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not save salary', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Salary saved', description: result.message })
      setOpen(false)
      setNotes('')
    })

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Salary revision"
        description="Revisions are added, not edited — an old payslip stays explainable by the structure that produced it."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!effectiveFrom || gross <= 0}>
              Save revision
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Effective from"
            htmlFor="sal-from"
            required
            className="sm:col-span-2"
            hint="Payslips for months from this date use these figures"
          >
            <Input
              id="sal-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </Field>

          <Field label="Basic" htmlFor="sal-basic" required>
            <Input
              id="sal-basic"
              type="number"
              min="0"
              value={basic}
              onChange={(e) => setBasic(e.target.value)}
            />
          </Field>
          <Field label="House rent allowance" htmlFor="sal-hra">
            <Input
              id="sal-hra"
              type="number"
              min="0"
              value={hra}
              onChange={(e) => setHra(e.target.value)}
            />
          </Field>
          <Field label="Other allowances" htmlFor="sal-allow">
            <Input
              id="sal-allow"
              type="number"
              min="0"
              value={allowances}
              onChange={(e) => setAllowances(e.target.value)}
            />
          </Field>
          <Field
            label="Deductions"
            htmlFor="sal-ded"
            hint="Provident fund, professional tax, insurance"
          >
            <Input
              id="sal-ded"
              type="number"
              min="0"
              value={deductions}
              onChange={(e) => setDeductions(e.target.value)}
            />
          </Field>

          <Field label="Note" htmlFor="sal-note" className="sm:col-span-2" hint="Optional">
            <Textarea
              id="sal-note"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Annual increment, promotion to senior teacher"
            />
          </Field>

          <div className="sm:col-span-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2">
            <span className="text-xs text-ink-subtle">
              Gross <span className="ml-1 text-sm font-medium tnum text-ink">{gross || 0}</span>
            </span>
            <span className="text-xs text-ink-subtle">
              Deductions{' '}
              <span className="ml-1 text-sm font-medium tnum text-ink">{n(deductions)}</span>
            </span>
            <span className="text-xs text-ink-subtle">
              Take home <span className="ml-1 text-sm font-semibold tnum text-ink">{net}</span>
            </span>
          </div>
        </div>
      </Dialog>
    </>
  )
}

/** Raises one month's payslip for one person. */
export function GeneratePayslipButton({
  staffId,
  disabled,
  label = 'Generate payslip',
}: {
  staffId: string
  disabled?: boolean
  label?: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const now = new Date()
  const [periodMonth, setPeriodMonth] = React.useState(String(now.getMonth() + 1))
  const [periodYear, setPeriodYear] = React.useState(String(now.getFullYear()))
  const [bonus, setBonus] = React.useState('')
  const [manualDeduction, setManualDeduction] = React.useState('')
  const [manualDeductionReason, setManualDeductionReason] = React.useState('')
  const [notes, setNotes] = React.useState('')

  const submit = () =>
    startTransition(async () => {
      const result = await generatePayslipAction({
        staffId,
        periodYear,
        periodMonth,
        bonus: bonus ? Number(bonus) : 0,
        manualDeduction: manualDeduction ? Number(manualDeduction) : 0,
        manualDeductionReason: manualDeductionReason.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not generate', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Payslip generated', description: result.message })
      setOpen(false)
      setBonus('')
      setManualDeduction('')
      setManualDeductionReason('')
      setNotes('')
    })

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled}
        title={disabled ? 'Set a salary before generating a payslip' : undefined}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Generate a payslip"
        description="Attendance is calculated automatically: absence costs one day, half-day costs half, and every 3 late arrivals cost one day. Approved leave stays paid."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={Number(manualDeduction) > 0 && manualDeductionReason.trim().length < 3}
            >
              Generate draft
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Month" htmlFor="ps-month" required>
            <Select
              id="ps-month"
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Year" htmlFor="ps-year" required>
            <Input
              id="ps-year"
              type="number"
              min="2000"
              max="2100"
              value={periodYear}
              onChange={(e) => setPeriodYear(e.target.value)}
            />
          </Field>
          <Field label="Bonus" htmlFor="ps-bonus" hint="One-off, on top of the salary">
            <Input
              id="ps-bonus"
              type="number"
              min="0"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
            />
          </Field>
          <Field
            label="Manual deduction"
            htmlFor="ps-manual-deduction"
            hint="Optional one-off deduction for this month"
          >
            <Input
              id="ps-manual-deduction"
              type="number"
              min="0"
              value={manualDeduction}
              onChange={(e) => setManualDeduction(e.target.value)}
            />
          </Field>
          <Field
            label="Deduction reason"
            htmlFor="ps-deduction-reason"
            required={Number(manualDeduction) > 0}
            hint={Number(manualDeduction) > 0 ? 'Required for the audit record' : 'Required when deducting'}
            className="sm:col-span-2"
          >
            <Input
              id="ps-deduction-reason"
              value={manualDeductionReason}
              onChange={(e) => setManualDeductionReason(e.target.value)}
              placeholder="Loan recovery, salary advance, damage recovery"
            />
          </Field>
          <Field label="Note" htmlFor="ps-note" hint="Optional, appears on the payslip" className="sm:col-span-2">
            <Input id="ps-note" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </>
  )
}

/** Adds or revises a reasoned one-off deduction while the payslip is a draft. */
export function PayslipDeductionButton({
  id,
  amountMinor,
  reason,
}: {
  id: string
  amountMinor: number
  reason?: string | null
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [amount, setAmount] = React.useState(amountMinor ? String(amountMinor / 100) : '')
  const [deductionReason, setDeductionReason] = React.useState(reason ?? '')

  const submit = () =>
    startTransition(async () => {
      const result = await updatePayslipDeductionAction({
        id,
        manualDeduction: amount ? Number(amount) : 0,
        manualDeductionReason: deductionReason.trim() || undefined,
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Deduction updated' : 'Could not update deduction',
        description: result.message,
      })
      if (result.ok) setOpen(false)
    })

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <MinusCircle aria-hidden />
        Deduction
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Manual salary deduction"
        description="This changes only this draft payslip. The reason is stored in the audit log."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={Number(amount) > 0 && deductionReason.trim().length < 3}
            >
              Save deduction
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Deduction amount" htmlFor={`manual-deduction-${id}`} required>
            <Input
              id={`manual-deduction-${id}`}
              type="number"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field
            label="Reason"
            htmlFor={`manual-deduction-reason-${id}`}
            required={Number(amount) > 0}
            hint="Set the amount to zero to remove this manual deduction"
          >
            <Textarea
              id={`manual-deduction-reason-${id}`}
              value={deductionReason}
              onChange={(event) => setDeductionReason(event.target.value)}
              placeholder="Explain why this deduction is being applied"
            />
          </Field>
        </div>
      </Dialog>
    </>
  )
}

/** Draft → published → paid. Published (unpaid) can roll back to draft. */
export function PayslipStatusControl({ id, status }: { id: string; status: string }) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  const move = (next: string) =>
    startTransition(async () => {
      const result = await setPayslipStatusAction({ id, status: next })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Payslip updated' : 'Could not update',
        description: result.message,
      })
    })

  const remove = () => {
    if (
      !window.confirm(
        'Delete this draft payslip? You can generate it again for the same month afterwards.',
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await deletePayslipAction(id)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Payslip deleted' : 'Could not delete',
        description: result.message,
      })
    })
  }

  if (status === 'PAID') {
    return null
  }

  if (status === 'DRAFT') {
    return (
      <>
        <Button size="sm" variant="ghost" loading={pending} onClick={remove}>
          Delete
        </Button>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => move('PUBLISHED')}>
          Publish
        </Button>
      </>
    )
  }

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() => {
          if (
            !window.confirm(
              'Unpublish this payslip and return it to draft? You can then edit deductions, delete it, or publish again.',
            )
          ) {
            return
          }
          move('DRAFT')
        }}
      >
        Unpublish
      </Button>
      <Button size="sm" loading={pending} onClick={() => move('PAID')}>
        Mark paid
      </Button>
    </>
  )
}

/** Opens an appraisal cycle for one person. */
export function OpenAppraisalButton({
  staffId,
  reviewers,
  label = 'Open an appraisal',
}: {
  staffId: string
  reviewers: { id: string; label: string }[]
  label?: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const year = new Date().getFullYear()
  const [cycleName, setCycleName] = React.useState(`${year}-${String(year + 1).slice(2)} Annual`)
  const [periodFrom, setPeriodFrom] = React.useState(`${year}-04-01`)
  const [periodTo, setPeriodTo] = React.useState(`${year + 1}-03-31`)
  const [reviewerStaffId, setReviewerStaffId] = React.useState('')

  const submit = () =>
    startTransition(async () => {
      const result = await createAppraisalAction({
        staffId,
        cycleName: cycleName.trim(),
        periodFrom,
        periodTo,
        reviewerStaffId: reviewerStaffId || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not open', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Appraisal opened', description: result.message })
      setOpen(false)
    })

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Open an appraisal"
        description="A review period, a reviewer, and seven competencies scored out of five."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!cycleName.trim() || periodTo <= periodFrom}
            >
              Open appraisal
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cycle" htmlFor="ap-cycle" required className="sm:col-span-2">
            <Input
              id="ap-cycle"
              value={cycleName}
              onChange={(e) => setCycleName(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Period from" htmlFor="ap-from" required>
            <Input
              id="ap-from"
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
          </Field>
          <Field
            label="Period to"
            htmlFor="ap-to"
            required
            error={periodTo <= periodFrom ? 'Must be after the start' : undefined}
          >
            <Input
              id="ap-to"
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
            />
          </Field>
          <Field
            label="Reviewer"
            htmlFor="ap-reviewer"
            className="sm:col-span-2"
            hint="Who will write the assessment. Can be set later."
          >
            <Select
              id="ap-reviewer"
              value={reviewerStaffId}
              onChange={(e) => setReviewerStaffId(e.target.value)}
            >
              <option value="">Not assigned</option>
              {reviewers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Dialog>
    </>
  )
}
