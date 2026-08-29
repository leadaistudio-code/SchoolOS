'use client'

import { useActionState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Trash2 } from 'lucide-react'
import { updateExamMetaAction, updateExamPapersAction, deleteExamAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, FormSection, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { formatDay } from '@/lib/dates'

type Paper = {
  id: string
  maxMarks: number
  passMarks: number
  examDate: Date | string | null
  startTime: string | null
  endTime: string | null
  roomName: string | null
  classSubject: {
    classLevel: { name: string }
    subject: { name: string; code: string }
  }
}

function toDateInput(value: Date | string | null) {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  return formatDay(d, 'yyyy-MM-dd')
}

export function ExamMetaForm({
  exam,
}: {
  exam: {
    id: string
    name: string
    status: string
    startsOn: Date | string | null
    endsOn: Date | string | null
  }
}) {
  const [state, action, pending] = useActionState(updateExamMetaAction, emptyFormState)
  const locked = exam.status === 'PUBLISHED'

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="examId" value={exam.id} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">Exam details saved.</Notice> : null}
      <FormSection title="Examination" description="Name, window and lifecycle status.">
        <Field label="Name" htmlFor="name" required error={state.fieldErrors.name}>
          <Input
            id="name"
            name="name"
            defaultValue={exam.name}
            required
            maxLength={100}
            disabled={locked}
          />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={exam.status} disabled={locked && exam.status !== 'PUBLISHED'}>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="ONGOING">Ongoing</option>
            <option value="MARKS_ENTRY">Marks entry</option>
            {locked ? <option value="PUBLISHED">Published</option> : null}
            <option value="ARCHIVED">Archived</option>
          </Select>
        </Field>
        <Field label="Starts on" htmlFor="startsOn">
          <Input
            id="startsOn"
            name="startsOn"
            type="date"
            defaultValue={toDateInput(exam.startsOn)}
            disabled={locked}
          />
        </Field>
        <Field label="Ends on" htmlFor="endsOn" error={state.fieldErrors.endsOn}>
          <Input
            id="endsOn"
            name="endsOn"
            type="date"
            defaultValue={toDateInput(exam.endsOn)}
            disabled={locked}
          />
        </Field>
      </FormSection>
      <Button type="submit" size="sm" disabled={pending}>
        <Save aria-hidden />
        {pending ? 'Saving…' : 'Save details'}
      </Button>
    </form>
  )
}

export function ExamPapersForm({ examId, papers, locked }: { examId: string; papers: Paper[]; locked: boolean }) {
  const [state, action, pending] = useActionState(updateExamPapersAction, emptyFormState)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="paperCount" value={papers.length} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">Papers updated.</Notice> : null}

      <div className="space-y-4">
        {papers.map((paper, index) => (
          <div key={paper.id} className="rounded-[var(--radius-sm)] border border-line p-3 space-y-3">
            <input type="hidden" name={`id-${index}`} value={paper.id} />
            <p className="text-sm font-medium text-ink">
              {paper.classSubject.classLevel.name} · {paper.classSubject.subject.name}
              <span className="ml-2 text-xs text-ink-muted">{paper.classSubject.subject.code}</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Max marks" htmlFor={`maxMarks-${index}`} required>
                <Input
                  id={`maxMarks-${index}`}
                  name={`maxMarks-${index}`}
                  type="number"
                  step="0.5"
                  min={1}
                  max={1000}
                  defaultValue={paper.maxMarks}
                  required
                  disabled={locked}
                />
              </Field>
              <Field label="Pass marks" htmlFor={`passMarks-${index}`} required>
                <Input
                  id={`passMarks-${index}`}
                  name={`passMarks-${index}`}
                  type="number"
                  step="0.5"
                  min={0}
                  max={1000}
                  defaultValue={paper.passMarks}
                  required
                  disabled={locked}
                />
              </Field>
              <Field label="Room" htmlFor={`roomName-${index}`}>
                <Input
                  id={`roomName-${index}`}
                  name={`roomName-${index}`}
                  defaultValue={paper.roomName ?? ''}
                  maxLength={80}
                  disabled={locked}
                />
              </Field>
              <Field label="Exam date" htmlFor={`examDate-${index}`}>
                <Input
                  id={`examDate-${index}`}
                  name={`examDate-${index}`}
                  type="date"
                  defaultValue={toDateInput(paper.examDate)}
                  disabled={locked}
                />
              </Field>
              <Field label="Starts" htmlFor={`startTime-${index}`}>
                <Input
                  id={`startTime-${index}`}
                  name={`startTime-${index}`}
                  type="time"
                  defaultValue={paper.startTime ?? ''}
                  disabled={locked}
                />
              </Field>
              <Field label="Ends" htmlFor={`endTime-${index}`}>
                <Input
                  id={`endTime-${index}`}
                  name={`endTime-${index}`}
                  type="time"
                  defaultValue={paper.endTime ?? ''}
                  disabled={locked}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>

      {!locked ? (
        <Button type="submit" size="sm" disabled={pending || papers.length === 0}>
          <Save aria-hidden />
          {pending ? 'Saving…' : 'Save papers'}
        </Button>
      ) : (
        <p className="text-sm text-ink-muted">Published exams cannot change paper settings.</p>
      )}
    </form>
  )
}

export function DeleteExamButton({ examId, examName, status }: { examId: string; examName: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const remove = () => {
    if (status === 'PUBLISHED') {
      window.alert('Archive this exam first, then delete it.')
      return
    }
    if (
      !window.confirm(
        `Delete "${examName}"? All papers, marks and admit cards for this exam will be permanently removed.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await deleteExamAction(examId)
      if (!result.ok) {
        window.alert(result.message)
        return
      }
      router.push('/exams')
      router.refresh()
    })
  }

  return (
    <Button size="sm" variant="danger" disabled={pending} onClick={remove}>
      <Trash2 aria-hidden /> {pending ? 'Deleting…' : 'Delete exam'}
    </Button>
  )
}
