'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import {
  previewFeeAssignmentAction,
  previewFeePlanAction,
  publishFeePlanAction,
  saveFeePlanDraftAction,
} from '../../actions'
import { Button, IconButton } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { formatDay } from '@/lib/dates'
import { formatMoney } from '@/lib/utils'

type Session = { id: string; name: string; startsOn: string; endsOn: string; isCurrent: boolean }
type ClassLevel = { id: string; name: string; sections: { id: string; name: string }[] }
type Head = { id: string; name: string; code: string; frequency: string }
type Frequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'TERM_WISE' | 'ANNUAL'
type Line = { feeHeadId: string; amount: string; frequency: Frequency; isOptional: boolean }
type PlanPreview = {
  annualMinor: number
  monthlyEquivalentMinor: number
  installments: { name: string; dueOn: string; amountMinor: number; lines: { label: string; amountMinor: number }[] }[]
}
type AssignmentStudent = { id: string; name: string; admissionNo: string; section: string }

const STEPS = ['Basic details', 'Fee components', 'Installments', 'Preview', 'Publish']
const FREQUENCIES: { value: Frequency; label: string; count: number }[] = [
  { value: 'ONE_TIME', label: 'One time', count: 1 },
  { value: 'MONTHLY', label: 'Monthly', count: 12 },
  { value: 'QUARTERLY', label: 'Quarterly', count: 4 },
  { value: 'HALF_YEARLY', label: 'Half-yearly', count: 2 },
  { value: 'TERM_WISE', label: 'Term-wise', count: 3 },
  { value: 'ANNUAL', label: 'Annual', count: 1 },
]

export function FeePlanWizard({
  currency, sessions, classes, heads, canPublish,
}: {
  currency: string
  sessions: Session[]
  classes: ClassLevel[]
  heads: Head[]
  canPublish: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const initialHead = heads[0]
  const [step, setStep] = React.useState(0)
  const [sessionId, setSessionId] = React.useState(sessions.find((session) => session.isCurrent)?.id ?? sessions[0]?.id ?? '')
  const [classLevelId, setClassLevelId] = React.useState(classes[0]?.id ?? '')
  const [name, setName] = React.useState(classes[0]?.name ?? '')
  const [description, setDescription] = React.useState('')
  const [dueDay, setDueDay] = React.useState('10')
  const [lines, setLines] = React.useState<Line[]>(initialHead ? [{
    feeHeadId: initialHead.id,
    amount: '',
    frequency: (FREQUENCIES.some((item) => item.value === initialHead.frequency) ? initialHead.frequency : 'ANNUAL') as Frequency,
    isOptional: false,
  }] : [])
  const [preview, setPreview] = React.useState<PlanPreview | null>(null)
  const [structureId, setStructureId] = React.useState('')
  const [assignment, setAssignment] = React.useState<'CLASS' | 'SECTION' | 'SELECTED'>('CLASS')
  const [sectionId, setSectionId] = React.useState('')
  const [students, setStudents] = React.useState<AssignmentStudent[]>([])
  const [studentIds, setStudentIds] = React.useState<string[]>([])
  const [pending, startTransition] = React.useTransition()

  const payload = {
    id: structureId || undefined,
    sessionId,
    classLevelId,
    name,
    description: description || undefined,
    dueDay: Number(dueDay),
    items: lines.map((line) => ({ ...line, amount: Number(line.amount) })),
  }
  const selectedClass = classes.find((item) => item.id === classLevelId)
  const canContinue = step === 0
    ? Boolean(sessionId && classLevelId && name.trim())
    : step === 1
      ? lines.length > 0 && lines.every((line) => line.feeHeadId && Number(line.amount) > 0)
      : true

  const calculate = () => startTransition(async () => {
    const result = await previewFeePlanAction(payload)
    if (!result.ok) {
      toast.push({ tone: 'error', title: 'Check the fee plan', description: result.message })
      return
    }
    setPreview(result.data as PlanPreview)
    setStep(2)
  })

  const saveDraft = (nextStep = false) => startTransition(async () => {
    const result = await saveFeePlanDraftAction(payload)
    if (!result.ok) {
      toast.push({ tone: 'error', title: 'Draft not saved', description: result.message })
      return
    }
    const data = result.data as { structure: { id: string; name: string } }
    setStructureId(data.structure.id)
    if (data.structure.name) setName(data.structure.name)
    toast.push({ tone: 'success', title: 'Draft saved', description: result.message })
    if (nextStep) {
      if (canPublish) setStep(4)
      else {
        router.push('/finance/structures')
        router.refresh()
      }
    }
  })

  const loadAssignment = () => startTransition(async () => {
    if (!structureId) return
    const result = await previewFeeAssignmentAction({
      structureId,
      assignment: assignment === 'SELECTED' ? 'CLASS' : assignment,
      sectionId: sectionId || undefined,
    })
    if (!result.ok) {
      toast.push({ tone: 'error', title: 'Preview unavailable', description: result.message })
      return
    }
    const next = (result.data as { students: AssignmentStudent[] }).students
    setStudents(next)
    setStudentIds(assignment === 'SELECTED' ? [] : next.map((student) => student.id))
  })

  const publish = () => startTransition(async () => {
    const result = await publishFeePlanAction({
      structureId,
      assignment,
      sectionId: sectionId || undefined,
      studentIds: assignment === 'SELECTED' ? studentIds : undefined,
    })
    if (!result.ok) {
      toast.push({ tone: 'error', title: 'Fee plan not published', description: result.message })
      return
    }
    toast.push({ tone: 'success', title: 'Fee plan published', description: result.message })
    router.push('/finance/structures')
    router.refresh()
  })

  const next = () => {
    if (step === 1) return calculate()
    if (step === 3) return saveDraft(true)
    setStep((current) => Math.min(4, current + 1))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ol className="flex overflow-x-auto rounded-[var(--radius)] border border-line bg-surface">
        {STEPS.map((label, index) => (
          <li key={label} className="flex min-w-[9rem] flex-1 items-center gap-2 border-r border-line px-3 py-2.5 last:border-r-0">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${index < step ? 'bg-success text-white' : index === step ? 'bg-[var(--brand-600)] text-white' : 'bg-surface-2 text-ink-muted'}`}>
              {index < step ? <Check className="size-3.5" aria-hidden /> : index + 1}
            </span>
            <span className={`text-xs ${index === step ? 'font-medium text-ink' : 'text-ink-muted'}`}>{label}</span>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{STEPS[step]}</CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">
              {step === 0 && 'Choose who this structure is for.'}
              {step === 1 && 'Enter the amount charged each time; the annual amount is calculated.'}
              {step === 2 && 'Review the automatically generated payment schedule.'}
              {step === 3 && 'Confirm the full annual plan before saving.'}
              {step === 4 && 'Preview affected students before invoices are created.'}
            </p>
          </div>
          <Badge>Step {step + 1} of 5</Badge>
        </CardHeader>
        <CardContent>
          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Academic session" htmlFor="plan-session" required>
                <Select id="plan-session" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
                  {sessions.map((session) => <option key={session.id} value={session.id}>{session.name}{session.isCurrent ? ' (current)' : ''}</option>)}
                </Select>
              </Field>
              <Field label="Class" htmlFor="plan-class" required>
                <Select id="plan-class" value={classLevelId} onChange={(event) => {
                  const nextClassId = event.target.value
                  const previousClass = classes.find((item) => item.id === classLevelId)
                  const nextClass = classes.find((item) => item.id === nextClassId)
                  setClassLevelId(nextClassId)
                  setSectionId('')
                  if (!name.trim() || (previousClass && name.trim() === previousClass.name)) {
                    setName(nextClass?.name ?? '')
                  }
                }}>
                  {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </Select>
              </Field>
              <Field label="Fee structure name" htmlFor="plan-name" required className="sm:col-span-2">
                <Input id="plan-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Class 12" autoFocus />
              </Field>
              <Field label="Description" htmlFor="plan-description" className="sm:col-span-2">
                <Textarea id="plan-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="Optional note for staff" />
              </Field>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <p className="text-sm text-ink-muted">Use reusable fee heads. Transport charges should come from route/stop assignments.</p>
                <Field label="Default due day" htmlFor="due-day">
                  <Input id="due-day" type="number" min={1} max={28} value={dueDay} onChange={(event) => setDueDay(event.target.value)} />
                </Field>
              </div>
              <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-line">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[1.5fr_8rem_10rem_9rem_3rem] gap-2 bg-surface-2 px-3 py-2 text-xs font-medium text-ink-muted">
                    <span>Fee component</span><span>Amount</span><span>Frequency</span><span>Annual amount</span><span />
                  </div>
                  {lines.map((line, index) => {
                    const count = FREQUENCIES.find((frequency) => frequency.value === line.frequency)?.count ?? 1
                    return (
                      <div key={index} className="grid grid-cols-[1.5fr_8rem_10rem_9rem_3rem] items-center gap-2 border-t border-line px-3 py-2">
                        <Select value={line.feeHeadId} aria-label="Fee component" onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, feeHeadId: event.target.value } : item))}>
                          {heads.map((head) => <option key={head.id} value={head.id}>{head.name}</option>)}
                        </Select>
                        <Input value={line.amount} aria-label="Amount in rupees" type="number" min={0} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))} />
                        <Select value={line.frequency} aria-label="Frequency" onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, frequency: event.target.value as Frequency } : item))}>
                          {FREQUENCIES.map((frequency) => <option key={frequency.value} value={frequency.value}>{frequency.label}</option>)}
                        </Select>
                        <span className="text-sm font-medium tnum">{formatMoney(Math.round(Number(line.amount || 0) * count * 100), currency)}</span>
                        <IconButton label="Remove component" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Trash2 aria-hidden /></IconButton>
                      </div>
                    )
                  })}
                </div>
              </div>
              <Button variant="secondary" size="sm" disabled={lines.length >= heads.length} onClick={() => {
                const used = new Set(lines.map((line) => line.feeHeadId))
                const head = heads.find((item) => !used.has(item.id))
                if (head) setLines((current) => [...current, { feeHeadId: head.id, amount: '', frequency: (FREQUENCIES.some((item) => item.value === head.frequency) ? head.frequency : 'ANNUAL') as Frequency, isOptional: false }])
              }}>
                <Plus aria-hidden /> Add fee component
              </Button>
            </div>
          ) : null}

          {step === 2 && preview ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-3">
                <div><p className="text-sm font-medium text-ink">{preview.installments.length} installments</p><p className="text-xs text-ink-muted">Due on day {dueDay} where applicable</p></div>
                <p className="text-lg font-semibold tnum">{formatMoney(preview.annualMinor, currency)} annually</p>
              </div>
              <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-line">
                {preview.installments.map((installment) => (
                  <li key={installment.name} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div><p className="text-sm font-medium text-ink">{installment.name}</p><p className="text-xs text-ink-subtle">{formatDay(new Date(installment.dueOn), 'd MMM yyyy')} · {installment.lines.map((line) => line.label).join(', ')}</p></div>
                    <span className="font-medium tnum">{formatMoney(installment.amountMinor, currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step === 3 && preview ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">{name}</h2>
                <p className="text-sm text-ink-muted">{sessions.find((session) => session.id === sessionId)?.name} · {selectedClass?.name}</p>
              </div>
              <div className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-line">
                {lines.map((line) => {
                  const head = heads.find((item) => item.id === line.feeHeadId)
                  const frequency = FREQUENCIES.find((item) => item.value === line.frequency)!
                  return <div key={line.feeHeadId} className="flex justify-between gap-3 px-3.5 py-2.5"><div><p className="text-sm text-ink">{head?.name}</p><p className="text-xs text-ink-subtle">{formatMoney(Number(line.amount) * 100, currency)} × {frequency.count} · {frequency.label}</p></div><span className="font-medium tnum">{formatMoney(Number(line.amount) * frequency.count * 100, currency)}</span></div>
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><p className="text-xs text-ink-muted">Annual fee</p><p className="text-xl font-semibold tnum">{formatMoney(preview.annualMinor, currency)}</p></div>
                <div><p className="text-xs text-ink-muted">Monthly equivalent</p><p className="text-xl font-semibold tnum">{formatMoney(preview.monthlyEquivalentMinor, currency)}</p></div>
                <div><p className="text-xs text-ink-muted">Installments</p><p className="text-xl font-semibold tnum">{preview.installments.length}</p></div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Assign to" htmlFor="assign-to">
                  <Select id="assign-to" value={assignment} onChange={(event) => { setAssignment(event.target.value as typeof assignment); setStudents([]); setStudentIds([]) }}>
                    <option value="CLASS">Entire class</option>
                    <option value="SECTION">Specific section</option>
                    <option value="SELECTED">Selected students</option>
                  </Select>
                </Field>
                {assignment === 'SECTION' ? (
                  <Field label="Section" htmlFor="assign-section">
                    <Select id="assign-section" value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
                      <option value="">Choose section</option>
                      {selectedClass?.sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                    </Select>
                  </Field>
                ) : null}
              </div>
              <Button variant="secondary" onClick={loadAssignment} loading={pending}>Preview affected students</Button>
              {students.length ? (
                <div className="rounded-[var(--radius-sm)] border border-line">
                  <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-3.5 py-2.5">
                    <p className="text-sm font-medium text-ink">{assignment === 'SELECTED' ? studentIds.length : students.length} of {students.length} students selected</p>
                    {assignment === 'SELECTED' ? <Button size="sm" variant="ghost" onClick={() => setStudentIds(studentIds.length === students.length ? [] : students.map((student) => student.id))}>Select all</Button> : null}
                  </div>
                  <ul className="max-h-72 divide-y divide-[var(--border)] overflow-y-auto">
                    {students.map((student) => (
                      <li key={student.id} className="flex items-center gap-3 px-3.5 py-2">
                        {assignment === 'SELECTED' ? <Checkbox checked={studentIds.includes(student.id)} onChange={() => setStudentIds((current) => current.includes(student.id) ? current.filter((id) => id !== student.id) : [...current, student.id])} /> : <Check className="size-4 text-success" aria-hidden />}
                        <div><p className="text-sm text-ink">{student.name}</p><p className="text-xs text-ink-subtle">{student.admissionNo} · Section {student.section}</p></div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" disabled={step === 0 || pending} onClick={() => setStep((current) => current - 1)}><ChevronLeft aria-hidden /> Back</Button>
        <div className="flex gap-2">
          {step >= 2 && step < 4 ? <Button variant="secondary" loading={pending} onClick={() => saveDraft(false)}>Save draft</Button> : null}
          {step < 4 ? <Button loading={pending} disabled={!canContinue} onClick={next}>{step === 3 ? (canPublish ? 'Save & assign' : 'Save draft') : 'Continue'} <ChevronRight aria-hidden /></Button> : null}
          {step === 4 && canPublish ? <Button loading={pending} disabled={!students.length || (assignment === 'SELECTED' && !studentIds.length)} onClick={publish}>Publish & assign</Button> : null}
        </div>
      </div>
    </div>
  )
}
