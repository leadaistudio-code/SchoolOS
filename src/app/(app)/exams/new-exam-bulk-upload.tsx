'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Download, Upload } from 'lucide-react'
import { createExamsFromSpreadsheetAction, downloadNewExamTemplateAction } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function NewExamBulkUpload() {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [pending, startTransition] = React.useTransition()
  const [message, setMessage] = React.useState<string | null>(null)
  const [issues, setIssues] = React.useState<{ row: number; message: string }[]>([])

  function downloadTemplate() {
    startTransition(async () => {
      const result = await downloadNewExamTemplateAction()
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

  function onFile(file: File | null) {
    if (!file) return
    const formData = new FormData()
    formData.set('file', file)
    startTransition(async () => {
      const result = await createExamsFromSpreadsheetAction(formData)
      setMessage(result.message)
      setIssues(result.issues ?? [])
      if (result.ok) {
        if (result.examId) router.push(`/exams/${result.examId}`)
        else router.push('/exams')
        router.refresh()
      }
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  return (
    <Card className="mb-6 max-w-4xl">
      <CardHeader>
        <CardTitle>Bulk create from spreadsheet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-ink-muted">
          Download a template with this session’s classes and subjects. Set the exam name and kind,
          fill dates/rooms/marks, then upload. Rows with the same exam name become one examination.
          Kinds: Weekly, Monthly, Unit Test, Mid Term, Final, Practical, Custom.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" loading={pending} onClick={downloadTemplate}>
            <Download aria-hidden />
            Download template
          </Button>
          <Button type="button" size="sm" loading={pending} onClick={() => inputRef.current?.click()}>
            <Upload aria-hidden />
            Upload and create
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
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
              <li key={`${issue.row}-${issue.message}`}>
                Row {issue.row}: {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}
