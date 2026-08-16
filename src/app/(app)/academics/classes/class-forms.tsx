'use client'

import * as React from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  archiveClassAction,
  archiveSectionAction,
  createClassAction,
  createSectionAction,
  updateClassAction,
  updateSectionAction,
} from './actions'

export type TeacherOption = {
  id: string
  firstName: string
  lastName: string
  employeeCode: string
}

/**
 * Creating a class.
 *
 * `numeric` is the rung the class occupies on the ladder — it drives the order
 * every other screen lists classes in — so the form proposes the next free
 * rung rather than asking an admin to work out what the field means.
 */
export function NewClassButton({
  nextNumeric,
  variant = 'primary',
  label = 'New class',
}: {
  nextNumeric: number
  variant?: 'primary' | 'secondary'
  label?: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState('')
  const [numeric, setNumeric] = React.useState(String(nextNumeric))
  const [stream, setStream] = React.useState('')

  // The proposal only holds until the dialog is opened; reopening after a
  // successful create has to offer the rung above the one just taken.
  const openDialog = () => {
    setNumeric(String(nextNumeric))
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await createClassAction({
        name: name.trim(),
        numeric,
        stream: stream.trim() || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not create class', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Class created', description: result.message })
      setOpen(false)
      setName('')
      setStream('')
    })

  return (
    <>
      <Button size="sm" variant={variant} onClick={openDialog}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New class"
        description="Classes belong to the current academic session. Sections are added to the class once it exists."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!name.trim()}>
              Create class
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Class name"
            htmlFor="class-name"
            required
            hint="What the school calls it — Class 6, Grade IV, Nursery"
            className="sm:col-span-2"
          >
            <Input
              id="class-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Class 6"
              autoFocus
            />
          </Field>

          <Field
            label="Position"
            htmlFor="class-numeric"
            required
            hint="Orders classes across the product. Nursery 0, Class 1 is 1."
          >
            <Input
              id="class-numeric"
              type="number"
              min="0"
              max="20"
              value={numeric}
              onChange={(e) => setNumeric(e.target.value)}
            />
          </Field>

          <Field label="Stream" htmlFor="class-stream" hint="Only for senior classes — Science, Commerce">
            <Input
              id="class-stream"
              value={stream}
              onChange={(e) => setStream(e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>
      </Dialog>
    </>
  )
}

/**
 * Adding a section to a class that already exists.
 *
 * Capacity is required rather than optional because it is what the occupancy
 * bars on this page measure against — a section with no stated capacity would
 * be the one row nobody can read.
 */
export function AddSectionButton({
  classLevelId,
  classLabel,
  teachers,
  suggestedName,
}: {
  classLevelId: string
  classLabel: string
  teachers: TeacherOption[]
  /** Next letter in the sequence, so B follows A without being typed. */
  suggestedName: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState(suggestedName)
  const [capacity, setCapacity] = React.useState('40')
  const [roomName, setRoomName] = React.useState('')
  const [classTeacherId, setClassTeacherId] = React.useState('')

  const openDialog = () => {
    setName(suggestedName)
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await createSectionAction({
        classLevelId,
        name: name.trim(),
        capacity,
        roomName: roomName.trim() || undefined,
        classTeacherId: classTeacherId || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not add section', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Section added', description: result.message })
      setOpen(false)
      setRoomName('')
      setClassTeacherId('')
    })

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={openDialog}
        aria-label={`Add a section to ${classLabel}`}
      >
        <Plus aria-hidden /> Add section
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Add a section to ${classLabel}`}
        description="A section is a room of students. Attendance, the timetable and the class teacher all hang off it."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!name.trim() || !capacity}>
              Add section
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Section name" htmlFor="section-name" required hint="Usually a single letter">
            <Input
              id="section-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="A"
              autoFocus
            />
          </Field>

          <Field
            label="Capacity"
            htmlFor="section-capacity"
            required
            hint="Seats in the room. Drives the occupancy bars."
          >
            <Input
              id="section-capacity"
              type="number"
              min="1"
              max="200"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Field>

          <Field label="Room" htmlFor="section-room" hint="Optional">
            <Input
              id="section-room"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Room 12"
            />
          </Field>

          <Field
            label="Class teacher"
            htmlFor="section-teacher"
            hint={teachers.length === 0 ? 'No teaching staff on record yet' : 'Can be set later'}
          >
            <Select
              id="section-teacher"
              value={classTeacherId}
              disabled={teachers.length === 0}
              onChange={(e) => setClassTeacherId(e.target.value)}
            >
              <option value="">Not assigned</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.firstName} {teacher.lastName} — {teacher.employeeCode}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Dialog>
    </>
  )
}

/**
 * The removal half of both edit dialogs.
 *
 * Deliberately a two-step inside the dialog rather than a button on the card:
 * removal is rare, and on a dense grid it would sit one slip away from the edit
 * control it shares a row with. The service refuses while students are still
 * enrolled, so the confirmation states the rule rather than promising an
 * outcome it cannot guarantee.
 */
function RemoveBlock({
  noun,
  pending,
  onRemove,
}: {
  noun: string
  pending: boolean
  onRemove: () => void
}) {
  const [confirming, setConfirming] = React.useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--danger)] hover:underline"
      >
        <Trash2 className="size-3.5" aria-hidden />
        Remove this {noun}
      </button>
    )
  }

  return (
    <div className="rounded-[var(--radius-sm)] bg-danger-bg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] px-3 py-2.5 space-y-2">
      <p className="text-xs text-ink">
        This {noun} stops being offered anywhere in the app. Past attendance, receipts and results
        keep their records. It cannot be removed while students are still enrolled.
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="danger" loading={pending} onClick={onRemove}>
          Yes, remove it
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Keep it
        </Button>
      </div>
    </div>
  )
}

/** Renaming a class, moving it on the ladder, or removing it. */
export function EditClassButton({
  id,
  name: initialName,
  numeric: initialNumeric,
  stream: initialStream,
}: {
  id: string
  name: string
  numeric: number
  stream: string | null
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState(initialName)
  const [numeric, setNumeric] = React.useState(String(initialNumeric))
  const [stream, setStream] = React.useState(initialStream ?? '')

  // Reopening after a cancel must show what is stored, not what was abandoned.
  const openDialog = () => {
    setName(initialName)
    setNumeric(String(initialNumeric))
    setStream(initialStream ?? '')
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await updateClassAction({
        id,
        name: name.trim(),
        numeric,
        stream: stream.trim(),
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not save class', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Class saved', description: result.message })
      setOpen(false)
    })

  const remove = () =>
    startTransition(async () => {
      const result = await archiveClassAction(id)
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not remove class', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Class removed', description: result.message })
      setOpen(false)
    })

  return (
    <>
      <IconButton variant="ghost" small label={`Edit ${initialName}`} onClick={openDialog}>
        <Pencil aria-hidden />
      </IconButton>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${initialName}`}
        description="Renaming is safe at any time — attendance, timetables and fees follow the class rather than its name."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!name.trim()}>
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Class name" htmlFor="edit-class-name" required className="sm:col-span-2">
            <Input
              id="edit-class-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>

          <Field
            label="Position"
            htmlFor="edit-class-numeric"
            required
            hint="Orders classes across the product."
          >
            <Input
              id="edit-class-numeric"
              type="number"
              min="0"
              max="20"
              value={numeric}
              onChange={(e) => setNumeric(e.target.value)}
            />
          </Field>

          <Field
            label="Stream"
            htmlFor="edit-class-stream"
            hint="Science, Commerce — senior classes only"
          >
            <Input
              id="edit-class-stream"
              value={stream}
              onChange={(e) => setStream(e.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>

        <div className="mt-4 pt-3 border-t border-line">
          <RemoveBlock noun="class" pending={pending} onRemove={remove} />
        </div>
      </Dialog>
    </>
  )
}

/** Renaming a section, changing its capacity, room or class teacher. */
export function EditSectionButton({
  id,
  classLabel,
  name: initialName,
  capacity: initialCapacity,
  roomName: initialRoom,
  classTeacherId: initialTeacher,
  enrolled,
  teachers,
}: {
  id: string
  classLabel: string
  name: string
  capacity: number
  roomName: string | null
  classTeacherId: string | null
  enrolled: number
  teachers: TeacherOption[]
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState(initialName)
  const [capacity, setCapacity] = React.useState(String(initialCapacity))
  const [roomName, setRoomName] = React.useState(initialRoom ?? '')
  const [classTeacherId, setClassTeacherId] = React.useState(initialTeacher ?? '')

  const openDialog = () => {
    setName(initialName)
    setCapacity(String(initialCapacity))
    setRoomName(initialRoom ?? '')
    setClassTeacherId(initialTeacher ?? '')
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await updateSectionAction({
        id,
        name: name.trim(),
        capacity,
        roomName: roomName.trim(),
        classTeacherId,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not save section', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Section saved', description: result.message })
      setOpen(false)
    })

  const remove = () =>
    startTransition(async () => {
      const result = await archiveSectionAction(id)
      if (!result.ok) {
        toast.push({
          tone: 'error',
          title: 'Could not remove section',
          description: result.message,
        })
        return
      }
      toast.push({ tone: 'success', title: 'Section removed', description: result.message })
      setOpen(false)
    })

  return (
    <>
      <IconButton
        variant="ghost"
        small
        label={`Edit ${classLabel} section ${initialName}`}
        onClick={openDialog}
      >
        <Pencil aria-hidden />
      </IconButton>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${classLabel} — section ${initialName}`}
        description={
          enrolled > 0
            ? `${enrolled} student${enrolled === 1 ? '' : 's'} currently enrolled. Capacity cannot go below that.`
            : 'No students enrolled in this section yet.'
        }
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!name.trim() || !capacity}>
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Section name" htmlFor="edit-section-name" required>
            <Input
              id="edit-section-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>

          <Field
            label="Capacity"
            htmlFor="edit-section-capacity"
            required
            hint={enrolled > 0 ? `At least ${enrolled}` : 'Seats in the room'}
          >
            <Input
              id="edit-section-capacity"
              type="number"
              min={Math.max(1, enrolled)}
              max="200"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Field>

          <Field label="Room" htmlFor="edit-section-room" hint="Optional">
            <Input
              id="edit-section-room"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Room 12"
            />
          </Field>

          <Field
            label="Class teacher"
            htmlFor="edit-section-teacher"
            hint={teachers.length === 0 ? 'No teaching staff on record yet' : undefined}
          >
            <Select
              id="edit-section-teacher"
              value={classTeacherId}
              disabled={teachers.length === 0}
              onChange={(e) => setClassTeacherId(e.target.value)}
            >
              <option value="">Not assigned</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.firstName} {teacher.lastName} — {teacher.employeeCode}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4 pt-3 border-t border-line">
          <RemoveBlock noun="section" pending={pending} onRemove={remove} />
        </div>
      </Dialog>
    </>
  )
}
