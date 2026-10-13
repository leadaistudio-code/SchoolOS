'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { updateInstallmentDatesAction, updateInvoiceGroupDatesAction } from '../../../actions'
import type { FeeStructureSchedule } from '@/server/modules/finance/simplicity'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'

type Row = { issueOn: string; dueOn: string }

function iso(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)
}

/** Same month as the current due date; a generation day after the due day falls in the month before. */
function datesForDays(currentDueOn: string, generateDay: number, dueDay: number): Row {
  const [year, month] = currentDueOn.split('-').map(Number) as [number, number]
  return {
    dueOn: iso(year, month - 1, dueDay),
    issueOn: iso(year, month - 1 - (generateDay > dueDay ? 1 : 0), generateDay),
  }
}

const show = (value: string) => formatDay(new Date(`${value}T00:00:00.000Z`), 'd MMM yyyy')

export function BillingDatesForm({
  schedule,
  currency,
}: {
  schedule: FeeStructureSchedule
  currency: string
}) {
  const router = useRouter()
  const toast = useToast()
  const initial = React.useMemo(
    () => Object.fromEntries(schedule.installments.map((row) => [row.id, { issueOn: row.issueOn, dueOn: row.dueOn }])),
    [schedule],
  )
  const [rows, setRows] = React.useState<Record<string, Row>>(initial)
  const [generateDay, setGenerateDay] = React.useState('1')
  const [dueDay, setDueDay] = React.useState('10')
  const [applyToInvoices, setApplyToInvoices] = React.useState(true)
  const [confirming, setConfirming] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => setRows(initial), [initial])

  const changed = schedule.installments.filter((row) =>
    rows[row.id]!.issueOn !== row.issueOn || rows[row.id]!.dueOn !== row.dueOn)
  const invalid = schedule.installments.filter((row) => {
    const value = rows[row.id]!
    return !value.issueOn || !value.dueOn || value.issueOn > value.dueOn
  })
  // Existing invoices can also be realigned without changing the schedule itself.
  const stale = schedule.installments.filter((row) => row.differentDates > 0)
  const targets = applyToInvoices
    ? schedule.installments.filter((row) => changed.includes(row) || stale.includes(row))
    : changed
  const invoicesAffected = applyToInvoices
    ? targets.reduce((sum, row) => sum + (changed.includes(row) ? row.invoiceCount : row.differentDates), 0)
    : 0

  const applyDays = () => {
    const generate = Number(generateDay)
    const due = Number(dueDay)
    if (![generate, due].every((day) => Number.isInteger(day) && day >= 1 && day <= 28)) {
      toast.push({ tone: 'error', title: 'Choose days from 1 to 28' })
      return
    }
    setRows(Object.fromEntries(schedule.installments.map((row) => [
      row.id,
      datesForDays(rows[row.id]!.dueOn, generate, due),
    ])))
  }

  const save = () => startTransition(async () => {
    const result = await updateInstallmentDatesAction({
      structureId: schedule.id,
      rows: targets.map((row) => ({ installmentId: row.id, ...rows[row.id]! })),
      applyToInvoices,
    })
    setConfirming(false)
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? 'Billing dates saved' : 'Billing dates not saved',
      description: result.message,
    })
    if (result.ok) router.refresh()
  })

  if (schedule.installments.length === 0) {
    return schedule.invoiceGroups.length > 0 ? (
      <InvoiceGroupDates schedule={schedule} />
    ) : (
      <Card>
        <CardContent className="py-10 text-center text-sm text-ink-muted">
          This structure has no installment schedule or invoices yet. The schedule is created when
          the structure is saved in the fee plan wizard or published.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Set the same days for every installment</CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">
              A generation day later than the due day generates in the month before (for example,
              generate on the 25th for fees due on the 10th).
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Invoice generation day" htmlFor="generate-day" className="w-44">
              <Input id="generate-day" type="number" min={1} max={28} value={generateDay} onChange={(e) => setGenerateDay(e.target.value)} />
            </Field>
            <Field label="Due day" htmlFor="due-day" className="w-44">
              <Input id="due-day" type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
            </Field>
            <Button variant="secondary" onClick={applyDays}>Apply to all installments</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-surface-2 text-left text-xs font-medium text-ink-muted">
                <tr>
                  <th className="px-3.5 py-2.5">Installment</th>
                  <th className="px-3.5 py-2.5 text-right">Amount</th>
                  <th className="px-3.5 py-2.5">Invoice generation date</th>
                  <th className="px-3.5 py-2.5">Due date</th>
                  <th className="px-3.5 py-2.5">Invoices generated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {schedule.installments.map((row) => {
                  const value = rows[row.id]!
                  const bad = value.issueOn > value.dueOn
                  const dirty = changed.includes(row)
                  return (
                    <tr key={row.id} className={dirty ? 'bg-surface-2/60' : undefined}>
                      <td className="px-3.5 py-2.5 align-top">
                        <p className="font-medium text-ink">{row.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-subtle">
                          {row.lines.map((line, index) => (
                            <span key={`${line.label}-${index}`} className="inline-flex items-center gap-1">
                              {line.label}
                              {line.isOptional ? <Badge tone="brand">optional</Badge> : null}
                              {index < row.lines.length - 1 ? ',' : ''}
                            </span>
                          ))}
                        </p>
                      </td>
                      <td className="px-3.5 py-2.5 text-right align-top tnum">{formatMoney(row.amountMinor, currency)}</td>
                      <td className="px-3.5 py-2.5 align-top">
                        <Input
                          type="date"
                          className="w-40"
                          value={value.issueOn}
                          aria-label={`Invoice generation date for ${row.name}`}
                          onChange={(e) => setRows((current) => ({ ...current, [row.id]: { ...value, issueOn: e.target.value } }))}
                        />
                        {row.issueOnIsDefault && !dirty ? (
                          <p className="mt-1 text-xs text-ink-subtle">Default: 1st of the due month</p>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-2.5 align-top">
                        <Input
                          type="date"
                          className="w-40"
                          value={value.dueOn}
                          aria-label={`Due date for ${row.name}`}
                          onChange={(e) => setRows((current) => ({ ...current, [row.id]: { ...value, dueOn: e.target.value } }))}
                        />
                        {bad ? (
                          <p className="mt-1 text-xs text-[var(--danger)]">Due date is before the generation date</p>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-2.5 align-top text-ink-muted">
                        {row.invoiceCount > 0 ? (
                          <>
                            <span className="tnum">{row.invoiceCount}</span>
                            {row.differentDates > 0 ? (
                              <p className="text-xs text-warning">{row.differentDates} with other dates</p>
                            ) : null}
                          </>
                        ) : 'None yet'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <label className="flex items-start gap-2 text-sm text-ink">
            <Checkbox
              className="mt-0.5"
              checked={applyToInvoices}
              onChange={(e) => setApplyToInvoices(e.target.checked)}
            />
            <span>
              Also update invoices already generated
              <span className="block text-xs text-ink-muted">
                Moves their invoice date and due date to match. Amounts, payments and receipts do not change. Cancelled invoices are left alone.
              </span>
            </span>
          </label>
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={changed.length === 0 || pending} onClick={() => setRows(initial)}>
              Reset
            </Button>
            <Button
              disabled={targets.length === 0 || invalid.length > 0}
              loading={pending}
              onClick={() => setConfirming(true)}
            >
              Save billing dates
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Save billing dates?"
        description={
          invoicesAffected > 0
            ? `${invoicesAffected} existing invoice${invoicesAffected === 1 ? '' : 's'} will get the new dates. Overdue status and reminders follow the new due date.`
            : 'Only invoices generated from now on will use these dates.'
        }
        footer={
          <>
            <Button onClick={save} loading={pending}>Yes, save dates</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        }
      >
        <ul className="divide-y divide-[var(--border)] text-sm">
          {targets.map((row) => {
            const value = rows[row.id]!
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium text-ink">{row.name}</span>
                <span className="text-ink-muted tnum">
                  Generate {show(value.issueOn)} · due {show(value.dueOn)}
                </span>
              </li>
            )
          })}
        </ul>
      </Dialog>

      {schedule.invoiceGroups.length > 0 ? <InvoiceGroupDates schedule={schedule} /> : null}
    </div>
  )
}

const range = (from: string, to: string) => (from === to ? show(from) : `${show(from)} – ${show(to)}`)

/** Invoices generated by title rather than from an installment; a row moves every invoice with that title. */
function InvoiceGroupDates({ schedule }: { schedule: FeeStructureSchedule }) {
  const router = useRouter()
  const toast = useToast()
  const initial = React.useMemo(
    () => Object.fromEntries(schedule.invoiceGroups.map((group) => [group.title, {
      issueOn: group.issuedFrom === group.issuedTo ? group.issuedFrom : '',
      dueOn: group.dueFrom === group.dueTo ? group.dueFrom : '',
    }])),
    [schedule],
  )
  const [rows, setRows] = React.useState<Record<string, Row>>(initial)
  const [confirming, setConfirming] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => setRows(initial), [initial])

  const changed = schedule.invoiceGroups.filter((group) => {
    const value = rows[group.title]!
    const start = initial[group.title]!
    return Boolean(value.issueOn && value.dueOn) && (value.issueOn !== start.issueOn || value.dueOn !== start.dueOn)
  })
  const invalid = changed.some((group) => rows[group.title]!.issueOn > rows[group.title]!.dueOn)
  const affected = changed.reduce((sum, group) => sum + group.invoiceCount, 0)

  const save = () => startTransition(async () => {
    const result = await updateInvoiceGroupDatesAction({
      structureId: schedule.id,
      groups: changed.map((group) => ({
        title: group.title,
        issuedOn: rows[group.title]!.issueOn,
        dueOn: rows[group.title]!.dueOn,
      })),
    })
    setConfirming(false)
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? 'Invoice dates saved' : 'Invoice dates not saved',
      description: result.message,
    })
    if (result.ok) router.refresh()
  })

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Invoices already generated</CardTitle>
          <p className="mt-0.5 text-sm text-ink-muted">
            One row per invoice title. Saving a row gives every invoice with that title the same
            invoice date and due date; amounts, payments and receipts do not change.
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2 text-left text-xs font-medium text-ink-muted">
              <tr>
                <th className="px-3.5 py-2.5">Invoice title</th>
                <th className="px-3.5 py-2.5">Invoices</th>
                <th className="px-3.5 py-2.5">Invoice date</th>
                <th className="px-3.5 py-2.5">Due date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {schedule.invoiceGroups.map((group) => {
                const value = rows[group.title]!
                return (
                  <tr key={group.title} className={changed.includes(group) ? 'bg-surface-2/60' : undefined}>
                    <td className="px-3.5 py-2.5 align-top font-medium text-ink">{group.title}</td>
                    <td className="px-3.5 py-2.5 align-top tnum text-ink-muted">{group.invoiceCount}</td>
                    <td className="px-3.5 py-2.5 align-top">
                      <Input
                        type="date"
                        className="w-40"
                        value={value.issueOn}
                        aria-label={`Invoice date for ${group.title}`}
                        onChange={(e) => setRows((current) => ({ ...current, [group.title]: { ...value, issueOn: e.target.value } }))}
                      />
                      <p className="mt-1 text-xs text-ink-subtle">Now: {range(group.issuedFrom, group.issuedTo)}</p>
                    </td>
                    <td className="px-3.5 py-2.5 align-top">
                      <Input
                        type="date"
                        className="w-40"
                        value={value.dueOn}
                        aria-label={`Due date for ${group.title}`}
                        onChange={(e) => setRows((current) => ({ ...current, [group.title]: { ...value, dueOn: e.target.value } }))}
                      />
                      <p className="mt-1 text-xs text-ink-subtle">Now: {range(group.dueFrom, group.dueTo)}</p>
                      {value.issueOn && value.dueOn && value.issueOn > value.dueOn ? (
                        <p className="mt-1 text-xs text-[var(--danger)]">Due date is before the invoice date</p>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-3.5 py-3">
          <Button variant="ghost" disabled={changed.length === 0 || pending} onClick={() => setRows(initial)}>
            Reset
          </Button>
          <Button disabled={changed.length === 0 || invalid} loading={pending} onClick={() => setConfirming(true)}>
            Save invoice dates
          </Button>
        </div>
      </CardContent>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Move invoice dates?"
        description={`${affected} invoice${affected === 1 ? '' : 's'} will get the new dates. Overdue status and reminders follow the new due date.`}
        footer={
          <>
            <Button onClick={save} loading={pending}>Yes, move dates</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        }
      >
        <ul className="divide-y divide-[var(--border)] text-sm">
          {changed.map((group) => (
            <li key={group.title} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-medium text-ink">{group.title}</span>
              <span className="text-ink-muted tnum">
                Invoice {show(rows[group.title]!.issueOn)} · due {show(rows[group.title]!.dueOn)}
              </span>
            </li>
          ))}
        </ul>
      </Dialog>
    </Card>
  )
}
