'use client'

import * as React from 'react'
import { Check, Clock, Lock, Save, UserX } from 'lucide-react'
import { saveAttendanceAction } from './actions'
import type { Register } from '@/server/modules/attendance/service'
import { MARKABLE_STATUSES, STATUS_LABEL, type AttendanceStatusValue } from '@/server/modules/attendance/schema'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type Draft = Record<string, { status: AttendanceStatusValue; minutesLate?: number }>

const TONE: Record<string, string> = {
  PRESENT: 'bg-success-bg text-success border-[color-mix(in_srgb,var(--success)_35%,transparent)]',
  ABSENT: 'bg-danger-bg text-[var(--danger)] border-[color-mix(in_srgb,var(--danger)_35%,transparent)]',
  LATE: 'bg-warning-bg text-warning border-[color-mix(in_srgb,var(--warning)_35%,transparent)]',
  HALF_DAY: 'bg-info-bg text-info border-[color-mix(in_srgb,var(--info)_35%,transparent)]',
  LEAVE: 'bg-surface-2 text-ink-muted border-line',
}

/**
 * The daily register.
 *
 * Designed around what actually happens at 8:15am: almost everyone is present,
 * so the roll starts as all-present and the teacher only marks the exceptions.
 * The whole section is submitted in one save, because a partially saved
 * register reads as though the missing students were simply not absent.
 */
export function AttendanceRegister({ register }: { register: Register }) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  const initial = React.useMemo<Draft>(() => {
    const d: Draft = {}
    for (const row of register.rows) {
      d[row.studentId] = {
        status: row.status ?? (row.onApprovedLeave ? 'LEAVE' : 'PRESENT'),
        minutesLate: row.minutesLate ?? undefined,
      }
    }
    return d
  }, [register.rows])

  const [draft, setDraft] = React.useState<Draft>(initial)
  const [dirty, setDirty] = React.useState(false)

  React.useEffect(() => {
    setDraft(initial)
    setDirty(false)
  }, [initial])

  const setStatus = (studentId: string, status: AttendanceStatusValue) => {
    setDraft((d) => ({ ...d, [studentId]: { ...d[studentId], status } }))
    setDirty(true)
  }

  const setAll = (status: AttendanceStatusValue) => {
    setDraft((d) => {
      const next: Draft = {}
      for (const key of Object.keys(d)) next[key] = { ...d[key]!, status }
      return next
    })
    setDirty(true)
  }

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {}
    for (const v of Object.values(draft)) c[v.status] = (c[v.status] ?? 0) + 1
    return c
  }, [draft])

  const save = () => {
    startTransition(async () => {
      const result = await saveAttendanceAction({
        sectionId: register.section.id,
        onDate: register.onDate,
        entries: Object.entries(draft).map(([studentId, v]) => ({
          studentId,
          status: v.status,
          minutesLate: v.minutesLate,
        })),
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Attendance saved' : 'Could not save',
        description: result.message,
      })
      if (result.ok) setDirty(false)
    })
  }

  // Warn before losing an unsaved register.
  React.useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  if (register.rows.length === 0) {
    return (
      <EmptyState
        title="No students in this section"
        description="Enrol students into this section before marking attendance."
      />
    )
  }

  return (
    <div>
      {!register.editable ? (
        <div className="flex items-start gap-2.5 bg-warning-bg border-b border-[color-mix(in_srgb,var(--warning)_25%,transparent)] px-3 py-2">
          <Lock className="size-4 text-warning mt-0.5 shrink-0" aria-hidden />
          <p className="text-sm text-warning">{register.lockedReason}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-line">
        <div className="flex items-center gap-1.5 text-xs text-ink-muted mr-auto">
          {MARKABLE_STATUSES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className={cn('inline-block size-2 rounded-full', dotFor(s))} aria-hidden />
              {STATUS_LABEL[s]} <span className="tnum font-medium text-ink">{counts[s] ?? 0}</span>
            </span>
          ))}
        </div>

        {register.editable ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setAll('PRESENT')}>
              <Check aria-hidden />
              All present
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAll('ABSENT')}>
              <UserX aria-hidden />
              All absent
            </Button>
          </>
        ) : null}
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {register.rows.map((row) => {
          const current = draft[row.studentId]?.status ?? 'PRESENT'
          return (
            <li
              key={row.studentId}
              className="flex flex-wrap items-center gap-3 px-3 py-1.5 hover:bg-surface-2"
            >
              <span className="w-9 text-xs text-ink-subtle tnum shrink-0">
                {row.rollNumber ?? '—'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink truncate">
                  {row.firstName} {row.lastName}
                </span>
                <span className="block text-xs text-ink-subtle">
                  {row.admissionNo}
                  {row.onApprovedLeave ? ' · approved leave' : ''}
                </span>
              </span>

              <div
                className="flex gap-1 shrink-0"
                role="radiogroup"
                aria-label={`Attendance for ${row.firstName} ${row.lastName}`}
              >
                {MARKABLE_STATUSES.map((status) => {
                  const active = current === status
                  return (
                    <button
                      key={status}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!register.editable}
                      onClick={() => setStatus(row.studentId, status)}
                      title={STATUS_LABEL[status]}
                      className={cn(
                        'h-7 w-8 rounded-[var(--radius-sm)] border text-xs font-medium transition-colors disabled:opacity-50',
                        active
                          ? TONE[status]
                          : 'border-line text-ink-subtle hover:bg-surface-2 hover:text-ink',
                      )}
                    >
                      {SHORT[status]}
                    </button>
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>

      {register.editable ? (
        <div className="sticky bottom-16 lg:bottom-0 flex flex-wrap items-center gap-3 px-3 py-2.5 border-t border-line bg-surface">
          <p className="text-xs text-ink-muted mr-auto">
            {register.markedAt ? (
              <>
                Last saved by {register.markedBy ?? 'staff'} ·{' '}
                {new Date(register.markedAt).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </>
            ) : (
              'Not saved yet'
            )}
          </p>
          {dirty ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-warning">
              <Clock className="size-3.5" aria-hidden />
              Unsaved changes
            </span>
          ) : null}
          <Button onClick={save} loading={pending} disabled={!dirty && !!register.markedAt}>
            <Save aria-hidden />
            Save register
          </Button>
        </div>
      ) : null}
    </div>
  )
}

const SHORT: Record<AttendanceStatusValue, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LATE: 'L',
  HALF_DAY: 'H',
  LEAVE: 'LV',
  HOLIDAY: 'HD',
}

function dotFor(status: AttendanceStatusValue): string {
  switch (status) {
    case 'PRESENT':
      return 'bg-[var(--success)]'
    case 'ABSENT':
      return 'bg-[var(--danger)]'
    case 'LATE':
      return 'bg-[var(--warning)]'
    case 'HALF_DAY':
      return 'bg-[var(--info)]'
    default:
      return 'bg-[var(--text-subtle)]'
  }
}
