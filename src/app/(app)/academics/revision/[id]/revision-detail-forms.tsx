'use client'

import * as React from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  addRevisionSlotAction,
  deleteRevisionPlanAction,
  deleteRevisionSlotAction,
  publishRevisionPlanAction,
  unpublishRevisionPlanAction,
  updateRevisionSlotAction,
} from '../actions'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button-variants'
import { useToast } from '@/components/ui/toast'
import { toDateInput } from '@/lib/dates'

type SectionOption = { id: string; name: string }
type SubjectOption = { id: string; name: string }
type ClassOption = {
  id: string
  name: string
  sections: SectionOption[]
  subjects: SubjectOption[]
}
type StaffOption = { id: string; name: string }

export type RevisionSlotDraft = {
  id: string
  date: string
  startTime: string | null
  endTime: string | null
  periodLabel: string | null
  classLevelId: string
  sectionId: string | null
  subjectId: string
  topic: string
  teacherStaffId: string | null
  room: string | null
  notes: string | null
}

function SlotFields({
  idPrefix,
  classes,
  staff,
  defaultClassId,
  planStarts,
  planEnds,
  draft,
}: {
  idPrefix: string
  classes: ClassOption[]
  staff: StaffOption[]
  defaultClassId: string
  planStarts: string
  planEnds: string
  draft?: Partial<RevisionSlotDraft>
}) {
  const [classId, setClassId] = React.useState(draft?.classLevelId ?? defaultClassId)
  const selected = classes.find((c) => c.id === classId) ?? classes[0]

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Date" htmlFor={`${idPrefix}-date`} required className="sm:col-span-2">
        <Input
          id={`${idPrefix}-date`}
          name="date"
          type="date"
          required
          min={planStarts}
          max={planEnds}
          defaultValue={draft?.date ?? planStarts}
        />
      </Field>

      <Field label="Class" htmlFor={`${idPrefix}-class`} required>
        <Select
          id={`${idPrefix}-class`}
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          name="classLevelId"
          required
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Section" htmlFor={`${idPrefix}-section`} hint="Optional">
        <Select id={`${idPrefix}-section`} name="sectionId" defaultValue={draft?.sectionId ?? ''}>
          <option value="">All sections</option>
          {(selected?.sections ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Subject" htmlFor={`${idPrefix}-subject`} required className="sm:col-span-2">
        <Select id={`${idPrefix}-subject`} name="subjectId" required defaultValue={draft?.subjectId ?? ''}>
          <option value="" disabled>
            Select subject
          </option>
          {(selected?.subjects ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Topic" htmlFor={`${idPrefix}-topic`} required className="sm:col-span-2">
        <Input id={`${idPrefix}-topic`} name="topic" required maxLength={500} defaultValue={draft?.topic ?? ''} placeholder="Chapter or skills to revise" />
      </Field>

      <Field label="Start time" htmlFor={`${idPrefix}-start`} hint="HH:MM, optional">
        <Input id={`${idPrefix}-start`} name="startTime" type="time" defaultValue={draft?.startTime ?? ''} />
      </Field>
      <Field label="End time" htmlFor={`${idPrefix}-end`} hint="HH:MM, optional">
        <Input id={`${idPrefix}-end`} name="endTime" type="time" defaultValue={draft?.endTime ?? ''} />
      </Field>

      <Field label="Period label" htmlFor={`${idPrefix}-period`} hint='e.g. "Period 3"' className="sm:col-span-2">
        <Input id={`${idPrefix}-period`} name="periodLabel" defaultValue={draft?.periodLabel ?? ''} placeholder="Optional" />
      </Field>

      <Field label="Teacher" htmlFor={`${idPrefix}-teacher`} hint="Optional">
        <Select id={`${idPrefix}-teacher`} name="teacherStaffId" defaultValue={draft?.teacherStaffId ?? ''}>
          <option value="">Not specified</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Room" htmlFor={`${idPrefix}-room`}>
        <Input id={`${idPrefix}-room`} name="room" defaultValue={draft?.room ?? ''} placeholder="Optional" />
      </Field>

      <Field label="Notes" htmlFor={`${idPrefix}-notes`} className="sm:col-span-2">
        <Textarea id={`${idPrefix}-notes`} name="notes" rows={2} defaultValue={draft?.notes ?? ''} />
      </Field>
    </div>
  )
}

function readSlotForm(form: HTMLFormElement): Record<string, string> {
  const fd = new FormData(form)
  const out: Record<string, string> = {}
  for (const [k, v] of fd.entries()) {
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    if (!trimmed) continue
    if (k === 'startTime' || k === 'endTime') {
      out[k] = trimmed.slice(0, 5)
      continue
    }
    out[k] = trimmed
  }
  return out
}

export function AddRevisionSlotButton({
  planId,
  classes,
  staff,
  defaultClassId,
  planStarts,
  planEnds,
}: {
  planId: string
  classes: ClassOption[]
  staff: StaffOption[]
  defaultClassId: string
  planStarts: string
  planEnds: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const formRef = React.useRef<HTMLFormElement>(null)

  if (classes.length === 0) return null

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Add slot
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add revision slot"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={() => {
                const form = formRef.current
                if (!form) return
                const payload = readSlotForm(form)
                startTransition(async () => {
                  const r = await addRevisionSlotAction(planId, payload)
                  toast.push({
                    tone: r.ok ? 'success' : 'error',
                    title: r.ok ? 'Added' : 'Could not add',
                    description: r.message,
                  })
                  if (r.ok) setOpen(false)
                })
              }}
            >
              Save slot
            </Button>
          </div>
        }
      >
        <form ref={formRef}>
          <SlotFields
            idPrefix="add"
            classes={classes}
            staff={staff}
            defaultClassId={defaultClassId}
            planStarts={planStarts}
            planEnds={planEnds}
          />
        </form>
      </Dialog>
    </>
  )
}

export function EditRevisionSlotButton({
  planId,
  slot,
  classes,
  staff,
  defaultClassId,
  planStarts,
  planEnds,
}: {
  planId: string
  slot: RevisionSlotDraft
  classes: ClassOption[]
  staff: StaffOption[]
  defaultClassId: string
  planStarts: string
  planEnds: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const formRef = React.useRef<HTMLFormElement>(null)

  return (
    <>
      <IconButton label="Edit slot" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" aria-hidden />
      </IconButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Edit revision slot"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={() => {
                const form = formRef.current
                if (!form) return
                const payload = readSlotForm(form)
                startTransition(async () => {
                  const r = await updateRevisionSlotAction(slot.id, planId, payload)
                  toast.push({
                    tone: r.ok ? 'success' : 'error',
                    title: r.ok ? 'Saved' : 'Could not save',
                    description: r.message,
                  })
                  if (r.ok) setOpen(false)
                })
              }}
            >
              Save changes
            </Button>
          </div>
        }
      >
        <form ref={formRef}>
          <SlotFields
            idPrefix={`edit-${slot.id}`}
            classes={classes}
            staff={staff}
            defaultClassId={defaultClassId}
            planStarts={planStarts}
            planEnds={planEnds}
            draft={slot}
          />
        </form>
      </Dialog>
    </>
  )
}

export function DeleteRevisionSlotButton({ planId, slotId }: { planId: string; slotId: string }) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  return (
    <IconButton
      label="Remove slot"
      className="text-[var(--danger)]"
      disabled={pending}
      onClick={() => {
        if (!window.confirm('Remove this revision slot?')) return
        startTransition(async () => {
          const r = await deleteRevisionSlotAction(slotId, planId)
          toast.push({
            tone: r.ok ? 'success' : 'error',
            title: r.ok ? 'Removed' : 'Could not remove',
            description: r.message,
          })
        })
      }}
    >
      <Trash2 className="size-3.5" aria-hidden />
    </IconButton>
  )
}

export function RevisionPublishToggle({ id, isPublished }: { id: string; isPublished: boolean }) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const r = isPublished ? await unpublishRevisionPlanAction(id) : await publishRevisionPlanAction(id)
          toast.push({
            tone: r.ok ? 'success' : 'error',
            title: r.ok ? 'Updated' : 'Could not update',
            description: r.message,
          })
        })
      }
    >
      {isPublished ? (
        <>
          <EyeOff className="size-4" aria-hidden />
          Unpublish
        </>
      ) : (
        <>
          <Eye className="size-4" aria-hidden />
          Publish
        </>
      )}
    </Button>
  )
}

export function DeleteRevisionPlanButton({ id, name }: { id: string; name: string }) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      className="text-[var(--danger)]"
      onClick={() => {
        if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
        startTransition(async () => {
          try {
            await deleteRevisionPlanAction(id)
          } catch {
            toast.push({ tone: 'error', title: 'Could not delete', description: 'Try again or unpublish first.' })
          }
        })
      }}
    >
      <Trash2 className="size-4" aria-hidden />
      Delete
    </Button>
  )
}

export function EditPlanLink({ id }: { id: string }) {
  return (
    <Link href={`/academics/revision/${id}/edit`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
      Edit plan
    </Link>
  )
}