'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

type PaperType = { id: string; name: string; marks: number | null; minutes: number | null }
type Subject = { id: string; label: string; hasSyllabus: boolean }

/**
 * Starting a paper.
 *
 * Only the facts that cannot be changed later by dragging things around: what
 * it is for, how long it runs, and what it is worth. Sections and questions
 * come next, in the builder, where they can be seen against each other.
 *
 * Choosing a type fills marks and duration, because a unit test is a 40-mark
 * hour in most schools and retyping that every fortnight is friction with no
 * information in it. Both stay editable.
 */
export function NewPaperForm({ types, subjects }: { types: PaperType[]; subjects: Subject[] }) {
  const router = useRouter()
  const { push } = useToast()

  const [classSubjectId, setClassSubjectId] = React.useState(subjects[0]?.id ?? '')
  const [typeId, setTypeId] = React.useState(types[0]?.id ?? '')
  const [title, setTitle] = React.useState('')
  const [totalMarks, setTotalMarks] = React.useState(String(types[0]?.marks ?? 40))
  const [durationMinutes, setDurationMinutes] = React.useState(String(types[0]?.minutes ?? 60))
  const [instructions, setInstructions] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const subject = subjects.find((option) => option.id === classSubjectId)

  function pickType(id: string) {
    setTypeId(id)
    const type = types.find((option) => option.id === id)
    if (type?.marks) setTotalMarks(String(type.marks))
    if (type?.minutes) setDurationMinutes(String(type.minutes))
    if (!title.trim() && type) setTitle(type.name)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/v1/assessments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          classSubjectId,
          assessmentTypeId: typeId,
          title: title.trim(),
          totalMarks: Number(totalMarks),
          durationMinutes: Number(durationMinutes),
          instructions: instructions.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Could not start the paper',
          description: body?.error?.message ?? 'Check the fields and try again.',
        })
        return
      }
      router.push(`/assessments/${body.data.id}`)
      router.refresh()
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class and subject" required>
              <Select
                value={classSubjectId}
                onChange={(event) => setClassSubjectId(event.target.value)}
                required
              >
                {subjects.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Kind of test" required>
              <Select value={typeId} onChange={(event) => pickType(event.target.value)} required>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {subject && !subject.hasSyllabus && (
            <Notice tone="info" title="This subject has no published syllabus">
              You can still build the paper from the bank. Publishing the syllabus is what lets a
              paper be scoped to chapters, and it is required before questions can be generated.
            </Notice>
          )}

          <Field label="Title" required hint="Printed at the head of the paper">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Unit Test I"
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Maximum marks" required>
              <Input
                type="number"
                min="1"
                step="1"
                value={totalMarks}
                onChange={(event) => setTotalMarks(event.target.value)}
                required
              />
            </Field>

            <Field label="Duration in minutes" required>
              <Input
                type="number"
                min="5"
                step="5"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                required
              />
            </Field>
          </div>

          <Field label="General instructions" hint="Printed under the header">
            <Textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={3}
              placeholder="All questions are compulsory. Write answers in the space provided."
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving || !title.trim()}>
          {saving ? 'Starting…' : 'Start building'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/assessments')}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
