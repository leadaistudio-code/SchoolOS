'use client'

import * as React from 'react'
import { Banknote, FilePlus2, IndianRupee } from 'lucide-react'
import { generateMonthPayslipsAction, payPayslipsAction, setQuickSalariesAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'

const SALARY_MODES: [string, string][] = [
  ['BANK_TRANSFER', 'Bank transfer'],
  ['CASH', 'Cash'],
  ['CHEQUE', 'Cheque'],
  ['UPI', 'UPI'],
]

function todayInIndia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

/** One click: a draft payslip for everyone with a salary and no slip this month. */
export function GenerateMonthButton({
  year,
  month,
  monthLabel,
  readyCount,
  readyNetMinor,
  missingCount,
  currency,
}: {
  year: number
  month: number
  monthLabel: string
  readyCount: number
  readyNetMinor: number
  missingCount: number
  currency: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const run = () =>
    startTransition(async () => {
      const result = await generateMonthPayslipsAction({ periodYear: year, periodMonth: month })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Payslips created' : 'Some payslips were not created',
        description: result.message,
      })
      setOpen(false)
    })

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={readyCount === 0}>
        <FilePlus2 aria-hidden />
        {readyCount > 0 ? `Create ${readyCount} payslip${readyCount === 1 ? '' : 's'}` : 'All payslips created'}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Create payslips for ${monthLabel} ${year}`}
        description="Every staff member with a salary gets a draft payslip. Attendance deductions are worked out from the staff register, the same as a single payslip."
        footer={
          <>
            <Button onClick={run} loading={pending}>
              Create {readyCount} payslip{readyCount === 1 ? '' : 's'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <ul className="space-y-1.5 text-sm">
          <li>
            <span className="font-medium text-ink">{readyCount}</span> staff · salary before attendance deductions about{' '}
            <span className="font-medium text-ink">{formatMoney(readyNetMinor, currency)}</span>
          </li>
          {missingCount > 0 ? (
            <li className="text-warning">
              {missingCount} staff have no salary and will be skipped. Use &ldquo;Set missing salaries&rdquo; first to include them.
            </li>
          ) : null}
          <li className="text-ink-muted">You can check each draft, add a bonus or deduction, then pay them all together.</li>
        </ul>
      </Dialog>
    </>
  )
}

/** Monthly salary for everyone who has none, in one list. */
export function QuickSalaryButton({
  missing,
  effectiveFrom,
  monthLabel,
}: {
  missing: { staffId: string; name: string; employeeCode: string; designation: string | null; profileSalaryMinor: number | null }[]
  effectiveFrom: string
  monthLabel: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const initial = React.useCallback(
    () =>
      Object.fromEntries(
        missing.map((m) => [m.staffId, m.profileSalaryMinor ? String(m.profileSalaryMinor / 100) : '']),
      ) as Record<string, string>,
    [missing],
  )
  const [amounts, setAmounts] = React.useState<Record<string, string>>(initial)
  const filled = missing.filter((m) => Number(amounts[m.staffId]) > 0)

  const save = () =>
    startTransition(async () => {
      const result = await setQuickSalariesAction({
        effectiveFrom,
        entries: filled.map((m) => ({ staffId: m.staffId, monthly: Number(amounts[m.staffId]) })),
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Salaries saved' : 'Some salaries were not saved',
        description: result.message,
      })
      if (result.ok) setOpen(false)
    })

  if (missing.length === 0) return null
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          setAmounts(initial())
          setOpen(true)
        }}
      >
        <IndianRupee aria-hidden />
        Set missing salaries ({missing.length})
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Set monthly salaries"
        description={`Enter each person's monthly salary. It applies from ${monthLabel} onwards. For HRA, allowances or fixed deductions, use the Salary tab on their profile instead.`}
        footer={
          <>
            <Button onClick={save} loading={pending} disabled={filled.length === 0}>
              Save {filled.length} salar{filled.length === 1 ? 'y' : 'ies'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {missing.map((m) => (
            <div key={m.staffId} className="flex items-center gap-3">
              <label htmlFor={`qs-${m.staffId}`} className="min-w-0 flex-1 text-sm">
                <span className="block truncate font-medium text-ink">{m.name}</span>
                <span className="block truncate text-xs text-ink-subtle">
                  {[m.employeeCode, m.designation].filter(Boolean).join(' · ')}
                </span>
              </label>
              <Input
                id={`qs-${m.staffId}`}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                className="w-36"
                placeholder="₹ per month"
                value={amounts[m.staffId] ?? ''}
                onChange={(e) => setAmounts((a) => ({ ...a, [m.staffId]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </Dialog>
    </>
  )
}

/** Pays the chosen payslips together; drafts are published on the way. */
export function PayPayslipsDialog({
  open,
  onClose,
  ids,
  totalMinor,
  currency,
  onDone,
}: {
  open: boolean
  onClose: () => void
  ids: string[]
  totalMinor: number
  currency: string
  onDone: () => void
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [paymentMode, setPaymentMode] = React.useState('BANK_TRANSFER')
  const [paidOn, setPaidOn] = React.useState(() => todayInIndia())

  const pay = () =>
    startTransition(async () => {
      const result = await payPayslipsAction({ ids, paymentMode, paidOn })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Salaries paid' : 'Some salaries were not paid',
        description: result.message,
      })
      onDone()
      onClose()
    })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Pay ${ids.length} salar${ids.length === 1 ? 'y' : 'ies'}`}
      description="Each payslip is published and marked paid, and recorded in Accounts as Salaries & Wages. A paid payslip cannot be reopened."
      footer={
        <>
          <Button onClick={pay} loading={pending} disabled={!paidOn || ids.length === 0}>
            <Banknote aria-hidden />
            Pay {formatMoney(totalMinor, currency)}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Paid by" htmlFor="bulk-pay-mode" required hint="Cash is paid from Cash in Hand; the others from the bank account">
          <Select id="bulk-pay-mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
            {SALARY_MODES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid on" htmlFor="bulk-pay-date" required>
          <Input id="bulk-pay-date" type="date" max={todayInIndia()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}
