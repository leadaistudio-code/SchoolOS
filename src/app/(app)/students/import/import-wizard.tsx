'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Upload,
  AlertTriangle,
  Sparkles,
} from 'lucide-react'
import {
  clarifyStudentImportAction,
  commitStudentImportAction,
  confirmStudentImportAction,
  mapStudentImportAction,
  rollbackStudentImportAction,
  uploadStudentImportAction,
} from './actions'
import type { ImportBatchSummary } from '@/server/modules/imports/service'
import type { ImportClarification } from '@/server/modules/imports/ai-map'
import { IMPORT_FIELDS, type ImportFieldKey } from '@/server/modules/imports/fields'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type Props = {
  initialBatches: ImportBatchSummary[]
  smartImportAvailable: boolean
}

export function ImportWizard({ initialBatches, smartImportAvailable }: Props) {
  const router = useRouter()
  const toast = useToast()
  const inputRef = React.useRef<HTMLInputElement>(null)

  const [batch, setBatch] = React.useState<ImportBatchSummary | null>(null)
  const [mapping, setMapping] = React.useState<Record<ImportFieldKey, string | null> | null>(null)
  const [saveTemplate, setSaveTemplate] = React.useState(true)
  const [smartImport, setSmartImport] = React.useState(smartImportAvailable)
  const [answers, setAnswers] = React.useState<Record<string, string>>({})
  const [pending, startTransition] = React.useTransition()
  const [dragOver, setDragOver] = React.useState(false)

  React.useEffect(() => {
    if (!batch) return
    setMapping(batch.mapping)
    setAnswers({})
  }, [batch])

  const needsReview = batch?.status === 'NEEDS_REVIEW'
  const openQuestions = batch?.pendingQuestions ?? []

  const upload = (file: File | null | undefined) => {
    if (!file) return
    const form = new FormData()
    form.set('file', file)
    form.set('smartImport', smartImport && smartImportAvailable ? 'true' : 'false')
    startTransition(async () => {
      const result = await uploadStudentImportAction(form)
      if (!result.ok || !result.data) {
        toast.push({ tone: 'error', title: 'Upload failed', description: result.message })
        return
      }
      setBatch(result.data)
      toast.push({
        tone: 'success',
        title: result.data.status === 'NEEDS_REVIEW' ? 'Smart import ready' : 'File checked',
        description: result.message,
      })
      router.refresh()
    })
  }

  const confirmMapping = () => {
    if (!batch || !mapping) return
    startTransition(async () => {
      const result = await confirmStudentImportAction(batch.id, {
        mapping,
        saveAsTemplate: saveTemplate,
        answers,
      })
      if (!result.ok || !result.data) {
        toast.push({ tone: 'error', title: 'Could not confirm', description: result.message })
        return
      }
      setBatch(result.data)
      toast.push({ tone: 'success', title: 'Mapping confirmed', description: result.message })
    })
  }

  const submitAnswers = () => {
    if (!batch) return
    startTransition(async () => {
      const result = await clarifyStudentImportAction(batch.id, { answers })
      if (!result.ok || !result.data) {
        toast.push({ tone: 'error', title: 'Could not save answers', description: result.message })
        return
      }
      setBatch(result.data)
      toast.push({ tone: 'success', title: 'Answers saved', description: result.message })
    })
  }

  const remap = () => {
    if (!batch || !mapping) return
    startTransition(async () => {
      const result = await mapStudentImportAction(batch.id, {
        mapping,
        saveAsTemplate: saveTemplate,
      })
      if (!result.ok || !result.data) {
        toast.push({ tone: 'error', title: 'Could not validate', description: result.message })
        return
      }
      setBatch(result.data)
      toast.push({ tone: 'success', title: 'Dry run updated', description: result.message })
    })
  }

  const commit = () => {
    if (!batch) return
    startTransition(async () => {
      const result = await commitStudentImportAction(batch.id)
      if (!result.ok || !result.data) {
        toast.push({ tone: 'error', title: 'Commit failed', description: result.message })
        return
      }
      setBatch(result.data)
      toast.push({ tone: 'success', title: 'Import committed', description: result.message })
      router.refresh()
    })
  }

  const rollback = () => {
    if (!batch) return
    if (!window.confirm(`Archive all ${batch.committedCount || batch.validRows} students from this import?`)) {
      return
    }
    startTransition(async () => {
      const result = await rollbackStudentImportAction(batch.id)
      if (!result.ok || !result.data) {
        toast.push({ tone: 'error', title: 'Rollback failed', description: result.message })
        return
      }
      setBatch(result.data)
      toast.push({ tone: 'success', title: 'Import rolled back', description: result.message })
      router.refresh()
    })
  }

  const openBatch = (next: ImportBatchSummary) => {
    setBatch(next)
  }

  return (
    <div className="space-y-4">
      {!batch ? (
        <>
          <Card>
            <CardContent className="p-0">
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  upload(e.dataTransfer.files?.[0])
                }}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-3 px-6 py-14 text-center transition-colors',
                  dragOver ? 'bg-[var(--brand-50)]' : 'bg-surface hover:bg-surface-2',
                )}
              >
                <Upload className="size-8 text-brand" aria-hidden />
                <div>
                  <p className="text-base font-semibold text-ink">Drop the school pack or a student file</p>
                  <p className="mt-1 max-w-lg text-sm text-ink-muted">
                    Use the Excel onboarding pack for a new school — students, parents, staff,
                    classes, attendance, fees, exams and transport. CSV still works for students
                    only. Nothing is written until you confirm.
                  </p>
                </div>
                {smartImportAvailable ? (
                  <label className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-line-strong accent-[var(--brand-500)]"
                      checked={smartImport}
                      onChange={(e) => setSmartImport(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Sparkles className="size-4 text-brand" aria-hidden />
                    Use smart import (AI reads columns for you)
                  </label>
                ) : (
                  <p className="text-xs text-ink-subtle">
                    Smart import needs AI enabled on this deployment — column mapping still works
                    manually.
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    loading={pending}
                    onClick={(e) => {
                      e.stopPropagation()
                      inputRef.current?.click()
                    }}
                  >
                    Choose file
                  </Button>
                  <a
                    href="/api/v1/imports/students?sample=pack"
                    className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download aria-hidden />
                    Download school pack
                  </a>
                  <a
                    href="/api/v1/imports/students?sample=1"
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Student CSV only
                  </a>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => {
                    upload(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent imports</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {initialBatches.length === 0 ? (
                <EmptyState
                  title="No imports yet"
                  description="Download the school pack, fill every sheet the office can, then upload it here. Sample rows are included — delete them before sending real data."
                />
              ) : (
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>File</TH>
                        <TH>Status</TH>
                        <TH align="right">Rows</TH>
                        <TH align="right">Valid</TH>
                        <TH align="right">Errors</TH>
                        <TH />
                      </tr>
                    </THead>
                    <TBody>
                      {initialBatches.map((row) => (
                        <TR key={row.id}>
                          <TD className="text-sm font-medium text-ink">{row.fileName}</TD>
                          <TD>
                            <StatusBadge status={row.status} />
                          </TD>
                          <TD align="right" className="tabular-nums text-sm text-ink-muted">
                            {row.totalRows}
                          </TD>
                          <TD align="right" className="tabular-nums text-sm text-ink-muted">
                            {row.validRows}
                          </TD>
                          <TD align="right" className="tabular-nums text-sm text-ink-muted">
                            {row.errorRows}
                          </TD>
                          <TD align="right">
                            <Button variant="ghost" size="sm" onClick={() => openBatch(row)}>
                              Open
                            </Button>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm text-ink-muted">
                <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
                <span className="truncate font-medium text-ink">{batch.fileName}</span>
                <StatusBadge status={batch.status} />
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {batch.totalRows} rows · {batch.validRows} valid · {batch.errorRows} rejected
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setBatch(null)} disabled={pending}>
                Back
              </Button>
              {needsReview ? (
                <Button
                  size="sm"
                  loading={pending}
                  onClick={openQuestions.length > 0 ? submitAnswers : confirmMapping}
                >
                  {openQuestions.length > 0 ? 'Save answers' : 'Confirm mapping & validate'}
                </Button>
              ) : null}
              {batch.status === 'READY' ? (
                <Button size="sm" loading={pending} disabled={batch.validRows === 0} onClick={commit}>
                  Import {batch.validRows} student{batch.validRows === 1 ? '' : 's'}
                </Button>
              ) : null}
              {batch.status === 'COMMITTED' ? (
                <Button variant="secondary" size="sm" loading={pending} onClick={rollback}>
                  <RotateCcw aria-hidden />
                  Roll back
                </Button>
              ) : null}
              {batch.status === 'COMMITTED' ? (
                <Link href="/students" className={buttonVariants({ size: 'sm' })}>
                  View students
                </Link>
              ) : null}
            </div>
          </div>

          {batch.aiSummary ? (
            <Card>
              <CardContent className="flex items-start gap-3 p-5">
                <Sparkles className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-ink">Smart import suggestion</p>
                  <p className="mt-1 text-sm text-ink-muted">{batch.aiSummary}</p>
                  {batch.aiNotes ? (
                    <p className="mt-2 text-xs text-ink-subtle">{batch.aiNotes}</p>
                  ) : null}
                  {batch.splitFullNameColumn ? (
                    <p className="mt-2 text-xs text-ink-muted">
                      Full name column detected: <strong>{batch.splitFullNameColumn}</strong>
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {openQuestions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>We need your help</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-ink-muted">
                  The spreadsheet layout is not fully clear. Answer these so we map it correctly
                  before import.
                </p>
                {openQuestions.map((q) => (
                  <ClarificationField
                    key={q.id}
                    question={q}
                    value={answers[q.id] ?? ''}
                    headers={batch.headers}
                    onChange={(value) => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}

          {batch.status === 'COMMITTED' || batch.status === 'ROLLED_BACK' ? (
            <Card>
              <CardContent className="flex items-start gap-3 p-5">
                {batch.status === 'COMMITTED' ? (
                  <CheckCircle2 className="mt-0.5 size-5 text-success" aria-hidden />
                ) : (
                  <RotateCcw className="mt-0.5 size-5 text-ink-muted" aria-hidden />
                )}
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {batch.status === 'COMMITTED'
                      ? `${batch.committedCount || batch.validRows} students are on the roll`
                      : 'This import was rolled back'}
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {batch.status === 'COMMITTED'
                      ? 'You can still roll back this batch to archive everyone it created.'
                      : 'The students from this file were archived. Upload a corrected CSV to try again.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
            <Card>
              <CardHeader>
                <CardTitle>Column mapping</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-ink-muted">
                  {needsReview
                    ? 'Review what smart import detected. Adjust anything that looks wrong, then confirm.'
                    : 'Match your spreadsheet columns to SchoolOS fields. Required fields must be mapped before import.'}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {IMPORT_FIELDS.map((field) => (
                    <Field
                      key={field.key}
                      label={field.label}
                      required={field.required}
                      htmlFor={`map-${field.key}`}
                    >
                      <Select
                        id={`map-${field.key}`}
                        value={mapping?.[field.key] ?? ''}
                        disabled={pending}
                        onChange={(e) =>
                          setMapping((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  [field.key]: e.target.value || null,
                                }
                              : prev,
                          )
                        }
                      >
                        <option value="">— Not mapped —</option>
                        {batch.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <label className="flex items-center gap-2 text-sm text-ink-muted">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-line-strong"
                      checked={saveTemplate}
                      onChange={(e) => setSaveTemplate(e.target.checked)}
                    />
                    Remember this mapping for next time
                  </label>
                  <Button size="sm" loading={pending} onClick={needsReview ? confirmMapping : remap}>
                    {needsReview ? 'Confirm mapping & validate' : 'Re-check rows'}
                  </Button>
                </div>
              </CardContent>
            </Card>

          {!needsReview ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {batch.preview.length === 0 ? (
                  <EmptyState title="No rows to preview" />
                ) : (
                  <TableWrap>
                    <Table>
                      <THead>
                        <tr>
                          <TH>Row</TH>
                          <TH>Student</TH>
                          <TH>Class</TH>
                          <TH>Status</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {batch.preview.map((row) => (
                          <TR key={`${row.row}-${row.admissionNo}`}>
                            <TD className="tabular-nums text-sm text-ink-muted">{row.row}</TD>
                            <TD>
                              <p className="text-sm font-medium text-ink">
                                {row.firstName} {row.lastName}
                              </p>
                              <p className="text-xs text-ink-subtle">{row.admissionNo || '—'}</p>
                            </TD>
                            <TD className="text-sm text-ink-muted">
                              {row.className || '—'}
                              {row.sectionName ? ` · ${row.sectionName}` : ''}
                            </TD>
                            <TD>
                              <Badge tone={row.ok ? 'success' : 'danger'}>
                                {row.ok ? 'ready' : 'rejected'}
                              </Badge>
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </TableWrap>
                )}
                {batch.totalRows > batch.preview.length ? (
                  <p className="border-t border-line px-4 py-3 text-xs text-ink-subtle">
                    Showing {batch.preview.length} of {batch.totalRows} rows.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rejections</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {batch.rowErrors.length === 0 ? (
                  <EmptyState
                    title="No rejections"
                    description="Every mapped row passed validation."
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {batch.rowErrors.map((err) => (
                      <li key={`${err.row}-${err.messages[0]}`} className="flex gap-3 px-4 py-3">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">
                            Row {err.row}
                            {err.admissionNo ? (
                              <span className="font-normal text-ink-muted"> · {err.admissionNo}</span>
                            ) : null}
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {err.messages.map((message) => (
                              <li key={message} className="text-sm text-ink-muted">
                                {message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {batch.errorRows > batch.rowErrors.length ? (
                  <p className="border-t border-line px-4 py-3 text-xs text-ink-subtle">
                    Showing the first {batch.rowErrors.length} of {batch.errorRows} rejections.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
          ) : null}
          </>
          )}
        </>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'COMMITTED'
      ? 'success'
      : status === 'READY'
        ? 'brand'
        : status === 'NEEDS_REVIEW'
          ? 'info'
        : status === 'FAILED' || status === 'ROLLED_BACK'
          ? 'warning'
          : 'neutral'
  const label =
    status === 'NEEDS_REVIEW'
      ? 'awaiting your review'
      : status === 'READY'
      ? 'ready to import'
      : status === 'COMMITTED'
        ? 'committed'
        : status === 'ROLLED_BACK'
          ? 'rolled back'
          : status === 'FAILED'
            ? 'needs fixes'
            : status.toLowerCase()

  return <Badge tone={tone}>{label}</Badge>
}

function ClarificationField({
  question,
  value,
  headers,
  onChange,
}: {
  question: ImportClarification
  value: string
  headers: string[]
  onChange: (value: string) => void
}) {
  const options =
    question.kind === 'pick_column'
      ? (question.options ?? headers)
      : (question.options ?? [])

  return (
    <Field label={question.prompt} htmlFor={`clarify-${question.id}`}>
      {question.examples?.length ? (
        <p className="mb-1 text-xs text-ink-subtle">
          Example from file: {question.examples.join(', ')}
        </p>
      ) : null}
      {question.kind === 'free_text' ? (
        <Input
          id={`clarify-${question.id}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : options.length > 0 ? (
        <Select
          id={`clarify-${question.id}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          id={`clarify-${question.id}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}
