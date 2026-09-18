'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Download, Upload } from 'lucide-react'
import { downloadExamPapersTemplateAction, importExamPapersAction } from '../actions'
import { Button } from '@/components/ui/button'

export function ExamPapersBulkUpload({
  examId,
  locked,
}: {
  examId: string
  locked: boolean
}) {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [pending, startTransition] = React.useTransition()
  const [message, setMessage] = React.useState<string | null>(null)
  const [issues, setIssues] = React.useState<{ row: number; message: string }[]>([])

  function downloadTemplate() {
    startTransition(async () => {
      const result = await downloadExamPapersTemplateAction(examId)
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
    if (!file || locked) return
    const formData = new FormData()
    formData.set('file', file)
    startTransition(async () => {
      const result = await importExamPapersAction(examId, formData)
      setMessage(result.message)
      setIssues(result.issues ?? [])
      if (result.ok) router.refresh()
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  return (
    <div className="mb-4 space-y-3 rounded-[var(--radius-sm)] border border-line bg-surface-2/40 p-3">
      <div>
        <p className="text-sm font-medium text-ink">Bulk schedule upload</p>
        <p className="mt-1 text-xs text-ink-muted">
          Download the papers template, fill max/pass marks, dates, times and rooms in Excel, then
          upload CSV or XLSX. Match rows by Class + Subject.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" loading={pending} onClick={downloadTemplate}>
          <Download aria-hidden />
          Download template
        </Button>
        {!locked ? (
          <Button type="button" size="sm" loading={pending} onClick={() => inputRef.current?.click()}>
            <Upload aria-hidden />
            Upload schedule
          </Button>
        ) : null}
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
        <ul className="max-h-32 space-y-1 overflow-auto text-xs text-ink-muted">
          {issues.map((issue) => (
            <li key={`${issue.row}-${issue.message}`}>
              Row {issue.row}: {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
