'use client'

import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Save, Trash2 } from 'lucide-react'
import { addExamPaperAction, updateExamMetaAction, updateExamPapersAction, deleteExamAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, FormSection, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { formatDay } from '@/lib/dates'

type Paper = {
  id: string
  maxMarks: number
  passMarks: number
  internalMaxMarks: number | null
  oralMaxMarks: number | null
  examDate: Date | string | null
  startTime: string | null
  endTime: string | null
  roomName: string | null
  classSubject: {
    classLevel: { name: string }
    subject: { name: string; code: string }
  }
}

type ComponentChoice = '' | 'INTERNAL' | 'ORAL' | 'INTERNAL,ORAL'

/**
 * Written marks plus the optional Internal and Oral parts. Neither part is
 * required; picking one in the dropdown reveals its maximum marks field.
 */
function PaperMarksFields({
  suffix = '',
  defaults,
  disabled,
  error,
}: {
  suffix?: string
  defaults?: { maxMarks: number; internalMaxMarks: number | null; oralMaxMarks: number | null }
  disabled?: boolean
  error?: string
}) {
  const initialInternal = defaults?.internalMaxMarks ?? null
  const initialOral = defaults?.oralMaxMarks ?? null
  const [choice, setChoice] = useState<ComponentChoice>(
    initialInternal && initialOral ? 'INTERNAL,ORAL' : initialInternal ? 'INTERNAL' : initialOral ? 'ORAL' : '',
  )
  const [written, setWritten] = useState(String(defaults ? defaults.maxMarks - (initialInternal ?? 0) - (initialOral ?? 0) : 100))
  const [internal, setInternal] = useState(String(initialInternal ?? 20))
  const [oral, setOral] = useState(String(initialOral ?? 10))
  const hasInternal = choice.includes('INTERNAL')
  const hasOral = choice.includes('ORAL')
  const total = (Number(written) || 0) + (hasInternal ? Number(internal) || 0 : 0) + (hasOral ? Number(oral) || 0 : 0)

  return (
    <>
      <Field label={choice ? 'Written / theory marks' : 'Max marks'} htmlFor={`writtenMaxMarks${suffix}`} required error={error}>
        <Input
          id={`writtenMaxMarks${suffix}`}
          name={`writtenMaxMarks${suffix}`}
          type="number"
          step="0.5"
          min={0}
          max={1000}
          value={written}
          onChange={(e) => setWritten(e.target.value)}
          required
          disabled={disabled}
        />
      </Field>
      <Field label="Additional marks (optional)" htmlFor={`components${suffix}`} hint={choice ? `Paper total: ${total}` : 'Add internal assessment or oral marks'}>
        <Select
          id={`components${suffix}`}
          name={`components${suffix}`}
          value={choice}
          onChange={(e) => setChoice(e.target.value as ComponentChoice)}
          disabled={disabled}
        >
          <option value="">None</option>
          <option value="INTERNAL">Internal marks</option>
          <option value="ORAL">Oral marks</option>
          <option value="INTERNAL,ORAL">Internal + Oral marks</option>
        </Select>
      </Field>
      {hasInternal ? (
        <Field label="Internal max marks" htmlFor={`internalMaxMarks${suffix}`}>
          <Input
            id={`internalMaxMarks${suffix}`}
            name={`internalMaxMarks${suffix}`}
            type="number"
            step="0.5"
            min={0}
            max={1000}
            value={internal}
            onChange={(e) => setInternal(e.target.value)}
            disabled={disabled}
          />
        </Field>
      ) : null}
      {hasOral ? (
        <Field label="Oral max marks" htmlFor={`oralMaxMarks${suffix}`}>
          <Input
            id={`oralMaxMarks${suffix}`}
            name={`oralMaxMarks${suffix}`}
            type="number"
            step="0.5"
            min={0}
            max={1000}
            value={oral}
            onChange={(e) => setOral(e.target.value)}
            disabled={disabled}
          />
        </Field>
      ) : null}
    </>
  )
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
              <PaperMarksFields
                suffix={`-${index}`}
                defaults={paper}
                disabled={locked}
                error={state.fieldErrors[`papers.${index}.maxMarks`]}
              />
              <Field label="Pass marks (of total)" htmlFor={`passMarks-${index}`} required error={state.fieldErrors[`papers.${index}.passMarks`]}>
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

export function AddExamPaperForm({
  examId,
  options,
  locked,
}: {
  examId: string
  options: { id: string; label: string }[]
  locked: boolean
}) {
  const [state, action, pending] = useActionState(addExamPaperAction, emptyFormState)

  if (locked) return null

  if (options.length === 0) {
    return (
      <p className="mb-4 text-sm text-ink-muted">
        Every subject for this exam&apos;s classes is already added. Map more subjects under Academics
        to add further papers.
      </p>
    )
  }

  return (
    <form action={action} className="mb-6 space-y-3 rounded-[var(--radius)] border border-line bg-surface-2 p-3">
      <input type="hidden" name="examId" value={examId} />
      <div>
        <p className="text-sm font-medium text-ink">Add a paper manually</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          Pick a class subject that is not already on this exam, then set marks and schedule.
        </p>
      </div>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">Paper added.</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Class · subject"
          htmlFor="classSubjectId"
          required
          error={state.fieldErrors.classSubjectId}
          className="sm:col-span-2 lg:col-span-3"
        >
          <Select id="classSubjectId" name="classSubjectId" required defaultValue="">
            <option value="" disabled>
              Select paper
            </option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <PaperMarksFields error={state.fieldErrors.maxMarks} />
        <Field label="Pass marks (of total)" htmlFor="passMarks" required error={state.fieldErrors.passMarks}>
          <Input id="passMarks" name="passMarks" type="number" step="0.5" min={0} max={1000} defaultValue={33} required />
        </Field>
        <Field label="Room" htmlFor="roomName">
          <Input id="roomName" name="roomName" maxLength={80} />
        </Field>
        <Field label="Exam date" htmlFor="examDate">
          <Input id="examDate" name="examDate" type="date" />
        </Field>
        <Field label="Starts" htmlFor="startTime">
          <Input id="startTime" name="startTime" type="time" />
        </Field>
        <Field label="Ends" htmlFor="endTime">
          <Input id="endTime" name="endTime" type="time" />
        </Field>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        <Plus aria-hidden />
        {pending ? 'Adding…' : 'Add paper'}
      </Button>
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
