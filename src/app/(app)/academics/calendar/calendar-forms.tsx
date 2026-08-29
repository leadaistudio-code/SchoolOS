'use client'

import * as React from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  createCalendarEventAction,
  deleteCalendarEventAction,
  updateCalendarEventAction,
} from './actions'

const KINDS = [
  { value: 'HOLIDAY', label: 'Holiday' },
  { value: 'EXAM', label: 'Exam' },
  { value: 'PTM', label: 'Parent–teacher meeting' },
  { value: 'EVENT', label: 'Event' },
  { value: 'ACTIVITY', label: 'Activity' },
  { value: 'FUNCTION', label: 'Function' },
  { value: 'OTHER', label: 'Other' },
] as const

export type CalendarEventDraft = {
  id: string
  title: string
  description: string | null
  kind: string
  startsAt: string
  endsAt: string
  allDay: boolean
  location: string | null
}

function EventFields({
  idPrefix,
  title,
  setTitle,
  kind,
  setKind,
  startsAt,
  setStartsAt,
  endsAt,
  setEndsAt,
  allDay,
  setAllDay,
  location,
  setLocation,
  description,
  setDescription,
}: {
  idPrefix: string
  title: string
  setTitle: (v: string) => void
  kind: string
  setKind: (v: string) => void
  startsAt: string
  setStartsAt: (v: string) => void
  endsAt: string
  setEndsAt: (v: string) => void
  allDay: boolean
  setAllDay: (v: boolean) => void
  location: string
  setLocation: (v: string) => void
  description: string
  setDescription: (v: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Title" htmlFor={`${idPrefix}-title`} required className="sm:col-span-2">
        <Input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Republic Day"
          autoFocus
        />
      </Field>

      <Field label="Type" htmlFor={`${idPrefix}-kind`} required>
        <Select id={`${idPrefix}-kind`} value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Location" htmlFor={`${idPrefix}-location`}>
        <Input
          id={`${idPrefix}-location`}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Optional"
        />
      </Field>

      <Field label="Starts" htmlFor={`${idPrefix}-starts`} required>
        <Input
          id={`${idPrefix}-starts`}
          type="date"
          value={startsAt}
          onChange={(e) => {
            setStartsAt(e.target.value)
            if (!endsAt || endsAt < e.target.value) setEndsAt(e.target.value)
          }}
        />
      </Field>

      <Field label="Ends" htmlFor={`${idPrefix}-ends`} hint="Same day for a single-day holiday">
        <Input
          id={`${idPrefix}-ends`}
          type="date"
          value={endsAt}
          min={startsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
      </Field>

      <label className="flex items-center gap-2 sm:col-span-2">
        <Checkbox checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        <span className="text-sm text-ink">All-day (typical for holidays)</span>
      </label>

      <Field label="Notes" htmlFor={`${idPrefix}-notes`} className="sm:col-span-2">
        <Textarea
          id={`${idPrefix}-notes`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Optional"
        />
      </Field>
    </div>
  )
}

export function NewCalendarEventButton({
  defaultDate,
  defaultKind = 'HOLIDAY',
  label = 'Add holiday / event',
}: {
  defaultDate?: string
  defaultKind?: string
  label?: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const today = defaultDate ?? new Date().toISOString().slice(0, 10)
  const [title, setTitle] = React.useState('')
  const [kind, setKind] = React.useState(defaultKind)
  const [startsAt, setStartsAt] = React.useState(today)
  const [endsAt, setEndsAt] = React.useState(today)
  const [allDay, setAllDay] = React.useState(true)
  const [location, setLocation] = React.useState('')
  const [description, setDescription] = React.useState('')

  const openDialog = () => {
    const d = defaultDate ?? new Date().toISOString().slice(0, 10)
    setTitle('')
    setKind(defaultKind)
    setStartsAt(d)
    setEndsAt(d)
    setAllDay(true)
    setLocation('')
    setDescription('')
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await createCalendarEventAction({
        title: title.trim(),
        kind,
        startsAt,
        endsAt: endsAt || startsAt,
        allDay,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not add event', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Calendar updated', description: result.message })
      setOpen(false)
    })

  return (
    <>
      <Button size="sm" onClick={openDialog}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add to calendar"
        description="Holidays, exams, PTMs and school events. Holidays appear on every day they cover."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={title.trim().length < 3 || !startsAt}>
              Add to calendar
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <EventFields
          idPrefix="new-cal"
          title={title}
          setTitle={setTitle}
          kind={kind}
          setKind={setKind}
          startsAt={startsAt}
          setStartsAt={setStartsAt}
          endsAt={endsAt}
          setEndsAt={setEndsAt}
          allDay={allDay}
          setAllDay={setAllDay}
          location={location}
          setLocation={setLocation}
          description={description}
          setDescription={setDescription}
        />
      </Dialog>
    </>
  )
}

export function EditCalendarEventButton({ event }: { event: CalendarEventDraft }) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [title, setTitle] = React.useState(event.title)
  const [kind, setKind] = React.useState(event.kind)
  const [startsAt, setStartsAt] = React.useState(event.startsAt)
  const [endsAt, setEndsAt] = React.useState(event.endsAt)
  const [allDay, setAllDay] = React.useState(event.allDay)
  const [location, setLocation] = React.useState(event.location ?? '')
  const [description, setDescription] = React.useState(event.description ?? '')
  const [confirmRemove, setConfirmRemove] = React.useState(false)

  const openDialog = () => {
    setTitle(event.title)
    setKind(event.kind)
    setStartsAt(event.startsAt)
    setEndsAt(event.endsAt)
    setAllDay(event.allDay)
    setLocation(event.location ?? '')
    setDescription(event.description ?? '')
    setConfirmRemove(false)
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await updateCalendarEventAction({
        id: event.id,
        title: title.trim(),
        kind,
        startsAt,
        endsAt: endsAt || startsAt,
        allDay,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not update event', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Calendar updated', description: result.message })
      setOpen(false)
    })

  const remove = () =>
    startTransition(async () => {
      const result = await deleteCalendarEventAction(event.id)
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not remove event', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Event removed', description: result.message })
      setOpen(false)
    })

  return (
    <>
      <IconButton label={`Edit ${event.title}`} onClick={openDialog}>
        <Pencil className="size-3.5" aria-hidden />
      </IconButton>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${event.title}`}
        description="Change the dates, type or details of this calendar entry."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={title.trim().length < 3 || !startsAt}>
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <EventFields
          idPrefix={`edit-cal-${event.id}`}
          title={title}
          setTitle={setTitle}
          kind={kind}
          setKind={setKind}
          startsAt={startsAt}
          setStartsAt={setStartsAt}
          endsAt={endsAt}
          setEndsAt={setEndsAt}
          allDay={allDay}
          setAllDay={setAllDay}
          location={location}
          setLocation={setLocation}
          description={description}
          setDescription={setDescription}
        />

        <div className="mt-4 border-t border-line pt-3">
          {confirmRemove ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-ink-muted">Remove this from the calendar?</p>
              <Button size="sm" variant="danger" loading={pending} onClick={remove}>
                Remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
              <Trash2 aria-hidden /> Remove event
            </Button>
          )}
        </div>
      </Dialog>
    </>
  )
}

/** Clickable day cell action — opens add dialog prefilled for that date. */
export function AddOnDateButton({ date }: { date: string }) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [title, setTitle] = React.useState('')
  const [kind, setKind] = React.useState('HOLIDAY')
  const [startsAt, setStartsAt] = React.useState(date)
  const [endsAt, setEndsAt] = React.useState(date)
  const [allDay, setAllDay] = React.useState(true)
  const [location, setLocation] = React.useState('')
  const [description, setDescription] = React.useState('')

  const openDialog = () => {
    setTitle('')
    setKind('HOLIDAY')
    setStartsAt(date)
    setEndsAt(date)
    setAllDay(true)
    setLocation('')
    setDescription('')
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await createCalendarEventAction({
        title: title.trim(),
        kind,
        startsAt,
        endsAt: endsAt || startsAt,
        allDay,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not add event', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Calendar updated', description: result.message })
      setOpen(false)
    })

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="mt-0.5 text-xs font-medium text-[var(--product-600)] hover:underline"
      >
        + Add
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add holiday / event"
        description={`Place an entry on ${date}.`}
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={title.trim().length < 3 || !startsAt}>
              Add to calendar
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <EventFields
          idPrefix={`day-${date}`}
          title={title}
          setTitle={setTitle}
          kind={kind}
          setKind={setKind}
          startsAt={startsAt}
          setStartsAt={setStartsAt}
          endsAt={endsAt}
          setEndsAt={setEndsAt}
          allDay={allDay}
          setAllDay={setAllDay}
          location={location}
          setLocation={setLocation}
          description={description}
          setDescription={setDescription}
        />
      </Dialog>
    </>
  )
}
