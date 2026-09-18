'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Camera, CheckCircle2, ScanLine, UserCheck, UserX, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox, Input, Select } from '@/components/ui/input'
import { Avatar } from '@/components/ui/identity'
import { BulkSelectionBar, useBulkSelection } from '@/components/bulk-selection'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { formatDay } from '@/lib/dates'
import { BarcodeCameraScanner } from '@/components/exams/barcode-camera-scanner'
import {
  bulkMarkExamAttendanceAction,
  markExamAttendanceAction,
  scanExamAttendanceAction,
  type ScanResult,
} from './actions'

type DateOption = {
  key: string
  label: string
  paperCount: number
}

type DayPaper = {
  id: string
  subjectName: string
  className: string
  startTime: string | null
}

type AttendanceRow = {
  admitCardNumber: string
  paperCount: number
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNo: string
    photoUrl: string | null
    className: string
    sectionName: string
    rollNumber: number | null
  }
  attendance: {
    status: string
    source: string
    checkedInAt: string | null
    updatedAt: string
  } | null
}

export function ExamAttendanceDesk({
  examId,
  selectedDate,
  dates,
  dayPapers,
  rows,
}: {
  examId: string
  selectedDate: string
  dates: DateOption[]
  dayPapers: DayPaper[]
  rows: AttendanceRow[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [barcode, setBarcode] = React.useState('')
  const [cameraOpen, setCameraOpen] = React.useState(false)
  const skipNextFocusCamera = React.useRef(false)
  const [lastScan, setLastScan] = React.useState<ScanResult | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [statusFilter, setStatusFilter] = React.useState<
    'all' | 'present' | 'absent' | 'unmarked'
  >('all')

  const present = rows.filter((row) => row.attendance?.status === 'PRESENT').length
  const absent = rows.filter((row) => row.attendance?.status === 'ABSENT').length
  const partial = rows.filter((row) => row.attendance?.status === 'PARTIAL').length
  const unmarked = rows.length - present - absent - partial

  const filteredRows = rows.filter((row) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'present') return row.attendance?.status === 'PRESENT'
    if (statusFilter === 'absent') return row.attendance?.status === 'ABSENT'
    return !row.attendance || row.attendance.status === 'PARTIAL'
  })
  const selection = useBulkSelection(filteredRows.map((row) => row.student.id))

  const applyFilter = (next: typeof statusFilter) => {
    setStatusFilter((current) => (current === next && next !== 'all' ? 'all' : next))
    document.getElementById('attendance-register')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  const submitBarcode = React.useCallback(
    (raw: string) => {
      const value = raw.trim()
      if (!value) return
      setBarcode('')
      startTransition(async () => {
        const result = await scanExamAttendanceAction(examId, {
          examDate: selectedDate,
          barcode: value,
        })
        setLastScan(result)
        toast.push({
          tone: result.ok ? (result.duplicate ? 'info' : 'success') : 'error',
          title: result.ok
            ? result.duplicate
              ? 'Already checked in'
              : 'Attendance marked'
            : 'Barcode rejected',
          description: result.message,
        })
        inputRef.current?.focus()
      })
    },
    [examId, selectedDate, toast],
  )

  const scan = (event: React.FormEvent) => {
    event.preventDefault()
    submitBarcode(barcode)
  }

  const mark = (studentId: string, status: 'PRESENT' | 'ABSENT') =>
    startTransition(async () => {
      const result = await markExamAttendanceAction(examId, {
        examDate: selectedDate,
        studentId,
        status,
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Attendance updated' : 'Could not update attendance',
        description: result.message,
      })
      inputRef.current?.focus()
    })

  const bulkMark = (status: 'PRESENT' | 'ABSENT') =>
    startTransition(async () => {
      const result = await bulkMarkExamAttendanceAction(examId, {
        examDate: selectedDate,
        studentIds: selection.selectedIds,
        status,
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Attendance updated' : 'Some records were not updated',
        description: result.message,
      })
      if (result.ok) selection.clear()
    })

  const selectedLabel = dates.find((day) => day.key === selectedDate)?.label ?? selectedDate

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric
          icon={Users}
          label="Registered"
          value={rows.length}
          tone="brand"
          active={statusFilter === 'all'}
          onClick={() => applyFilter('all')}
        />
        <Metric
          icon={UserCheck}
          label="Present"
          value={present}
          tone="success"
          active={statusFilter === 'present'}
          onClick={() => applyFilter('present')}
        />
        <Metric
          icon={UserX}
          label="Absent"
          value={absent}
          tone="danger"
          active={statusFilter === 'absent'}
          onClick={() => applyFilter('absent')}
        />
        <Metric
          icon={ScanLine}
          label="Not marked"
          value={unmarked + partial}
          tone="warning"
          active={statusFilter === 'unmarked'}
          onClick={() => applyFilter('unmarked')}
        />
      </div>

      <Card variant="elevated">
        <CardHeader>
          <div>
            <CardTitle>Barcode check-in desk</CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">
              Select the exam date, scan the admit card, and attendance is saved for every paper
              that day.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            value={selectedDate}
            onChange={(event) => {
              const query = new URLSearchParams()
              query.set('date', event.target.value)
              router.push(`${pathname}?${query.toString()}`)
            }}
            aria-label="Select exam date"
          >
            {dates.map((day) => (
              <option key={day.key} value={day.key}>
                {day.label} · {day.paperCount} paper{day.paperCount === 1 ? '' : 's'}
              </option>
            ))}
          </Select>

          {dayPapers.length > 0 ? (
            <div className="rounded-[var(--radius-sm)] border border-line bg-surface-2 px-3 py-2">
              <p className="text-xs font-medium text-ink-muted">
                Papers on {selectedLabel}
              </p>
              <p className="mt-1 text-sm text-ink">
                {dayPapers
                  .map((paper) =>
                    [
                      paper.className,
                      paper.subjectName,
                      paper.startTime,
                    ].filter(Boolean).join(' · '),
                  )
                  .join(' · ')}
              </p>
            </div>
          ) : null}

          <form onSubmit={scan} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <ScanLine
                className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[var(--product-500)]"
                aria-hidden
              />
              <Input
                ref={inputRef}
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                onFocus={() => {
                  if (skipNextFocusCamera.current) {
                    skipNextFocusCamera.current = false
                    return
                  }
                  if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
                    setCameraOpen(true)
                  }
                }}
                placeholder="Scan admit-card barcode here"
                className="h-12 pl-10 text-base"
                autoFocus
                autoComplete="off"
                enterKeyHint="done"
                aria-label="Admit card barcode"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="h-12 flex-1 sm:flex-none"
                onClick={() => setCameraOpen(true)}
              >
                <Camera className="size-4" aria-hidden />
                Camera
              </Button>
              <Button type="submit" className="h-12 flex-1 sm:flex-none" loading={pending} disabled={!barcode.trim()}>
                Check in
              </Button>
            </div>
          </form>

          <p className="text-xs text-ink-muted">
            Use <span className="font-medium text-ink">Camera</span> on a phone or laptop webcam,
            or plug in a USB barcode scanner and keep typing in the field.
          </p>

          <BarcodeCameraScanner
            open={cameraOpen}
            onClose={() => {
              setCameraOpen(false)
              skipNextFocusCamera.current = true
              inputRef.current?.focus()
            }}
            onDetected={(value) => {
              setBarcode(value)
              submitBarcode(value)
            }}
          />

          {lastScan ? (
            <div className={`flex items-center gap-3 rounded-[var(--radius)] border px-3 py-3 ${
              lastScan.ok
                ? 'border-success/30 bg-success-bg'
                : 'border-[var(--danger)]/30 bg-danger-bg'
            }`}>
              {lastScan.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lastScan.photoUrl} alt="" className="size-11 rounded-full object-cover" />
              ) : (
                <CheckCircle2 className={`size-7 ${lastScan.ok ? 'text-success' : 'text-[var(--danger)]'}`} aria-hidden />
              )}
              <div>
                <p className="text-sm font-semibold text-ink">
                  {lastScan.studentName ?? (lastScan.ok ? 'Checked in' : 'Scan rejected')}
                </p>
                <p className="text-xs text-ink-muted">
                  {lastScan.admissionNo && `${lastScan.admissionNo} · `}
                  {lastScan.className ?? lastScan.message}
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card id="attendance-register" className="scroll-mt-20 overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Day attendance register</CardTitle>
            <p className="mt-0.5 text-sm text-ink-muted">
              Manual controls mark every paper for the student on {selectedLabel}.
              {statusFilter !== 'all' ? (
                <>
                  {' '}
                  Showing{' '}
                  <span className="font-medium text-ink">
                    {statusFilter === 'unmarked' ? 'not marked' : statusFilter}
                  </span>{' '}
                  ({filteredRows.length} of {rows.length}).{' '}
                  <button
                    type="button"
                    className="text-[var(--brand-600)] hover:underline"
                    onClick={() => setStatusFilter('all')}
                  >
                    Show all
                  </button>
                </>
              ) : null}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <BulkSelectionBar
            count={selection.selected.size}
            noun="student"
            onClear={selection.clear}
          >
            <Button size="sm" variant="secondary" loading={pending} onClick={() => bulkMark('PRESENT')}>
              Mark present
            </Button>
            <Button size="sm" variant="secondary" loading={pending} onClick={() => bulkMark('ABSENT')}>
              Mark absent
            </Button>
          </BulkSelectionBar>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>
                    <Checkbox
                      aria-label="Select all students"
                      checked={selection.allSelected}
                      onChange={selection.toggleAll}
                      disabled={filteredRows.length === 0}
                    />
                  </TH>
                  <TH>Student</TH>
                  <TH>Class</TH>
                  <TH>Admit card</TH>
                  <TH>Papers</TH>
                  <TH>Status</TH>
                  <TH>Checked in</TH>
                  <TH align="right">Manual action</TH>
                </tr>
              </THead>
              <TBody>
                {filteredRows.map((row) => (
                  <TR key={row.student.id}>
                    <TD>
                      <Checkbox
                        aria-label={`Select ${row.student.firstName} ${row.student.lastName}`}
                        checked={selection.selected.has(row.student.id)}
                        onChange={() => selection.toggle(row.student.id)}
                      />
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Avatar
                          firstName={row.student.firstName}
                          lastName={row.student.lastName}
                          avatarUrl={row.student.photoUrl}
                          className="size-8"
                        />
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {row.student.firstName} {row.student.lastName}
                          </p>
                          <p className="text-xs text-ink-subtle">{row.student.admissionNo}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="text-sm">
                      {row.student.className} {row.student.sectionName}
                      {row.student.rollNumber != null ? ` · Roll ${row.student.rollNumber}` : ''}
                    </TD>
                    <TD className="text-sm tnum">{row.admitCardNumber}</TD>
                    <TD className="text-sm tnum">{row.paperCount}</TD>
                    <TD>
                      {row.attendance ? (
                        <Badge
                          tone={
                            row.attendance.status === 'PRESENT'
                              ? 'success'
                              : row.attendance.status === 'PARTIAL'
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {row.attendance.status.toLowerCase()}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">not marked</Badge>
                      )}
                    </TD>
                    <TD className="text-xs text-ink-muted">
                      {row.attendance?.checkedInAt
                        ? formatDay(new Date(row.attendance.checkedInAt), 'd MMM, h:mm a')
                        : '—'}
                    </TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending || row.attendance?.status === 'PRESENT'}
                          onClick={() => mark(row.student.id, 'PRESENT')}
                        >
                          Present
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending || row.attendance?.status === 'ABSENT'}
                          onClick={() => mark(row.student.id, 'ABSENT')}
                        >
                          Absent
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          {filteredRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              {rows.length === 0
                ? 'No students with approved admit cards are registered for papers on this date.'
                : 'No students match this filter.'}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  label: string
  value: number
  tone: 'brand' | 'success' | 'danger' | 'warning'
  active?: boolean
  onClick?: () => void
}) {
  const colors = {
    brand: 'bg-[var(--product-50)] text-[var(--product-600)]',
    success: 'bg-success-bg text-success',
    danger: 'bg-danger-bg text-[var(--danger)]',
    warning: 'bg-warning-bg text-warning',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-[var(--radius)] border bg-surface text-left transition-colors ${
        active
          ? 'border-[var(--brand-500)] ring-2 ring-[color-mix(in_srgb,var(--brand-500)_25%,transparent)]'
          : 'border-line hover:border-line-strong hover:bg-surface-2'
      }`}
    >
      <span className="flex items-center gap-3 p-3">
        <span className={`grid size-9 place-items-center rounded-[var(--radius-sm)] ${colors[tone]}`}>
          <Icon className="size-5" aria-hidden />
        </span>
        <span>
          <span className="block text-xl font-semibold text-ink tnum">{value}</span>
          <span className="block text-xs text-ink-muted">{label}</span>
        </span>
      </span>
    </button>
  )
}
