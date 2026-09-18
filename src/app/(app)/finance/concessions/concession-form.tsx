'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Percent } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { grantConcessionAction, updateConcessionAction } from '../actions'

type Student = { id: string; firstName: string; lastName: string; admissionNo: string }
type FeeHead = { id: string; name: string }
export type EditableConcession = {
  id: string
  studentId: string
  name: string
  kind: 'PERCENT' | 'FLAT'
  value: number
  feeHeadId: string
  reason: string
  validFrom: string
  validTo: string
}

export function ConcessionForm({
  students,
  feeHeads,
  concession,
}: {
  students: Student[]
  feeHeads: FeeHead[]
  concession?: EditableConcession
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [studentId, setStudentId] = React.useState(concession?.studentId ?? students[0]?.id ?? '')
  const [name, setName] = React.useState(concession?.name ?? '')
  const [kind, setKind] = React.useState<'PERCENT' | 'FLAT'>(concession?.kind ?? 'PERCENT')
  const [value, setValue] = React.useState(concession ? String(concession.value) : '')
  const [feeHeadId, setFeeHeadId] = React.useState(concession?.feeHeadId ?? '')
  const [reason, setReason] = React.useState(concession?.reason ?? '')
  const [validFrom, setValidFrom] = React.useState(concession?.validFrom ?? '')
  const [validTo, setValidTo] = React.useState(concession?.validTo ?? '')

  const openEditor = () => {
    setStudentId(concession?.studentId ?? students[0]?.id ?? '')
    setName(concession?.name ?? '')
    setKind(concession?.kind ?? 'PERCENT')
    setValue(concession ? String(concession.value) : '')
    setFeeHeadId(concession?.feeHeadId ?? '')
    setReason(concession?.reason ?? '')
    setValidFrom(concession?.validFrom ?? '')
    setValidTo(concession?.validTo ?? '')
    setOpen(true)
  }

  const submit = () => startTransition(async () => {
    const payload = {
      ...(concession ? { id: concession.id } : {}),
      studentId,
      name,
      kind,
      value,
      feeHeadId: feeHeadId || undefined,
      reason: reason || undefined,
      validFrom: validFrom || undefined,
      validTo: validTo || undefined,
    }
    const result = concession
      ? await updateConcessionAction(payload)
      : await grantConcessionAction(payload)
    if (!result.ok) {
      toast.push({ tone: 'error', title: concession ? 'Could not update discount' : 'Could not grant discount', description: result.message })
      return
    }
    toast.push({ tone: 'success', title: concession ? 'Discount updated' : 'Discount granted', description: result.message })
    setOpen(false)
    router.refresh()
  })

  return (
    <>
      {concession ? (
        <IconButton label={`Edit ${concession.name}`} small onClick={openEditor}>
          <Pencil aria-hidden />
        </IconButton>
      ) : (
        <Button size="sm" onClick={openEditor} disabled={students.length === 0}>
          <Percent aria-hidden /> Grant discount
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={concession ? 'Edit discount' : 'Grant discount'}
        description="The discount updates eligible current outstanding invoices and also applies to future invoices."
        footer={<><Button onClick={submit} loading={pending} disabled={!studentId || !name.trim() || !value}>{concession ? 'Save changes' : 'Grant discount'}</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Student" htmlFor="concession-student" required className="sm:col-span-2">
            <Select id="concession-student" value={studentId} disabled={Boolean(concession)} onChange={(e) => setStudentId(e.target.value)}>
              {students.map((student) => <option key={student.id} value={student.id}>{student.firstName} {student.lastName} — {student.admissionNo}</option>)}
            </Select>
          </Field>
          <Field label="Discount name" htmlFor="concession-name" required>
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
