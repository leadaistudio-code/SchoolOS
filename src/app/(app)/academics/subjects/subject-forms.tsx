'use client'

import * as React from 'react'
import { Link2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { assignSubjectAction, createSubjectAction } from './actions'

export type Option = { id: string; label: string }

/**
 * Creating a subject.
 *
 * The code is upper-cased by the service, so the field does it on the way in
 * too — a form that silently changes what was typed after submission reads as
 * a bug even when it is correct.
 */
export function NewSubjectButton({ label = 'New subject' }: { label?: string }) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [isElective, setIsElective] = React.useState(false)

  const submit = () =>
    startTransition(async () => {
      const result = await createSubjectAction({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        isElective,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not create subject', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Subject created', description: result.message })
      setOpen(false)
      setCode('')
      setName('')
      setIsElective(false)
    })

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New subject"
        description="A subject exists once for the whole school. Attach it to each class that studies it."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!code.trim() || !name.trim()}>
              Create subject
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <Field label="Code" htmlFor="subject-code" required hint="Letters and numbers">
            <Input
              id="subject-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="MATH"
              autoFocus
            />
          </Field>

          <Field label="Subject name" htmlFor="subject-name" required>
            <Input
              id="subject-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mathematics"
            />
          </Field>

          <label className="flex items-center gap-2 sm:col-span-2">
            <Checkbox checked={isElective} onChange={(e) => setIsElective(e.target.checked)} />
            <span className="text-sm text-ink">
              Elective — students choose it rather than all taking it
            </span>
          </label>
        </div>
      </Dialog>
    </>
  )
}

/**
 * Attaching a subject to a class.
 *
 * Presented as its own action rather than folded into subject creation,
 * because the two happen at different times: subjects are set up once, and
 * assignments change every session as the timetable is rebuilt.
 */
export function AssignSubjectButton({
  classes,
  subjects,
  teachers,
  variant = 'secondary',
  label = 'Assign to class',
}: {
  classes: Option[]
  subjects: Option[]
  teachers: Option[]
  variant?: 'primary' | 'secondary'
  label?: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [classLevelId, setClassLevelId] = React.useState('')
  const [subjectId, setSubjectId] = React.useState('')
  const [teacherId, setTeacherId] = React.useState('')

  const blocked = classes.length === 0 || subjects.length === 0

  const submit = () =>
    startTransition(async () => {
      const result = await assignSubjectAction({
        classLevelId,
        subjectId,
        teacherId: teacherId || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not assign subject', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Subject assigned', description: result.message })
      setOpen(false)
      setSubjectId('')
      setTeacherId('')
    })

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        onClick={() => setOpen(true)}
        disabled={blocked}
        title={
          blocked ? 'Create at least one class and one subject first' : 'Attach a subject to a class'
        }
      >
        <Link2 aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Assign a subject to a class"
        description="This is what a syllabus, a timetable slot, a lesson log and a homework task all attach to."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!classLevelId || !subjectId}>
              Assign subject
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Class" htmlFor="assign-class" required>
            <Select
              id="assign-class"
              value={classLevelId}
              onChange={(e) => setClassLevelId(e.target.value)}
            >
              <option value="">Choose a class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Subject" htmlFor="assign-subject" required>
            <Select
              id="assign-subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">Choose a subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Teacher"
            htmlFor="assign-teacher"
            className="sm:col-span-2"
            hint={
              teachers.length === 0
                ? 'No teaching staff on record yet'
                : 'Who teaches it. Needed before they can log classwork or set homework.'
            }
          >
            <Select
              id="assign-teacher"
              value={teacherId}
              disabled={teachers.length === 0}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              <option value="">Not assigned yet</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Dialog>
    </>
  )
}
