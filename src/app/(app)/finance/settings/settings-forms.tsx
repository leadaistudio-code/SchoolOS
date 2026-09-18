'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { BellPlus, Bus, ClockAlert } from 'lucide-react'
import { saveFeeReminderRuleAction, saveLateFeeRuleAction, saveTransportFeeRateAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

export function FeeSettingsForms({
  stops,
  feeHeads,
}: {
  stops: { id: string; label: string }[]
  feeHeads: { id: string; name: string }[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = React.useState<'reminder' | 'late' | 'transport' | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState('')
  const [offsetType, setOffsetType] = React.useState('BEFORE_DUE')
  const [offsetDays, setOffsetDays] = React.useState('7')
  const [graceDays, setGraceDays] = React.useState('3')
  const [kind, setKind] = React.useState('FLAT')
  const [value, setValue] = React.useState('')
  const [perDay, setPerDay] = React.useState(false)
  const [maxAmount, setMaxAmount] = React.useState('')
  const [stopId, setStopId] = React.useState(stops[0]?.id ?? '')
  const [feeHeadId, setFeeHeadId] = React.useState(feeHeads[0]?.id ?? '')
  const [effectiveFrom, setEffectiveFrom] = React.useState(new Date().toISOString().slice(0, 10))

  const save = () => startTransition(async () => {
    const result = form === 'reminder'
      ? await saveFeeReminderRuleAction({ name, offsetType, offsetDays: Number(offsetDays), channels: ['IN_APP'], maxSends: 1, isActive: true })
      : form === 'late'
        ? await saveLateFeeRuleAction({ name, graceDays: Number(graceDays), kind, value: Number(value), perDay, maxAmount: maxAmount ? Number(maxAmount) : undefined })
        : await saveTransportFeeRateAction({ stopId, feeHeadId, amount: Number(value), effectiveFrom })
    if (!result.ok) {
      toast.push({ tone: 'error', title: 'Setting not saved', description: result.message })
      return
    }
    toast.push({ tone: 'success', title: 'Setting saved', description: result.message })
    setForm(null)
    setName('')
    router.refresh()
  })

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setForm('reminder')}><BellPlus aria-hidden /> Add reminder rule</Button>
        <Button variant="secondary" onClick={() => setForm('late')}><ClockAlert aria-hidden /> Add late fee rule</Button>
        <Button variant="secondary" disabled={!stops.length || !feeHeads.length} onClick={() => { setForm('transport'); setName('Transport fee'); setValue('') }}><Bus aria-hidden /> Add transport rate</Button>
      </div>
      <Dialog
        open={form !== null}
        onClose={() => setForm(null)}
        title={form === 'reminder' ? 'New reminder rule' : form === 'late' ? 'New late fee rule' : 'New transport fee rate'}
        description={form === 'reminder' ? 'Parents are contacted only through enabled school channels.' : form === 'late' ? 'Late fees are calculated by the scheduled finance job.' : 'The current route/stop assignment controls which students are charged.'}
        footer={<><Button loading={pending} disabled={!name.trim() || (form === 'late' && !value)} onClick={save}>Save rule</Button><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button></>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {form !== 'transport' ? <Field label="Rule name" htmlFor="rule-name" className="sm:col-span-2" required>
            <Input id="rule-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={form === 'reminder' ? '7 days before due date' : 'Standard late fee'} autoFocus />
          </Field> : null}
          {form === 'reminder' ? (
            <>
              <Field label="Timing" htmlFor="reminder-timing"><Select id="reminder-timing" value={offsetType} onChange={(event) => setOffsetType(event.target.value)}><option value="BEFORE_DUE">Before due date</option><option value="ON_DUE">On due date</option><option value="AFTER_DUE">After due date</option></Select></Field>
              <Field label="Days" htmlFor="reminder-days"><Input id="reminder-days" type="number" min={0} value={offsetDays} onChange={(event) => setOffsetDays(event.target.value)} /></Field>
            </>
          ) : form === 'late' ? (
            <>
              <Field label="Grace days" htmlFor="late-grace"><Input id="late-grace" type="number" min={0} value={graceDays} onChange={(event) => setGraceDays(event.target.value)} /></Field>
              <Field label="Type" htmlFor="late-kind"><Select id="late-kind" value={kind} onChange={(event) => setKind(event.target.value)}><option value="FLAT">Fixed amount</option><option value="PERCENT">Percentage</option></Select></Field>
              <Field label={kind === 'FLAT' ? 'Amount (₹)' : 'Percentage'} htmlFor="late-value"><Input id="late-value" type="number" min={0} value={value} onChange={(event) => setValue(event.target.value)} /></Field>
              <Field label="Maximum fine (₹)" htmlFor="late-max"><Input id="late-max" type="number" min={0} value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} /></Field>
              <label className="flex items-center gap-2 sm:col-span-2"><Checkbox checked={perDay} onChange={(event) => setPerDay(event.target.checked)} /><span className="text-sm text-ink">Charge for each day after grace period</span></label>
            </>
          ) : (
            <>
              <Field label="Route and stop" htmlFor="transport-stop" className="sm:col-span-2"><Select id="transport-stop" value={stopId} onChange={(event) => setStopId(event.target.value)}>{stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.label}</option>)}</Select></Field>
              <Field label="Fee head" htmlFor="transport-head"><Select id="transport-head" value={feeHeadId} onChange={(event) => setFeeHeadId(event.target.value)}>{feeHeads.map((head) => <option key={head.id} value={head.id}>{head.name}</option>)}</Select></Field>
              <Field label="Monthly amount (₹)" htmlFor="transport-amount"><Input id="transport-amount" type="number" min={0} value={value} onChange={(event) => setValue(event.target.value)} /></Field>
              <Field label="Effective from" htmlFor="transport-effective"><Input id="transport-effective" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></Field>
            </>
          )}
        </div>
      </Dialog>
    </>
  )
}
