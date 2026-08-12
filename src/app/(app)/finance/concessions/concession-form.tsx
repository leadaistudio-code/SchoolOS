'use client'

import * as React from 'react'
import { Percent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { grantConcessionAction } from '../actions'

type Student = { id: string; firstName: string; lastName: string; admissionNo: string }
type FeeHead = { id: string; name: string }

export function ConcessionForm({ students, feeHeads }: { students: Student[]; feeHeads: FeeHead[] }) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [studentId, setStudentId] = React.useState(students[0]?.id ?? '')
  const [name, setName] = React.useState('')
  const [kind, setKind] = React.useState<'PERCENT' | 'FLAT'>('PERCENT')
  const [value, setValue] = React.useState('')
  const [feeHeadId, setFeeHeadId] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [validFrom, setValidFrom] = React.useState('')
  const [validTo, setValidTo] = React.useState('')

  const submit = () => startTransition(async () => {
    const result = await grantConcessionAction({ studentId, name, kind, value, feeHeadId: feeHeadId || undefined, reason: reason || undefined, validFrom: validFrom || undefined, validTo: validTo || undefined })
    if (!result.ok) {
      toast.push({ tone: 'error', title: 'Could not grant concession', description: result.message })
      return
    }
    toast.push({ tone: 'success', title: 'Concession granted', description: result.message })
    setOpen(false)
    setName(''); setValue(''); setFeeHeadId(''); setReason(''); setValidFrom(''); setValidTo('')
  })

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={students.length === 0}>
        <Percent aria-hidden /> Grant concession
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Grant concession"
        description="This changes future invoices only. Existing issued invoices remain unchanged."
        footer={<><Button onClick={submit} loading={pending} disabled={!studentId || !name.trim() || !value}>Grant concession</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Student" htmlFor="concession-student" required className="sm:col-span-2">
            <Select id="concession-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              {students.map((student) => <option key={student.id} value={student.id}>{student.firstName} {student.lastName} — {student.admissionNo}</option>)}
            </Select>
          </Field>
          <Field label="Concession name" htmlFor="concession-name" required>
            <Input id="concession-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sibling discount" />
          </Field>
          <Field label="Type" htmlFor="concession-kind" required>
            <Select id="concession-kind" value={kind} onChange={(e) => setKind(e.target.value as 'PERCENT' | 'FLAT')}>
              <option value="PERCENT">Percentage</option><option value="FLAT">Flat amount</option>
            </Select>
          </Field>
          <Field label={kind === 'PERCENT' ? 'Percentage' : 'Amount in rupees'} htmlFor="concession-value" required hint={kind === 'PERCENT' ? 'Maximum 100%' : 'Applied to each eligible fee line'}>
            <Input id="concession-value" type="number" min="0" max={kind === 'PERCENT' ? 100 : undefined} step={kind === 'PERCENT' ? 1 : 0.01} value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Fee head" htmlFor="concession-head" hint="Leave blank to apply to every fee head">
            <Select id="concession-head" value={feeHeadId} onChange={(e) => setFeeHeadId(e.target.value)}><option value="">All fee heads</option>{feeHeads.map((head) => <option key={head.id} value={head.id}>{head.name}</option>)}</Select>
          </Field>
          <Field label="Valid from" htmlFor="concession-from"><Input id="concession-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></Field>
          <Field label="Valid until" htmlFor="concession-to"><Input id="concession-to" type="date" min={validFrom || undefined} value={validTo} onChange={(e) => setValidTo(e.target.value)} /></Field>
          <Field label="Reason / approval note" htmlFor="concession-reason" className="sm:col-span-2"><Textarea id="concession-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
      </Dialog>
    </>
  )
}
