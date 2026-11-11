'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ban, CalendarPlus, Film, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import type { LmsResult } from '@/components/lms/types'
import {
  archiveBatchAction,
  createBatchAction,
  deleteLiveClassAction,
  scheduleClassesAction,
  setCancelledAction,
  setRecordingAction,
  updateBatchAction,
  updateLiveClassAction,
} from './actions'

type ClassOption = { id: string; name: string; sections: { id: string; name: string }[] }
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

export type BatchValues = {
  id?: string
  title: string
  description: string
  courseId: string
  classLevelId: string
  sectionId: string
  instructorName: string
  meetingUrl: string
}

export function BatchButton({
  batch,
  classes,
  courses,
}: {
  batch?: BatchValues
  classes: ClassOption[]
  courses: CourseOption[]
}) {
  const { pending, run, router } = useRunner()
  const [open, setOpen] = React.useState(false)
  const blank: BatchValues = { title: '', description: '', courseId: '', classLevelId: '', sectionId: '', instructorName: '', meetingUrl: '' }
  const [form, setForm] = React.useState<BatchValues>(batch ?? blank)
  const set = (key: keyof BatchValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value, ...(key === 'classLevelId' ? { sectionId: '' } : {}) }))
  const sections = classes.find((c) => c.id === form.classLevelId)?.sections ?? []

  function save() {
    run(
      () => (batch?.id ? updateBatchAction(batch.id, form) : createBatchAction(form)),
      (r) => {
        setOpen(false)
        if (!batch?.id && r.ok && r.id) router.push(`/lms/live/${r.id}`)
      },
    )
  }

  return (
    <>
      {batch?.id ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Pencil /> Edit batch
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus /> New batch
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={batch?.id ? 'Edit batch' : 'New live batch'}
        description="A batch is a group taught live, e.g. “Class 7 Robotics – Saturday”."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={pending} onClick={save}>Save</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Batch name" required htmlFor="b-title" className="sm:col-span-2">
            <Input id="b-title" value={form.title} onChange={set('title')} placeholder="Class 7 Robotics – Saturday" />
          </Field>
          <Field label="Students" htmlFor="b-class">
            <Select id="b-class" value={form.classLevelId} onChange={set('classLevelId')}>
              <option value="">Whole school</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Section" htmlFor="b-section">
            <Select id="b-section" value={form.sectionId} onChange={set('sectionId')} disabled={!form.classLevelId}>
              <option value="">All sections</option>
              {sections.map((s) => <option key={s.id} value={s.id}>Section {s.name}</option>)}
            </Select>
          </Field>
          <Field label="Linked course" htmlFor="b-course" hint="Optional. Students see it next to the class.">
            <Select id="b-course" value={form.courseId} onChange={set('courseId')}>
              <option value="">None</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Field>
          <Field label="Instructor" htmlFor="b-inst">
            <Input id="b-inst" value={form.instructorName} onChange={set('instructorName')} placeholder="Ms. Kavita Joshi" />
          </Field>
          <Field
            label="Meeting link"
            htmlFor="b-link"
            hint="A recurring Zoom or Google Meet link. Each class uses it unless you set another."
            className="sm:col-span-2"
          >
            <Input id="b-link" value={form.meetingUrl} onChange={set('meetingUrl')} placeholder="https://meet.google.com/abc-defg-hij" />
          </Field>
          <Field label="About this batch" htmlFor="b-desc" className="sm:col-span-2">
            <Textarea id="b-desc" rows={3} value={form.description} onChange={set('description')} />
          </Field>
        </div>
      </Dialog>
    </>
  )
}

export function ArchiveBatchButton({ id }: { id: string }) {
  const { pending, run, router } = useRunner()
  return (
    <Button
      variant="ghost"
      className="text-[var(--danger)]"
      loading={pending}
      onClick={() => {
        if (window.confirm('Archive this batch? Its classes disappear from students’ lists.')) {
          run(() => archiveBatchAction(id), () => router.push('/lms/live'))
        }
      }}
    >
      <Trash2 /> Archive batch
    </Button>
  )
}

export type ClassValues = {
  id?: string
  title: string
  agenda: string
  date: string
  time: string
  durationMinutes: string
  meetingUrl: string
}

export function ScheduleButton({
  batchId,
  liveClass,
  defaults,
  trigger = 'button',
}: {
  batchId: string
  liveClass?: ClassValues
  defaults?: Partial<ClassValues>
  trigger?: 'button' | 'icon'
}) {
  const { pending, run } = useRunner()
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<ClassValues & { repeatWeeks: string }>({
    title: '',
    agenda: '',
    date: '',
    time: '16:00',
    durationMinutes: '60',
    meetingUrl: '',
    ...defaults,
    ...liveClass,
    repeatWeeks: '0',
  })
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  function save() {
    run(
      () => (liveClass?.id ? updateLiveClassAction(liveClass.id, form) : scheduleClassesAction(batchId, form)),
      () => setOpen(false),
    )
  }

  return (
    <>
      {trigger === 'icon' ? (
        <IconButton small label="Edit class" onClick={() => setOpen(true)}>
          <Pencil />
        </IconButton>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <CalendarPlus /> Schedule class
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={liveClass?.id ? 'Edit class' : 'Schedule a live class'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={pending} onClick={save}>Save</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Title" required htmlFor="c-title" className="sm:col-span-3">
            <Input id="c-title" value={form.title} onChange={set('title')} placeholder="Motors and motor drivers" />
          </Field>
          <Field label="Date" required htmlFor="c-date">
            <Input id="c-date" type="date" value={form.date} onChange={set('date')} />
          </Field>
          <Field label="Starts at (IST)" required htmlFor="c-time">
            <Input id="c-time" type="time" value={form.time} onChange={set('time')} />
          </Field>
          <Field label="Minutes" htmlFor="c-min">
            <Input id="c-min" type="number" min={10} max={480} value={form.durationMinutes} onChange={set('durationMinutes')} />
          </Field>
          {!liveClass?.id ? (
            <Field label="Repeat" htmlFor="c-repeat" hint="Same day and time each week" className="sm:col-span-3">
              <Select id="c-repeat" value={form.repeatWeeks} onChange={set('repeatWeeks')} className="max-w-64">
                <option value="0">Just this once</option>
                {[3, 5, 7, 11, 15, 23].map((n) => (
                  <option key={n} value={n}>Weekly, {n + 1} classes</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Meeting link for this class" htmlFor="c-link" hint="Leave blank to use the batch’s link" className="sm:col-span-3">
            <Input id="c-link" value={form.meetingUrl} onChange={set('meetingUrl')} placeholder="https://zoom.us/j/…" />
          </Field>
          <Field label="What you will cover" htmlFor="c-agenda" className="sm:col-span-3">
            <Textarea id="c-agenda" rows={3} value={form.agenda} onChange={set('agenda')} placeholder="Bring your kit: Arduino, L298N driver, two motors." />
          </Field>
        </div>
      </Dialog>
    </>
  )
}

export function ClassActions({
  id,
  cancelled,
  recordingUrl,
}: {
  id: string
  cancelled: boolean
  recordingUrl: string | null
}) {
  const { pending, run } = useRunner()
  const [menu, setMenu] = React.useState(false)
  const [recording, setRecording] = React.useState<string | null>(null)

  return (
    <div className="relative inline-flex items-center gap-0.5">
      <IconButton small label={recordingUrl ? 'Change recording' : 'Add recording'} onClick={() => setRecording(recordingUrl ?? '')}>
        <Film />
      </IconButton>
      <IconButton small label="More" onClick={() => setMenu((m) => !m)}>
        <MoreHorizontal />
      </IconButton>
      {menu ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-44 rounded-[var(--radius)] border border-line bg-surface p-1 shadow-lg"
          onMouseLeave={() => setMenu(false)}
        >
          <button
            type="button"
            disabled={pending}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2"
            onClick={() => {
              setMenu(false)
              run(() => setCancelledAction(id, !cancelled))
            }}
          >
            {cancelled ? <RotateCcw className="size-4" /> : <Ban className="size-4" />}
            {cancelled ? 'Put back on' : 'Cancel class'}
          </button>
          <button
            type="button"
            disabled={pending}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-[var(--danger)] hover:bg-surface-2"
            onClick={() => {
              setMenu(false)
              if (window.confirm('Delete this class and its join record?')) run(() => deleteLiveClassAction(id))
            }}
          >
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      ) : null}
      <Dialog
        open={recording !== null}
        onClose={() => setRecording(null)}
        title="Class recording"
        description="Upload the recording to YouTube (unlisted), Vimeo or Google Drive and paste the link. Students can watch it from their Live classes page."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecording(null)}>Cancel</Button>
            <Button loading={pending} onClick={() => run(() => setRecordingAction(id, recording ?? ''), () => setRecording(null))}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Recording link" htmlFor="rec-url" hint="Clear it to remove the recording">
          <Input id="rec-url" value={recording ?? ''} onChange={(e) => setRecording(e.target.value)} placeholder="https://youtu.be/…" />
        </Field>
      </Dialog>
    </div>
  )
}
