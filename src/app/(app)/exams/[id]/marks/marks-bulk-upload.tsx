'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Download, Upload } from 'lucide-react'
import {
  downloadExamMarksTemplateAction,
  importExamMarksAction,
  importPaperMarksAction,
} from '../../actions'
import { downloadCsv } from '@/components/bulk-selection'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type TemplateStudent = {
  admissionNo: string
  rollNumber: number | null
  name: string
  marksObtained: number | null
  isAbsent: boolean
  remarks: string
}

export function MarksBulkUpload({
  examId,
  examName,
  examSubjectId,
  paperLabel,
  students,
}: {
  examId: string
  examName: string
  examSubjectId: string
  paperLabel: string
  students: TemplateStudent[]
}) {
  const router = useRouter()
  const paperInputRef = React.useRef<HTMLInputElement>(null)
  const examInputRef = React.useRef<HTMLInputElement>(null)
  const [pending, startTransition] = React.useTransition()
  const [message, setMessage] = React.useState<string | null>(null)
  const [issues, setIssues] = React.useState<{ row: number; admissionNo?: string; message: string }[]>(
    [],
  )

  function downloadPaperTemplate() {
    const safe = paperLabel.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'paper'
    downloadCsv(
      `${examName}-${safe}-marks.csv`,
      ['Admission No', 'Roll', 'Name', 'Marks', 'Absent', 'Remarks'],
      students.map((student) => [
        student.admissionNo,
        student.rollNumber ?? '',
        student.name,
        student.isAbsent ? '' : (student.marksObtained ?? ''),
        student.isAbsent ? 'Y' : '',
        student.remarks || '',
      ]),
    )
  }

  function downloadExamTemplate() {
    startTransition(async () => {
      const result = await downloadExamMarksTemplateAction(examId)
      if (!result.ok || !result.csv || !result.filename) {
        setMessage(result.message ?? 'Could not build the template')
        return
      }
      const blob = new Blob([`\uFEFF${result.csv}`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename
      anchor.click()
      URL.revokeObjectURL(url)
    })
  }

  function onPaperFile(file: File | null) {
    if (!file) return
    const formData = new FormData()
    formData.set('file', file)
    startTransition(async () => {
      const result = await importPaperMarksAction(examId, examSubjectId, formData)
      setMessage(result.message)
      setIssues(result.issues ?? [])
      if (result.ok) router.refresh()
      if (paperInputRef.current) paperInputRef.current.value = ''
    })
  }

  function onExamFile(file: File | null) {
    if (!file) return
    const formData = new FormData()
    formData.set('file', file)
    startTransition(async () => {
      const result = await importExamMarksAction(examId, formData)
      setMessage(result.message)
      setIssues(result.issues ?? [])
      if (result.ok) router.refresh()
      if (examInputRef.current) examInputRef.current.value = ''
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk upload</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-ink-muted">
          Download a template, fill marks in Excel or Google Sheets, then upload CSV or XLSX.
          Students match by admission number. Put <span className="text-ink">Y</span> under Absent
          for absentees. Whole-exam uploads also need Class and Subject columns.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={downloadPaperTemplate}>
            <Download aria-hidden />
            Template · this paper
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={pending}
            onClick={downloadExamTemplate}
          >
            <Download aria-hidden />
            Template · all papers
          </Button>
          <Button
            type="button"
            size="sm"
            loading={pending}
            onClick={() => paperInputRef.current?.click()}
          >
            <Upload aria-hidden />
            Upload this paper
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={pending}
            onClick={() => examInputRef.current?.click()}
          >
            <Upload aria-hidden />
            Upload all papers
          </Button>
          <input
            ref={paperInputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => onPaperFile(event.target.files?.[0] ?? null)}
          />
          <input
            ref={examInputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => onExamFile(event.target.files?.[0] ?? null)}
          />
        </div>

        {message ? (
          <p role="status" className="text-sm text-ink">
            {message}
          </p>
        ) : null}

        {issues.length > 0 ? (
          <ul className="max-h-40 space-y-1 overflow-auto rounded-md border border-line bg-surface-2 p-3 text-xs text-ink-muted">
            {issues.map((issue) => (
              <li key={`${issue.row}-${issue.admissionNo ?? ''}-${issue.message}`}>
                Row {issue.row}
                {issue.admissionNo ? ` · ${issue.admissionNo}` : ''}: {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}
