'use client'

import * as React from 'react'
import { Clock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { createPeriodAction } from './actions'

export type PeriodRow = {
  id: string
  name: string
  startTime: string
  endTime: string
  isBreak: boolean
}

/**
 * The school day, as the rows of every timetable.
 *
 * A new period is proposed to start when the last one ended, because that is
 * what a school day is — an unbroken run of periods — and the service refuses
 * overlaps anyway. Getting the suggestion right removes most of the typing
 * and all of the arithmetic.
 */
export function NewPeriodButton({
  periods,
  label = 'Add period',
  variant = 'secondary',
}: {
  periods: PeriodRow[]
  label?: string
  variant?: 'primary' | 'secondary'
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState('')
  const [startTime, setStartTime] = React.useState('08:00')
  const [endTime, setEndTime] = React.useState('08:40')
  const [isBreak, setIsBreak] = React.useState(false)

  const openDialog = () => {
    const last = periods[periods.length - 1]
    const start = last?.endTime ?? '08:00'
    setName(suggestName(periods))
    setStartTime(start)
    setEndTime(addMinutes(start, 40))
    setIsBreak(false)
    setOpen(true)
  }

  const submit = () =>
    startTransition(async () => {
      const result = await createPeriodAction({
        name: name.trim(),
        startTime,
        endTime,
        isBreak,
        sortOrder: periods.length,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not add period', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Period added', description: result.message })
      setOpen(false)
    })

  return (
    <>
      <Button size="sm" variant={variant} onClick={openDialog}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add a period"
        description="Periods are the rows of every timetable in the product. They may not overlap."
        footer={
          <>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!name.trim() || !startTime || !endTime || endTime <= startTime}
            >
              Add period
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="period-name" required className="sm:col-span-2">
            <Input
              id="period-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Period 1"
              autoFocus
            />
          </Field>

          <Field label="Starts" htmlFor="period-start" required>
            <Input
              id="period-start"
              type="time"
              value={startTime}
              onChange={(e) => {
                setStartTime(e.target.value)
                if (e.target.value >= endTime) setEndTime(addMinutes(e.target.value, 40))
              }}
            />
          </Field>

          <Field
            label="Ends"
            htmlFor="period-end"
            required
            error={endTime <= startTime ? 'Must be after the start time' : undefined}
          >
            <Input
              id="period-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>

          <label className="flex items-center gap-2 sm:col-span-2">
            <Checkbox checked={isBreak} onChange={(e) => setIsBreak(e.target.checked)} />
            <span className="text-sm text-ink">
              This is a break — shown on the grid but not available for lessons
            </span>
          </label>
        </div>
      </Dialog>
    </>
  )
}

/** The current school day, listed above the grid so it can be checked at a glance. */
export function PeriodStrip({ periods }: { periods: PeriodRow[] }) {
  if (periods.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
      <Clock className="size-3.5 text-ink-subtle" aria-hidden />
      {periods.map((p) => (
        <span
          key={p.id}
          className={
            p.isBreak
              ? 'rounded-[4px] border border-line bg-surface-2 px-1.5 py-px text-xs text-ink-subtle'
              : 'rounded-[4px] border border-line px-1.5 py-px text-xs text-ink-muted'
          }
        >
          {p.name}
          <span className="ml-1 tnum text-ink-subtle">
            {p.startTime}–{p.endTime}
          </span>
        </span>
      ))}
    </div>
  )
}

function suggestName(periods: PeriodRow[]): string {
  const teaching = periods.filter((p) => !p.isBreak).length
  return `Period ${teaching + 1}`
}

function addMinutes(time: string, minutes: number): string {
  const [h = '0', m = '0'] = time.split(':')
  const total = Number(h) * 60 + Number(m) + minutes
  const wrapped = Math.min(total, 23 * 60 + 59)
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}
