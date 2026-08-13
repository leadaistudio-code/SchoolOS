'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { createClassAction, createSectionAction } from './actions'

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
