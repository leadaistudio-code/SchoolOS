'use client'

import * as React from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { submitHomeworkAction } from '../actions'
import type { ScopedStudent } from '@/server/scope'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, humanizeStatus } from '@/components/ui/badge'
import { Field, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

type Submission = {
  id: string
  studentId: string
  status: string
  score: number | null
  submittedAt: Date | null
  note: string | null
  teacherComment: string | null
}

/**
 * The student/parent side of a piece of homework.
 *
 * A parent with two children in the same class picks which child is handing
 * in, so one account never guesses on the child's behalf.
 */
export function SubmissionPanel({
  homeworkId,
  maxScore,
  students,
  submissions,
}: {
  homeworkId: string
  maxScore: number | null
  students: ScopedStudent[]
  submissions: Submission[]
}) {
  const toast = useToast()
  const [studentId, setStudentId] = React.useState(students[0]?.id ?? '')
  const [note, setNote] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  const mine = submissions.find((s) => s.studentId === studentId)
  const done = mine?.status === 'SUBMITTED' || mine?.status === 'REVIEWED' || mine?.status === 'LATE'

  if (students.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your submission</CardTitle>
        {mine ? (
          <Badge
            tone={
              mine.status === 'REVIEWED'
                ? 'success'
                : mine.status === 'REDO'
                  ? 'danger'
                  : mine.status === 'LATE'
                    ? 'warning'
                    : 'info'
            }
          >
            {humanizeStatus(mine.status)}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {students.length > 1 ? (
          <Field label="Handing in for" htmlFor="submission-student">
            <Select
              id="submission-student"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                  {s.className ? ` — ${s.className} ${s.sectionName ?? ''}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {done ? (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-base text-success">
              <CheckCircle2 className="size-4.5" aria-hidden />
              Handed in
              {mine?.submittedAt
                ? ` on ${new Date(mine.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                : ''}
              {mine?.status === 'LATE' ? ' (after the due date)' : ''}
            </p>
            {mine?.note ? (
              <p className="text-sm text-ink-muted">Your note: {mine.note}</p>
            ) : null}
            {mine?.score !== null && mine?.score !== undefined ? (
              <p className="text-sm text-ink">
                Score: <span className="font-medium tnum">{mine.score}</span>
                {maxScore ? ` / ${maxScore}` : ''}
              </p>
            ) : null}
            {mine?.teacherComment ? (
              <p className="text-sm text-ink-muted">
                Teacher: &ldquo;{mine.teacherComment}&rdquo;
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {mine?.status === 'REDO' ? (
              <p className="text-sm text-[var(--danger)]">
                Your teacher has asked for this to be redone
                {mine.teacherComment ? `: ${mine.teacherComment}` : '.'}
              </p>
            ) : null}

            <Field label="Note for your teacher" htmlFor="submission-note">
              <Textarea
                id="submission-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Anything the teacher should know (optional)"
              />
            </Field>

            <Button
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await submitHomeworkAction(homeworkId, studentId, note || undefined)
                  toast.push({
                    tone: r.ok ? 'success' : 'error',
                    title: r.ok ? 'Handed in' : 'Could not hand in',
                    description: r.message,
                  })
                  if (r.ok) setNote('')
                })
              }
            >
              <Send aria-hidden />
              Hand in
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
