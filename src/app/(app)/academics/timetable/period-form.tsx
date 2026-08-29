'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { createPeriodAction, deletePeriodAction, updatePeriodAction } from './actions'

export type PeriodRow = {
  id: string
  name: string
  startTime: string
  endTime: string
  isBreak: boolean
  sortOrder?: number
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
  const router = useRouter()
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
      router.refresh()
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
        <PeriodFields
          name={name}
          setName={setName}
          startTime={startTime}
          setStartTime={setStartTime}
          endTime={endTime}
          setEndTime={setEndTime}
          isBreak={isBreak}
          setIsBreak={setIsBreak}
        />
      </Dialog>
    </>
  )
}

/**
 * The current school day, listed above the grid.
 *
 * When editable, each chip opens a dialog to rename, retimes, mark as break,
 * or delete the period (and every lesson scheduled in it).
 */
export function PeriodStrip({
  periods,
  editable = false,
}: {
  periods: PeriodRow[]
  editable?: boolean
}) {
  const toast = useToast()
  const router = useRouter()
  const [editing, setEditing] = React.useState<PeriodRow | null>(null)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState('')
  const [startTime, setStartTime] = React.useState('08:00')
  const [endTime, setEndTime] = React.useState('08:40')
  const [isBreak, setIsBreak] = React.useState(false)

  if (periods.length === 0) return null

  const openEdit = (period: PeriodRow) => {
    setEditing(period)
    setName(period.name)
    setStartTime(period.startTime)
    setEndTime(period.endTime)
    setIsBreak(period.isBreak)
  }

  const save = () => {
    if (!editing) return
    startTransition(async () => {
      const result = await updatePeriodAction({
        id: editing.id,
        name: name.trim(),
        startTime,
        endTime,
        isBreak,
        sortOrder: editing.sortOrder ?? 0,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not update period', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Period updated', description: result.message })
      setEditing(null)
      router.refresh()
    })
  }

  const remove = () => {
    if (!editing) return
    const label = editing.name
    if (
      !window.confirm(
        `Delete ${label}? Every lesson scheduled in this period across all classes will be removed.`,
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await deletePeriodAction(editing.id)
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not delete period', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Period deleted', description: result.message })
      setEditing(null)
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
        <Clock className="size-3.5 text-ink-subtle" aria-hidden />
        {periods.map((p) =>
          editable ? (
            <button
              key={p.id}
              type="button"
              onClick={() => openEdit(p)}
              className={
                p.isBreak
                  ? 'inline-flex items-center gap-1 rounded-[4px] border border-line bg-surface-2 px-1.5 py-px text-xs text-ink-subtle hover:border-[var(--brand-500)] hover:text-ink'
                  : 'inline-flex items-center gap-1 rounded-[4px] border border-line px-1.5 py-px text-xs text-ink-muted hover:border-[var(--brand-500)] hover:text-ink'
              }
              title="Edit or delete this period"
            >
              {p.name}
              <span className="tnum text-ink-subtle">
                {p.startTime}–{p.endTime}
              </span>
              <Pencil className="size-3 opacity-60" aria-hidden />
            </button>
          ) : (
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
          ),
        )}
        {editable ? (
          <span className="text-xs text-ink-subtle ml-1">Click a period to edit or delete it</span>
        ) : null}
      </div>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit period"
        description="Changing times or deleting a period updates every class timetable that uses it."
        footer={
          <>
            <Button
              onClick={save}
              loading={pending}
              disabled={!name.trim() || !startTime || !endTime || endTime <= startTime}
            >
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={remove}
              disabled={pending}
              className="ml-auto"
            >
              <Trash2 aria-hidden /> Delete
            </Button>
          </>
        }
      >
        <PeriodFields
          name={name}
          setName={setName}
          startTime={startTime}
          setStartTime={setStartTime}
          endTime={endTime}
          setEndTime={setEndTime}
          isBreak={isBreak}
          setIsBreak={setIsBreak}
        />
      </Dialog>
    </>
  )
}

function PeriodFields({
  name,
  setName,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  isBreak,
  setIsBreak,
}: {
  name: string
  setName: (v: string) => void
  startTime: string
  setStartTime: (v: string) => void
  endTime: string
  setEndTime: (v: string) => void
  isBreak: boolean
  setIsBreak: (v: boolean) => void
}) {
  return (
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
