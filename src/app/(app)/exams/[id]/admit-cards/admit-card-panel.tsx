'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, Download, RefreshCw, Undo2, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Badge } from '@/components/ui/badge'
import { Checkbox, SearchInput } from '@/components/ui/input'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { BulkSelectionBar, useBulkSelection } from '@/components/bulk-selection'
import { formatMoney } from '@/lib/utils'
import {
  approveAdmitCardAction,
  bulkApproveAdmitCardsAction,
  bulkRejectAdmitCardsAction,
  generateAdmitCardsAction,
  refreshAdmitCardFeesAction,
  rejectAdmitCardAction,
  revokeAdmitCardAction,
} from '../../admit-cards/actions'

type Row = {
  id: string
  number: string
  status: string
  feeDueMinor: number
  rejectedReason: string | null
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNo: string
    photoUrl: string | null
    enrollments: {
      classLevel: { name: string }
      section: { name: string } | null
      rollNumber: number | null
    }[]
  }
}

type SectionOption = { id: string; label: string }

function matchesStudentSearch(row: Row, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const enrollment = row.student.enrollments[0]
  const haystack = [
    row.student.firstName,
    row.student.lastName,
    `${row.student.firstName} ${row.student.lastName}`,
    row.student.admissionNo,
    row.number,
    enrollment?.classLevel.name,
    enrollment?.section?.name,
    enrollment?.rollNumber != null ? String(enrollment.rollNumber) : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

export function AdmitCardPanel({
  examId,
  rows,
  sections,
  statusFilter,
  canGenerate,
  canApprove,
}: {
  examId: string
  rows: Row[]
  sections: SectionOption[]
  statusFilter?: 'PENDING' | 'APPROVED' | 'REJECTED'
  canGenerate: boolean
  canApprove: boolean
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [selectedSectionIds, setSelectedSectionIds] = React.useState<string[]>([])
  const [studentQuery, setStudentQuery] = React.useState('')

  const statusRows = statusFilter ? rows.filter((row) => row.status === statusFilter) : rows
  const filtered = statusRows.filter((row) => matchesStudentSearch(row, studentQuery))
  const selectableIds = filtered.filter((row) => row.status === 'PENDING').map((row) => row.id)
  const selection = useBulkSelection(selectableIds)
  const selectedRows = filtered.filter((row) => selection.selected.has(row.id))
  const feeClearSelectedIds = selectedRows
    .filter((row) => row.feeDueMinor === 0)
    .map((row) => row.id)
  const approvedCount = rows.filter((row) => row.status === 'APPROVED').length

  React.useEffect(() => {
    if (statusFilter && typeof window !== 'undefined') {
      document.getElementById('students')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [statusFilter])

  const toggleSection = (id: string, checked: boolean) => {
    setSelectedSectionIds((current) =>
      checked ? [...current, id] : current.filter((sectionId) => sectionId !== id),
    )
  }

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, title: string) =>
    startTransition(async () => {
      const result = await fn()
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title,
        description: result.message,
      })
    })

  const runBulk = (
    fn: () => Promise<{ ok: boolean; message: string }>,
    title: string,
  ) => startTransition(async () => {
    const result = await fn()
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title,
      description: result.message,
    })
    if (result.ok) selection.clear()
  })

  return (
    <div className="space-y-4">
      {statusFilter ? (
        <p className="text-sm text-ink-muted">
          Showing <span className="font-medium text-ink">{statusFilter.toLowerCase()}</span> cards
          ({filtered.length} of {rows.length}).{' '}
          <Link href={`/exams/${examId}/admit-cards#students`} className="text-brand-600 hover:underline">
            Show all
          </Link>
        </p>
      ) : null}

      {canGenerate && sections.length > 0 ? (
        <div className="rounded-[var(--radius)] border border-line bg-surface-2 p-3">
          <p className="text-sm font-medium text-ink">Generate by section</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Leave unchecked to include every eligible section. Each admit card still shows only that
            student&apos;s section papers.
          </p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {sections.map((section) => (
              <label
                key={section.id}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-white px-2.5 py-2 text-sm text-ink"
              >
                <Checkbox
                  checked={selectedSectionIds.includes(section.id)}
                  onChange={(event) => toggleSection(section.id, event.target.checked)}
                  disabled={pending}
                />
                {section.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canGenerate ? (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    generateAdmitCardsAction(
                      examId,
                      selectedSectionIds.length > 0 ? selectedSectionIds : undefined,
                    ),
                  'Generate',
                )
              }
            >
              <UserPlus aria-hidden />
              {selectedSectionIds.length > 0
                ? `Generate for ${selectedSectionIds.length} section${selectedSectionIds.length === 1 ? '' : 's'}`
                : 'Generate for eligible students'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || rows.length === 0}
              onClick={() => run(() => refreshAdmitCardFeesAction(examId), 'Refresh fees')}
            >
              <RefreshCw aria-hidden /> Refresh fee status
            </Button>
          </>
        ) : null}
        {approvedCount > 0 ? (
          <Link
            href={
              selectedSectionIds.length > 0
                ? `/exams/${examId}/admit-cards/print?sections=${encodeURIComponent(selectedSectionIds.join(','))}`
                : `/exams/${examId}/admit-cards/print`
            }
            className={buttonVariants({ size: 'sm', variant: 'secondary' })}
          >
            <Download aria-hidden />
            {selectedSectionIds.length > 0
              ? `Print approved (${selectedSectionIds.length} section${selectedSectionIds.length === 1 ? '' : 's'})`
              : 'Print all approved'}
          </Link>
        ) : null}
      </div>

      {canApprove ? (
        <BulkSelectionBar
          count={selection.selected.size}
          noun="admit card"
          onClear={selection.clear}
        >
          <Button
            size="sm"
            disabled={pending || feeClearSelectedIds.length === 0}
            title={
              feeClearSelectedIds.length === 0
                ? 'Bulk approval is available only for fee-clear students'
                : 'Approve selected fee-clear admit cards'
            }
            onClick={() => {
              runBulk(
                () => bulkApproveAdmitCardsAction(feeClearSelectedIds, examId),
                'Bulk approval',
              )
            }}
          >
            <Check aria-hidden />
            Approve fee-clear ({feeClearSelectedIds.length})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              const reason = window.prompt('Reason for rejecting the selected admit cards?')
              if (!reason?.trim()) return
              runBulk(
                () => bulkRejectAdmitCardsAction(selection.selectedIds, examId, reason.trim()),
                'Bulk rejection',
              )
            }}
          >
            <X aria-hidden />
            Reject selected
          </Button>
        </BulkSelectionBar>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No admit cards yet. Generate cards for students whose section has papers in this exam. The
          principal approves each card after confirming fees are paid.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={studentQuery}
              onChange={(event) => setStudentQuery(event.target.value)}
              placeholder="Search name, admission no, class or card no"
              aria-label="Search students"
            />
            {studentQuery ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setStudentQuery('')}>
                Clear
              </Button>
            ) : null}
            {studentQuery.trim() ? (
              <p className="text-sm text-ink-muted">
                {filtered.length} of {statusRows.length} shown
              </p>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {studentQuery.trim() ? (
                'No students match that search.'
              ) : (
                <>
                  No {statusFilter?.toLowerCase()} admit cards. Pick another status above, or{' '}
                  <Link
                    href={`/exams/${examId}/admit-cards#students`}
                    className="text-brand-600 hover:underline"
                  >
                    show all students
                  </Link>
                  .
                </>
              )}
            </p>
          ) : (
        <TableWrap>
          <Table>
            <THead>
              <tr>
                {canApprove ? (
                  <TH>
                    <Checkbox
                      checked={selection.allSelected}
                      onChange={selection.toggleAll}
                      aria-label="Select all pending admit cards on this page"
                      disabled={selectableIds.length === 0}
                    />
                  </TH>
                ) : null}
                <TH>Student</TH>
                <TH>Class</TH>
                <TH>Fee due</TH>
                <TH>Status</TH>
                <TH align="right"> </TH>
              </tr>
            </THead>
            <TBody>
              {filtered.map((row) => {
                const enrollment = row.student.enrollments[0]
                const classLabel = enrollment
                  ? `${enrollment.classLevel.name}${enrollment.section ? ` · ${enrollment.section.name}` : ''}`
                  : '—'
                return (
                  <TR key={row.id}>
                    {canApprove ? (
                      <TD>
                        {row.status === 'PENDING' ? (
                          <Checkbox
                            checked={selection.selected.has(row.id)}
                            onChange={() => selection.toggle(row.id)}
                            aria-label={`Select admit card for ${row.student.firstName} ${row.student.lastName}`}
                          />
                        ) : null}
                      </TD>
                    ) : null}
                    <TD>
                      <div className="flex items-center gap-2">
                        {row.student.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.student.photoUrl}
                            alt=""
                            className="size-8 rounded-full object-cover border border-line"
                          />
                        ) : (
                          <span className="size-8 rounded-full bg-surface-2 border border-line grid place-items-center text-xs text-ink-subtle">
                            {row.student.firstName[0]}
                          </span>
                        )}
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {row.student.firstName} {row.student.lastName}
                          </p>
                          <p className="text-xs text-ink-subtle">{row.student.admissionNo}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="text-sm text-ink-muted">{classLabel}</TD>
                    <TD className="text-sm tnum">
                      {row.feeDueMinor > 0 ? (
                        <span className="text-[var(--danger)]">{formatMoney(row.feeDueMinor)}</span>
                      ) : (
                        <span className="text-[var(--success)]">Clear</span>
                      )}
                    </TD>
                    <TD>
                      <Badge
                        tone={
                          row.status === 'APPROVED'
                            ? 'success'
                            : row.status === 'REJECTED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {row.status.toLowerCase()}
                      </Badge>
                      {row.rejectedReason ? (
                        <p className="text-xs text-ink-subtle mt-0.5">{row.rejectedReason}</p>
                      ) : null}
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1">
                        {row.status === 'APPROVED' ? (
                          <>
                            <Link
                              href={`/exams/admit-cards/${row.id}`}
                              className="text-sm font-medium text-brand-600 hover:underline"
                            >
                              Print
                            </Link>
                            {canApprove ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                title="Roll back approval if this was a mistake"
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      'Roll back approval? The admit card will return to pending and printing will be blocked until approved again.',
                                    )
                                  ) {
                                    return
                                  }
                                  run(
                                    () => revokeAdmitCardAction(row.id, examId),
                                    'Rollback',
                                  )
                                }}
                              >
                                <Undo2 aria-hidden /> Rollback
                              </Button>
                            ) : null}
                          </>
                        ) : canApprove && row.status === 'PENDING' ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={pending}
                              title={
                                row.feeDueMinor > 0
                                  ? 'Approve by recording a fee exception reason'
                                  : 'Approve admit card'
                              }
                              onClick={() => {
                                let feeOverrideReason: string | undefined
                                if (row.feeDueMinor > 0) {
                                  const reason = window.prompt(
                                    `This student has ${formatMoney(row.feeDueMinor)} outstanding. Enter the reason for allowing the student to sit the exam:`,
                                  )
                                  if (!reason?.trim()) return
                                  if (reason.trim().length < 3) {
                                    toast.push({
                                      tone: 'error',
                                      title: 'Reason required',
                                      description: 'Enter at least 3 characters for the audit record.',
                                    })
                                    return
                                  }
                                  feeOverrideReason = reason.trim()
                                }
                                run(
                                  () => approveAdmitCardAction(row.id, examId, feeOverrideReason),
                                  'Approve',
                                )
                              }}
                            >
                              <Check aria-hidden />
                              {row.feeDueMinor > 0 ? 'Approve exception' : 'Approve'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => {
                                const reason = window.prompt('Reason for rejection?')
                                if (!reason?.trim()) return
                                run(
                                  () => rejectAdmitCardAction(row.id, examId, reason.trim()),
                                  'Reject',
                                )
                              }}
                            >
                              <X aria-hidden />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        </TableWrap>
          )}
        </>
      )}
    </div>
  )
}
