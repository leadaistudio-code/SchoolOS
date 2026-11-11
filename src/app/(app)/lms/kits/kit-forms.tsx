'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import type { LmsResult } from '@/components/lms/types'
import { archiveKitAction, createKitAction, issueKitAction, returnKitAction, studentsInClassAction, updateKitAction } from './actions'

type ClassOption = { id: string; name: string }
type CourseOption = { id: string; title: string }

function useRunner() {
  const router = useRouter()
  const { push } = useToast()
  const [pending, startTransition] = React.useTransition()
  const run = (op: () => Promise<LmsResult>, after?: (r: LmsResult) => void) =>
    startTransition(async () => {
      const result = await op()
      push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (result.ok) {
        after?.(result)
        router.refresh()
      }
    })
  return { pending, run, router }
}

export type KitValues = { id?: string; name: string; code: string; description: string; courseId: string; quantity: string }

export function KitButton({ kit, courses }: { kit?: KitValues; courses: CourseOption[] }) {
  const { pending, run, router } = useRunner()
  const [open, setOpen] = React.useState(false)
  const blank: KitValues = { name: '', code: '', description: '', courseId: '', quantity: '10' }
  const [form, setForm] = React.useState<KitValues>(kit ?? blank)
  const set = (key: keyof KitValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  function save() {
    run(
      () => (kit?.id ? updateKitAction(kit.id, form) : createKitAction(form)),
      (r) => {
        setOpen(false)
        if (!kit?.id && r.ok && r.id) router.push(`/lms/kits/${r.id}`)
      },
    )
  }

  return (
    <>
      {kit?.id ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Pencil /> Edit kit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus /> Add kits
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={kit?.id ? 'Edit kit' : 'Add robotics kits'}
        description="One entry per kind of kit, with how many the school holds."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={pending} onClick={save}>Save</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Kit name" required htmlFor="k-name" className="sm:col-span-2">
            <Input id="k-name" value={form.name} onChange={set('name')} placeholder="Arduino line-follower kit" />
          </Field>
          <Field label="How many the school has" required htmlFor="k-qty">
            <Input id="k-qty" type="number" min={0} value={form.quantity} onChange={set('quantity')} />
          </Field>
          <Field label="Code" htmlFor="k-code" hint="Optional label or SKU">
            <Input id="k-code" value={form.code} onChange={set('code')} placeholder="LF-01" />
          </Field>
          <Field label="Used in course" htmlFor="k-course" className="sm:col-span-2">
            <Select id="k-course" value={form.courseId} onChange={set('courseId')}>
              <option value="">Not tied to a course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Field>
          <Field label="What is in the box" htmlFor="k-desc" className="sm:col-span-2" hint="Check returns against this list">
            <Textarea id="k-desc" rows={4} value={form.description} onChange={set('description')} placeholder={'1 × Arduino Uno\n2 × IR sensors\n1 × L298N motor driver\n2 × DC motors with wheels'} />
          </Field>
        </div>
      </Dialog>
    </>
  )
}

export function ArchiveKitButton({ id }: { id: string }) {
  const { pending, run, router } = useRunner()
  return (
    <Button
      variant="ghost"
      className="text-[var(--danger)]"
      loading={pending}
      onClick={() => {
        if (window.confirm('Remove this kit from the register? Its loan history is kept.')) {
          run(() => archiveKitAction(id), () => router.push('/lms/kits'))
        }
      }}
    >
      <Trash2 /> Remove
    </Button>
  )
}

export function IssueKitButton({ kitId, available, classes }: { kitId: string; available: number; classes: ClassOption[] }) {
  const { pending, run } = useRunner()
  const [open, setOpen] = React.useState(false)
  const blank = { classLevelId: '', studentId: '', quantity: '1', dueOn: '', note: '' }
  const [form, setForm] = React.useState(blank)
  const [students, setStudents] = React.useState<{ id: string; label: string; hint: string }[]>([])
  const [loading, setLoading] = React.useState(false)

  async function pickClass(classLevelId: string) {
    setForm((f) => ({ ...f, classLevelId, studentId: '' }))
    setStudents([])
    if (!classLevelId) return
    setLoading(true)
    setStudents(await studentsInClassAction(classLevelId))
    setLoading(false)
  }
  const set = (key: 'studentId' | 'quantity' | 'dueOn' | 'note') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={available < 1} title={available < 1 ? 'None left to issue' : undefined}>
        <PackagePlus /> Issue to a student
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Issue a kit"
        description={`${available} available to issue.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={pending}
              disabled={!form.studentId}
              onClick={() =>
                run(
                  () => issueKitAction(kitId, form),
                  () => {
                    setOpen(false)
                    setForm(blank)
                    setStudents([])
                  },
                )
              }
            >
              Issue
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Class" required htmlFor="ki-class">
            <Select id="ki-class" value={form.classLevelId} onChange={(e) => pickClass(e.target.value)}>
              <option value="">Pick a class</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Student" required htmlFor="ki-student">
            <Select id="ki-student" value={form.studentId} onChange={set('studentId')} disabled={!form.classLevelId || loading}>
              <option value="">{loading ? 'Loading…' : form.classLevelId && students.length === 0 ? 'No students in this class' : 'Pick a student'}</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.hint ? ` (${s.hint})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How many" htmlFor="ki-qty">
            <Input id="ki-qty" type="number" min={1} max={Math.max(1, available)} value={form.quantity} onChange={set('quantity')} />
          </Field>
          <Field label="Due back" htmlFor="ki-due" hint="Optional">
            <Input id="ki-due" type="date" value={form.dueOn} onChange={set('dueOn')} />
          </Field>
          <Field label="Note" htmlFor="ki-note" className="sm:col-span-2">
            <Input id="ki-note" value={form.note} onChange={set('note')} placeholder="For the science-fair project" />
          </Field>
        </div>
      </Dialog>
    </>
  )
}

const CONDITIONS = [
  { value: 'GOOD', label: 'Complete and working' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'PARTS_MISSING', label: 'Parts missing' },
  { value: 'LOST', label: 'Lost (remove from stock)' },
] as const

export function ReturnKitButton({ loanId, label }: { loanId: string; label: string }) {
  const { pending, run } = useRunner()
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState({ condition: 'GOOD', note: '' })

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <PackageCheck /> Return
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Check a kit back in"
        description={label}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={pending} onClick={() => run(() => returnKitAction(loanId, form), () => setOpen(false))}>
              Record return
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Condition" htmlFor="kr-cond">
            <Select id="kr-cond" value={form.condition} onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}>
              {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Note" htmlFor="kr-note" hint={form.condition === 'GOOD' ? 'Optional' : 'Needed: what is damaged or missing'}>
            <Textarea id="kr-note" rows={3} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="One IR sensor missing" />
          </Field>
        </div>
      </Dialog>
    </>
  )
}
