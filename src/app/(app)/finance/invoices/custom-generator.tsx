'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, CheckCircle2, Search, UserPlus, X } from 'lucide-react'
import { generateCustomInvoicesAction } from '../actions'
import type { CustomInvoiceGenerationResult } from '@/server/modules/finance/simplicity'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { formatMoney } from '@/lib/utils'

type StudentHit = {
  id: string
  admissionNo: string
  firstName: string
  lastName: string
  className: string | null
  sectionName: string | null
}

export type InvoiceGenerationStructure = {
  id: string
  name: string
  className: string
  sessionName: string
  sessionId: string
  classLevelId: string | null
  classes: {
    id: string
    name: string
    sections: { id: string; name: string }[]
  }[]
  installments: {
    id: string
    name: string
    dueOn: string
    month: string
    lines: {
      id: string
      feeHeadId: string
      label: string
      code: string
      amountMinor: number
    }[]
  }[]
}

function nextMonth() {
  const date = new Date()
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 7)
}

function monthName(value: string) {
  return new Date(`${value}-01T00:00:00.000Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function CustomInvoiceGenerator({
  structures,
  currency,
}: {
  structures: InvoiceGenerationStructure[]
  currency: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [structureId, setStructureId] = React.useState(structures[0]?.id ?? '')
  const [selectionMode, setSelectionMode] = React.useState<'INDIVIDUAL' | 'CLASS' | 'SECTION'>('INDIVIDUAL')
  const [students, setStudents] = React.useState<StudentHit[]>([])
  const [classLevelId, setClassLevelId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState<StudentHit[]>([])
  const [searching, setSearching] = React.useState(false)
  const [installmentIds, setInstallmentIds] = React.useState<string[]>([])
  const [feeHeadIds, setFeeHeadIds] = React.useState<string[]>([])
  const [automatic, setAutomatic] = React.useState(true)
  const [autoGenerateFrom, setAutoGenerateFrom] = React.useState(nextMonth())
  const [preview, setPreview] = React.useState<CustomInvoiceGenerationResult | null>(null)
  const [pending, startTransition] = React.useTransition()

  const structure = structures.find((item) => item.id === structureId)
  const selectedInstallments = structure?.installments.filter((item) =>
    installmentIds.includes(item.id)) ?? []
  const heads = [...new Map(
    selectedInstallments
      .flatMap((installment) => installment.lines)
      .map((line) => [line.feeHeadId, line]),
  ).values()]

  React.useEffect(() => {
    if (query.trim().length < 2) {
      setHits([])
      return
    }
    const controller = new AbortController()
    setSearching(true)
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/students?q=${encodeURIComponent(query)}&pageSize=8`, {
          signal: controller.signal,
        })
        const json = await response.json()
        const selected = new Set(students.map((student) => student.id))
        setHits((json.data ?? []).filter((student: StudentHit) => !selected.has(student.id)))
      } catch {
        // Search cancellation is expected while typing.
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [query, students])

  function resetSelection(id: string) {
    setStructureId(id)
    setSelectionMode('INDIVIDUAL')
    setStudents([])
    setClassLevelId('')
    setSectionId('')
    setQuery('')
    setHits([])
    setInstallmentIds([])
    setFeeHeadIds([])
    setPreview(null)
  }

  function toggleMonth(id: string) {
    setInstallmentIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    setFeeHeadIds([])
    setPreview(null)
  }

  function toggleHead(id: string) {
    setFeeHeadIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    setPreview(null)
  }

  function run(dryRun: boolean) {
    startTransition(async () => {
      const result = await generateCustomInvoicesAction({
        structureId,
        selectionMode,
        studentIds: students.map((student) => student.id),
        classLevelId: selectionMode === 'CLASS' ? classLevelId : null,
        sectionId: selectionMode === 'SECTION' ? sectionId : null,
        installmentIds,
        feeHeadIds,
        autoGenerateFrom: automatic ? autoGenerateFrom : null,
        dryRun,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not generate invoices', description: result.message })
        return
      }
      if (dryRun) {
        setPreview(result.data ?? null)
        return
      }
      toast.push({ tone: 'success', title: 'Invoices generated', description: result.message })
      setPreview(null)
      setStudents([])
      setClassLevelId('')
      setSectionId('')
      setInstallmentIds([])
      setFeeHeadIds([])
      router.refresh()
    })
  }

  if (structures.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm font-medium text-ink">No published fee plan is ready</p>
          <p className="mt-1 text-sm text-ink-muted">
            Publish a fee structure with installments before generating monthly invoices.
          </p>
        </CardContent>
      </Card>
    )
  }

  const ready = preview?.preview.filter((item) => !item.skipReason) ?? []
  const hasStudentSelection =
    selectionMode === 'INDIVIDUAL'
      ? students.length > 0
      : selectionMode === 'CLASS'
        ? Boolean(classLevelId)
        : Boolean(sectionId)

  return (
    <Card id="generate" className="mb-5 overflow-visible">
      <CardHeader>
        <div>
          <CardTitle>Custom invoice generation</CardTitle>
          <p className="mt-1 text-sm text-ink-muted">
            Choose students, billing months and fee heads. Only generated items enter outstanding.
          </p>
        </div>
        <CalendarClock className="size-5 text-[var(--brand-600)]" aria-hidden />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="Fee structure" htmlFor="invoice-structure" required>
            <Select
              id="invoice-structure"
              value={structureId}
              onChange={(event) => resetSelection(event.target.value)}
            >
              {structures.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.className} · {item.sessionName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Choose students by" htmlFor="invoice-selection-mode" required>
            <Select
              id="invoice-selection-mode"
              value={selectionMode}
              onChange={(event) => {
                setSelectionMode(event.target.value as typeof selectionMode)
                setStudents([])
                setClassLevelId('')
                setSectionId('')
                setQuery('')
                setHits([])
                setPreview(null)
              }}
            >
              <option value="INDIVIDUAL">Individual students</option>
              <option value="CLASS">Entire class</option>
              <option value="SECTION">Entire section</option>
            </Select>
          </Field>

          {selectionMode === 'INDIVIDUAL' ? (
            <Field
              label="Find individual students"
              htmlFor="invoice-student-search"
              hint={`${students.length} selected`}
              required
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-ink-subtle" aria-hidden />
                <Input
                  id="invoice-student-search"
                  className="pl-9"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setPreview(null)
                  }}
                  placeholder="Name or admission number"
                />
                {query.trim().length >= 2 ? (
                  <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-[var(--radius)] border border-line bg-surface shadow-lg">
                    {searching ? (
                      <p className="px-3 py-2 text-sm text-ink-muted">Searching…</p>
                    ) : hits.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-ink-muted">No matching students</p>
                    ) : hits.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        className="flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-0 hover:bg-surface-2"
                        onClick={() => {
                          setStudents((current) => [...current, student])
                          setQuery('')
                          setHits([])
                        }}
                      >
                        <UserPlus className="size-4 text-ink-subtle" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">
                            {student.firstName} {student.lastName}
                          </span>
                          <span className="block text-xs text-ink-subtle">
                            {student.admissionNo}
                            {student.className ? ` · ${student.className}${student.sectionName ? `-${student.sectionName}` : ''}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </Field>
          ) : selectionMode === 'CLASS' ? (
            <Field label="Class" htmlFor="invoice-class" required>
              <Select
                id="invoice-class"
                value={classLevelId}
                onChange={(event) => {
                  setClassLevelId(event.target.value)
                  setPreview(null)
                }}
              >
                <option value="">Select a class</option>
                {structure?.classes.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Section" htmlFor="invoice-section" required>
              <Select
                id="invoice-section"
                value={sectionId}
                onChange={(event) => {
                  setSectionId(event.target.value)
                  setPreview(null)
                }}
              >
                <option value="">Select a section</option>
                {structure?.classes.flatMap((classLevel) =>
                  classLevel.sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {classLevel.name} · Section {section.name}
                    </option>
                  )),
                )}
              </Select>
            </Field>
          )}
        </div>

        {selectionMode === 'INDIVIDUAL' && students.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {students.map((student) => (
              <span key={student.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-ink">
                {student.firstName} {student.lastName} · {student.admissionNo}
                <button
                  type="button"
                  aria-label={`Remove ${student.firstName}`}
                  onClick={() => {
                    setStudents((current) => current.filter((item) => item.id !== student.id))
                    setPreview(null)
                  }}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">Billing months</p>
              <p className="text-xs text-ink-subtle">Select April–September for the requested backfill.</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setInstallmentIds(structure?.installments.map((item) => item.id) ?? [])
                setFeeHeadIds([])
                setPreview(null)
              }}
            >
              Select all
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {structure?.installments.map((installment) => (
              <label key={installment.id} className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] border border-line p-2.5 hover:bg-surface-2">
                <Checkbox
                  checked={installmentIds.includes(installment.id)}
                  onChange={() => toggleMonth(installment.id)}
                />
                <span>
                  <span className="block text-sm text-ink">{monthName(installment.month)}</span>
                  <span className="block text-xs text-ink-subtle">
                    Due {new Date(installment.dueOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {installmentIds.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">Fee heads</p>
                <p className="text-xs text-ink-subtle">Only heads due in selected months are shown.</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => {
                  setFeeHeadIds(heads.map((head) => head.feeHeadId))
                  setPreview(null)
                }}
              >
                Select all
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {heads.map((head) => (
                <label key={head.feeHeadId} className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-line p-2.5 hover:bg-surface-2">
                  <Checkbox
                    checked={feeHeadIds.includes(head.feeHeadId)}
                    onChange={() => toggleHead(head.feeHeadId)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{head.label}</span>
                    <span className="block text-xs text-ink-subtle">
                      {head.code} · from {formatMoney(head.amountMinor, currency)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-[var(--radius)] border border-line bg-surface-2 p-3">
          <label className="flex items-start gap-3">
            <Checkbox
              checked={automatic}
              onChange={() => {
                setAutomatic((value) => !value)
                setPreview(null)
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">Generate monthly invoices automatically</span>
              <span className="block text-xs text-ink-subtle">
                The first eligible invoice is generated on or after the first day of this month.
              </span>
            </span>
            <Input
              aria-label="Automatic generation start month"
              type="month"
              value={autoGenerateFrom}
              disabled={!automatic}
              onChange={(event) => {
                setAutoGenerateFrom(event.target.value)
                setPreview(null)
              }}
              className="w-44"
            />
          </label>
        </div>

        {preview ? (
          <div className="overflow-hidden rounded-[var(--radius)] border border-line">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-3.5 py-2.5">
              <p className="text-sm text-ink">
                <span className="font-medium">{ready.length}</span> invoices ready
                {preview.skipped ? ` · ${preview.skipped} already invoiced` : ''}
              </p>
              <p className="font-semibold tnum text-ink">{formatMoney(preview.totalMinor, currency)}</p>
            </div>
            <ul className="max-h-64 divide-y divide-[var(--border)] overflow-y-auto">
              {preview.preview.slice(0, 100).map((item) => (
                <li key={`${item.studentId}-${item.installmentId}-${item.feeHeadId}`} className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{item.studentName} · {item.feeHead}</span>
                    <span className="block text-xs text-ink-subtle">{item.admissionNo} · {monthName(item.month)}</span>
                  </span>
                  <span className="shrink-0 text-xs tnum text-ink-muted">
                    {item.skipReason ?? formatMoney(item.netMinor, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          {preview ? (
            <>
              <Button variant="secondary" onClick={() => setPreview(null)} disabled={pending}>
                Change selection
              </Button>
              <Button onClick={() => run(false)} loading={pending} disabled={ready.length === 0}>
                <CheckCircle2 aria-hidden />
                Generate {ready.length} invoices
              </Button>
            </>
          ) : (
            <Button
              onClick={() => run(true)}
              loading={pending}
              disabled={!structureId || !hasStudentSelection || installmentIds.length === 0 || feeHeadIds.length === 0 || (automatic && !autoGenerateFrom)}
            >
              Preview invoices
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
