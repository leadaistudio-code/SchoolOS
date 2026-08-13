'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { createFeedbackActionAction, updateActionItemAction } from '../workflow-actions'


export type StaffOption = { id: string; label: string }

const STATUSES = [
  { value: 'OPEN', label: 'Open' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
]

const PRIORITIES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
]

/**
 * Status, owner and priority in one row.
 *
 * Assigning somebody moves an OPEN item to ASSIGNED without being asked,
 * because an item with an owner that still reads "open" is a status nobody
 * trusts after the first week.
 */
export function ActionControls({
  id,
  status,
  priority,
  assigneeStaffId,
  staff,
}: {
  id: string
  status: string
  priority: string
  assigneeStaffId: string
  staff: StaffOption[]
}) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [nextStatus, setNextStatus] = React.useState(status)
  const [nextPriority, setNextPriority] = React.useState(priority)
  const [nextAssignee, setNextAssignee] = React.useState(assigneeStaffId)

  const changed =
    nextStatus !== status || nextPriority !== priority || nextAssignee !== assigneeStaffId

  const submit = () =>
    startTransition(async () => {
      const result = await updateActionItemAction({
        id,
        status: nextStatus,
        priority: nextPriority,
        assigneeStaffId: nextAssignee,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not update', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Action item updated', description: result.message })
    })

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Select
        value={nextStatus}
        aria-label="Status"
        className="w-40"
        onChange={(e) => setNextStatus(e.target.value)}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>

      <Select
        value={nextPriority}
        aria-label="Priority"
        className="w-32"
        onChange={(e) => setNextPriority(e.target.value)}
      >
        {PRIORITIES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>

      <Select
        value={nextAssignee}
        aria-label="Assign to"
        className="w-52"
        onChange={(e) => {
          setNextAssignee(e.target.value)
          if (e.target.value && nextStatus === 'OPEN') setNextStatus('ASSIGNED')
        }}
      >
        <option value="">Nobody assigned</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </Select>

      <Button size="sm" loading={pending} disabled={!changed} onClick={submit}>
        Save
      </Button>
    </div>
  )
}

/** Raises an action item that is not tied to any one response. */
export function NewActionItemButton({
  staff,
  label = 'New action item',
}: {
  staff: StaffOption[]
  label?: string
}) {
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [priority, setPriority] = React.useState('MEDIUM')
  const [assigneeStaffId, setAssigneeStaffId] = React.useState('')
  const [dueOn, setDueOn] = React.useState('')

  const submit = () =>
    startTransition(async () => {
      const result = await createFeedbackActionAction({
        title: title.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        priority,
        assigneeStaffId: assigneeStaffId || undefined,
        // The schema takes an ISO datetime; a date picker gives a day, so the
        // day is anchored to its end — an item due "on Friday" is not late
        // until Friday is over.
        dueAt: dueOn ? new Date(`${dueOn}T23:59:59Z`).toISOString() : undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not raise item', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Action item raised', description: result.message })
      setOpen(false)
      setTitle('')
      setDescription('')
      setCategory('')
      setDueOn('')
    })

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Raise an action item"
        description="Something the school has decided to do in response to feedback."
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={title.trim().length < 2}>
              Raise item
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What needs doing" htmlFor="ai-title" required className="sm:col-span-2">
            <Input
              id="ai-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Review pacing in Class 8 mathematics"
              autoFocus
            />
          </Field>

          <Field label="Priority" htmlFor="ai-priority">
            <Select id="ai-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Due" htmlFor="ai-due" hint="Optional">
            <Input
              id="ai-due"
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
          </Field>

          <Field label="Owner" htmlFor="ai-owner" hint="Who will do it">
            <Select
              id="ai-owner"
              value={assigneeStaffId}
              disabled={staff.length === 0}
              onChange={(e) => setAssigneeStaffId(e.target.value)}
            >
              <option value="">Nobody yet</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Category" htmlFor="ai-category" hint="Optional — groups the list">
            <Input
              id="ai-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Teaching quality"
            />
          </Field>

          <Field label="Detail" htmlFor="ai-detail" className="sm:col-span-2" hint="Optional">
            <Textarea
              id="ai-detail"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </Dialog>
    </>
  )
}
