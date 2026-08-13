'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { logClassworkAction } from './actions'

export type TeachableSubject = {
  id: string
  label: string
  sections: { id: string; name: string }[]
}

/**
 * Logging a lesson.
 *
 * A dialog rather than a page: the entry is four fields and it is written at
 * the end of a period, often on a phone, so anything that navigates away from
 * the diary is a worse place to write it.
 *
 * The date defaults to today because that is when a lesson log is almost
 * always written, and backdating one is a deliberate act worth typing.
 */
export function LogClassworkButton({
  subjects,
  label = 'Log classwork',
  variant = 'primary',
}: {
  subjects: TeachableSubject[]
  label?: string
  variant?: 'primary' | 'secondary'
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [classSubjectId, setClassSubjectId] = React.useState(subjects[0]?.id ?? '')
  const [sectionId, setSectionId] = React.useState('')
  const [onDate, setOnDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [topic, setTopic] = React.useState('')
  const [notes, setNotes] = React.useState('')

  const sections = subjects.find((s) => s.id === classSubjectId)?.sections ?? []

  const submit = () =>
    startTransition(async () => {
      const result = await logClassworkAction({
        classSubjectId,
        sectionId: sectionId || undefined,
        onDate,
        topic: topic.trim(),
        notes: notes.trim() || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not log the lesson', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Classwork logged', description: result.message })
      setOpen(false)
      setTopic('')
      setNotes('')
    })

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        onClick={() => setOpen(true)}
        disabled={subjects.length === 0}
        title={
          subjects.length === 0
            ? 'You need a subject assigned to a class before you can log a lesson'
            : undefined
        }
      >
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Log classwork"
        description="What was actually covered in the lesson. Parents of this class can read it."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!classSubjectId || topic.trim().length < 3 || !onDate}
            >
              Log lesson
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Class and subject" htmlFor="cw-subject" required className="sm:col-span-2">
            <Select
              id="cw-subject"
              value={classSubjectId}
              onChange={(e) => {
                setClassSubjectId(e.target.value)
                setSectionId('')
              }}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Section"
            htmlFor="cw-section"
            hint="Leave blank if the lesson covered the whole class"
          >
            <Select
              id="cw-section"
              value={sectionId}
              disabled={sections.length === 0}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">Whole class</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Date" htmlFor="cw-date" required>
            <Input
              id="cw-date"
              type="date"
              value={onDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setOnDate(e.target.value)}
            />
          </Field>

          <Field
            label="Topic covered"
            htmlFor="cw-topic"
            required
            className="sm:col-span-2"
            hint="A line a parent would recognise — not a syllabus code"
          >
            <Input
              id="cw-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Long division with remainders"
            />
          </Field>

          <Field label="Notes" htmlFor="cw-notes" className="sm:col-span-2" hint="Optional">
            <Textarea
              id="cw-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Worked through exercises 1–8. Revision next lesson."
            />
          </Field>
        </div>
      </Dialog>
    </>
  )
}
