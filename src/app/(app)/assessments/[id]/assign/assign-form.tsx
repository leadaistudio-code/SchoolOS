'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

type Section = { id: string; name: string; students: number }

/** Local datetime for an <input type="datetime-local">, offset from now. */
function localInput(offsetMinutes: number): string {
  const when = new Date(Date.now() + offsetMinutes * 60_000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`
}

/**
 * Setting who sits the paper, and when.
 *
 * The online options are only shown for an online sitting: shuffling questions
 * on a paper being written by hand in a hall is a setting with nothing behind
 * it, and a form full of controls that do not apply is how a teacher learns to
 * stop reading the form.
 */
export function AssignForm({
  assessmentId,
  defaultMinutes,
  sections,
}: {
  assessmentId: string
  defaultMinutes: number
  sections: Section[]
}) {
  const router = useRouter()
  const { push } = useToast()

  const [sectionId, setSectionId] = React.useState(sections[0]?.id ?? '')
  const [mode, setMode] = React.useState<'OFFLINE' | 'ONLINE' | 'PRACTICE'>('ONLINE')
  const [opensAt, setOpensAt] = React.useState(localInput(10))
  const [dueAt, setDueAt] = React.useState(localInput(10 + Math.max(defaultMinutes, 60)))
  const [minutesOverride, setMinutesOverride] = React.useState('')
  const [attemptLimit, setAttemptLimit] = React.useState('1')
  const [shuffleQuestions, setShuffleQuestions] = React.useState(false)
  const [shuffleOptions, setShuffleOptions] = React.useState(false)
  const [onePerScreen, setOnePerScreen] = React.useState(false)
  const [allowBack, setAllowBack] = React.useState(true)
  const [autoSubmit, setAutoSubmit] = React.useState(true)
  const [showResultOnSubmit, setShowResultOnSubmit] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const online = mode !== 'OFFLINE'

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/v1/assessments/${assessmentId}/assign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sectionId: sectionId || undefined,
          mode,
          opensAt: new Date(opensAt).toISOString(),
          dueAt: new Date(dueAt).toISOString(),
          minutesOverride: minutesOverride ? Number(minutesOverride) : undefined,
          attemptLimit: Number(attemptLimit),
          shuffleQuestions,
          shuffleOptions,
          onePerScreen,
          allowBack,
          autoSubmit,
          showResultOnSubmit,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Not assigned',
          description: body?.error?.message ?? 'Check the dates and try again.',
        })
        return
      }
      push({
        tone: 'success',
        title: 'Assigned',
        description: `${body.data.students} students have been notified.`,
      })
      router.refresh()
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>Give this paper to a class</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Section" required>
              <Select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name} ({section.students} students)
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="How it is sat" required>
              <Select
                value={mode}
                onChange={(event) => setMode(event.target.value as typeof mode)}
              >
                <option value="ONLINE">Online, in the portal</option>
                <option value="OFFLINE">On paper, in a hall</option>
                <option value="PRACTICE">Practice — untimed revision</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Opens" required>
              <Input
                type="datetime-local"
                value={opensAt}
                onChange={(event) => setOpensAt(event.target.value)}
                required
              />
            </Field>
            <Field label="Closes" required>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                required
              />
            </Field>
          </div>

          {online && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Minutes allowed"
                  hint={`Leave blank to use the paper's ${defaultMinutes}`}
                >
                  <Input
                    type="number"
                    min="5"
                    value={minutesOverride}
                    onChange={(event) => setMinutesOverride(event.target.value)}
                    placeholder={String(defaultMinutes)}
                  />
                </Field>
                <Field label="Attempts allowed">
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={attemptLimit}
                    onChange={(event) => setAttemptLimit(event.target.value)}
                  />
                </Field>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <Checkbox
                    checked={shuffleQuestions}
                    onChange={(event) => setShuffleQuestions(event.target.checked)}
                  />
                  Shuffle the order of questions
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <Checkbox
                    checked={shuffleOptions}
                    onChange={(event) => setShuffleOptions(event.target.checked)}
                  />
                  Shuffle the order of options
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <Checkbox
                    checked={onePerScreen}
                    onChange={(event) => setOnePerScreen(event.target.checked)}
                  />
                  Show one question per screen
                </label>
                {onePerScreen && (
                  <label className="ml-6 flex items-center gap-2 text-sm text-ink">
                    <Checkbox
                      checked={allowBack}
                      onChange={(event) => setAllowBack(event.target.checked)}
                    />
                    Let students go back to an earlier question
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm text-ink">
                  <Checkbox
                    checked={autoSubmit}
                    onChange={(event) => setAutoSubmit(event.target.checked)}
                  />
                  Submit automatically when the time is up
                </label>
                {mode === 'PRACTICE' && (
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <Checkbox
                      checked={showResultOnSubmit}
                      onChange={(event) => setShowResultOnSubmit(event.target.checked)}
                    />
                    Show the score straight after submitting
                  </label>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="mt-4">
        <Button type="submit" disabled={saving || !sectionId}>
          {saving ? 'Assigning…' : 'Assign and notify'}
        </Button>
      </div>
    </form>
  )
}
