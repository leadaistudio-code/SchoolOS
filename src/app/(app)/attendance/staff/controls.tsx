'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PencilLine } from 'lucide-react'
import { overrideStaffAttendanceAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea, Field } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

type OverrideTarget = { staffId: string; name: string; current: string | null }

/**
 * Two jobs in one component: the date picker above the table, and the
 * per-row correction dialog.
 *
 * A correction always requires a reason. It never edits the original geofence
 * evidence — that row keeps its coordinates and distance — and the change is
 * written to the audit log with who did it and why.
 */
export function StaffAttendanceControls({
  onDate,
  maxDate,
  override,
}: {
  onDate: string
  maxDate: string
  override?: OverrideTarget
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [status, setStatus] = React.useState(override?.current ?? 'PRESENT')
  const [reason, setReason] = React.useState('')

  if (!override) {
    return (
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-line">
        <Input
          type="date"
          value={onDate}
          max={maxDate}
          aria-label="Attendance date"
          className="w-44"
          onChange={(e) => {
            const next = new URLSearchParams(params.toString())
            next.set('onDate', e.target.value)
            router.push(`${pathname}?${next.toString()}`)
          }}
        />
      </div>
    )
  }

  const submit = () => {
    startTransition(async () => {
      const result = await overrideStaffAttendanceAction({
        staffId: override.staffId,
        onDate,
        status,
        reason,
      })
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Attendance corrected' : 'Could not correct',
        description: result.message,
      })
      if (result.ok) {
        setOpen(false)
        setReason('')
        router.refresh()
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[13px] text-[var(--brand-600)] hover:underline inline-flex items-center gap-1"
      >
        <PencilLine className="size-3.5" aria-hidden />
        Correct
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-60 grid place-items-center p-4 bg-black/45"
          role="dialog"
          aria-modal="true"
          aria-label={`Correct attendance for ${override.name}`}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md bg-surface border border-line rounded-[var(--radius)] shadow-2xl p-5 text-left">
            <h2 className="text-[15px] font-semibold text-ink">Correct attendance</h2>
            <p className="text-[13px] text-ink-muted mt-0.5">
              {override.name} · {onDate}
            </p>

            <div className="space-y-4 mt-4">
              <Field label="Status" htmlFor="override-status" required>
                <Select
                  id="override-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="PRESENT">Present</option>
                  <option value="ABSENT">Absent</option>
                  <option value="LATE">Late</option>
                  <option value="HALF_DAY">Half day</option>
                  <option value="LEAVE">Leave</option>
                  <option value="HOLIDAY">Holiday</option>
                </Select>
              </Field>

              <Field
                label="Reason for the correction"
                htmlFor="override-reason"
                required
                hint="Recorded in the audit log alongside your name"
              >
                <Textarea
                  id="override-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Was on campus but phone had no signal"
                />
              </Field>
            </div>

            <div className="flex items-center gap-2 mt-5">
              <Button onClick={submit} loading={pending} disabled={reason.trim().length < 3}>
                Save correction
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
