'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

type Target = {
  id: string
  title: string
  subject: string
  className: string | null
  sectionName: string | null
  mode: string
  dueAt: string
  totalMarks: number
}

type StudentRow = {
  studentId: string
  name: string
  attemptId: string | null
  status: string
}

export function SheetUploadForm({ initialTargets }: { initialTargets: Target[] }) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [assignmentId, setAssignmentId] = React.useState(initialTargets[0]?.id ?? '')
  const [students, setStudents] = React.useState<StudentRow[]>([])
  const [studentId, setStudentId] = React.useState('')
  const [loadingStudents, setLoadingStudents] = React.useState(false)

  const selectedStudent = students.find((s) => s.studentId === studentId)

  React.useEffect(() => {
    if (!assignmentId) {
      setStudents([])
      setStudentId('')
      return
    }
    let cancelled = false
    setLoadingStudents(true)
    fetch(`/api/v1/evaluation/assignments/${assignmentId}/students`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled) return
        const rows = (body?.data?.students ?? []) as StudentRow[]
        setStudents(rows)
        setStudentId(rows[0]?.studentId ?? '')
      })
      .catch(() => {
        if (!cancelled) {
          setStudents([])
          setStudentId('')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingStudents(false)
      })
    return () => {
      cancelled = true
    }
  }, [assignmentId])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    data.set('assignmentId', assignmentId)
    data.set('studentId', studentId)
    if (selectedStudent?.attemptId) data.set('attemptId', selectedStudent.attemptId)
    else data.delete('attemptId')

    setBusy(true)
    try {
      const res = await fetch('/api/v1/evaluation/sheets', { method: 'POST', body: data })
      const body = await res.json()
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Upload failed',
          description: body?.error?.message ?? 'Check the file and try again.',
        })
        return
      }
      push({
        tone: 'success',
        title: 'Queued for evaluation',
        description: 'The worker will process this sheet asynchronously.',
      })
      form.reset()
      router.push(`/assessments/evaluation/${body.data.evaluationJobId}`)
      router.refresh()
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  if (initialTargets.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-[var(--muted)]">
          No assignments yet. Approve and assign a paper first, then upload answer sheets here.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload answer sheet</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <Field label="Assignment" required className="sm:col-span-2">
            <Select
              value={assignmentId}
              onChange={(e) => setAssignmentId(e.target.value)}
              required
            >
              {initialTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.className ? ` · ${t.className}` : ''}
                  {t.sectionName ? ` ${t.sectionName}` : ''}
                  {` · ${t.subject} · ${t.mode}`}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Student" required>
            <Select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
              disabled={loadingStudents || students.length === 0}
            >
              {students.length === 0 ? (
                <option value="">{loadingStudents ? 'Loading…' : 'No students in scope'}</option>
              ) : (
                students.map((s) => (
                  <option key={s.studentId} value={s.studentId}>
                    {s.name}
                    {s.attemptId ? ` · ${s.status}` : ' · no attempt yet'}
                  </option>
                ))
              )}
            </Select>
          </Field>

          <Field label="Page count" hint="Approximate pages in the scan">
            <Input name="pageCount" type="number" min={1} max={40} defaultValue={1} />
          </Field>

          <Field label="File (PDF / JPG / PNG)" required className="sm:col-span-2">
            <Input
              name="file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
              required
            />
          </Field>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || !studentId}>
              {busy ? 'Uploading…' : 'Upload & queue'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
