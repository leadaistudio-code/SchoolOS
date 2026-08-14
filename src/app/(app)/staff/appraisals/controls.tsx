'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { createAppraisalAction } from '../actions'

export type Person = { id: string; label: string }

/** Stage filter, kept in the URL beside the list. */
export function StageFilter({ status }: { status: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  return (
    <Select
      value={status}
      aria-label="Filter by stage"
      className="w-52"
      onChange={(e) => {
        const next = new URLSearchParams(params.toString())
        if (e.target.value) next.set('status', e.target.value)
        else next.delete('status')
        router.push(`${pathname}?${next.toString()}`)
      }}
    >
      <option value="">Every stage</option>
      <option value="DRAFT">Draft</option>
      <option value="SELF_REVIEW">With the appraisee</option>
      <option value="MANAGER_REVIEW">With the reviewer</option>
      <option value="COMPLETED">Completed</option>
    </Select>
  )
}

/**
 * Opening a cycle from the section-level list.
 *
 * Same dialog as the one on a profile, plus a person picker — the list is
 * where somebody runs an appraisal round for several people in a sitting, and
 * making them open each profile first would be six clicks per person.
 */
export function StartAppraisalButton({
  staff,
  reviewers,
  label = 'Open an appraisal',
}: {
  staff: Person[]
  reviewers: Person[]
  label?: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const year = new Date().getFullYear()

  const [staffId, setStaffId] = React.useState('')
  const [cycleName, setCycleName] = React.useState(`${year}-${String(year + 1).slice(2)} Annual`)
  const [periodFrom, setPeriodFrom] = React.useState(`${year}-04-01`)
  const [periodTo, setPeriodTo] = React.useState(`${year + 1}-03-31`)
  const [reviewerStaffId, setReviewerStaffId] = React.useState('')

  const submit = () =>
    startTransition(async () => {
      const result = await createAppraisalAction({
        staffId,
        cycleName: cycleName.trim(),
        periodFrom,
        periodTo,
        reviewerStaffId: reviewerStaffId || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not open', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Appraisal opened', description: result.message })
      // The cycle and dates usually stay the same for the next person in the
      // round, so only the subject is cleared.
      setStaffId('')
    })

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={staff.length === 0}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Open an appraisal"
        description="The dialog stays open after saving so a whole round can be set up in one sitting."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!staffId || !cycleName.trim() || periodTo <= periodFrom}
            >
              Open appraisal
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Staff member" htmlFor="ap-staff" required className="sm:col-span-2">
            <Select id="ap-staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Choose a person</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Cycle" htmlFor="ap-cycle-name" required className="sm:col-span-2">
            <Input
              id="ap-cycle-name"
              value={cycleName}
              onChange={(e) => setCycleName(e.target.value)}
            />
          </Field>

          <Field label="Period from" htmlFor="ap-p-from" required>
            <Input
              id="ap-p-from"
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
          </Field>
          <Field
            label="Period to"
            htmlFor="ap-p-to"
            required
            error={periodTo <= periodFrom ? 'Must be after the start' : undefined}
          >
            <Input
              id="ap-p-to"
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
            />
          </Field>

          <Field label="Reviewer" htmlFor="ap-rev-who" className="sm:col-span-2">
            <Select
              id="ap-rev-who"
              value={reviewerStaffId}
              onChange={(e) => setReviewerStaffId(e.target.value)}
            >
              <option value="">Not assigned</option>
              {reviewers
                .filter((r) => r.id !== staffId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      </Dialog>
    </>
  )
}
