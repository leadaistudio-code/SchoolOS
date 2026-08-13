'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { updateConcernAction } from '../workflow-actions'

const STATUSES = [
  { value: 'NEW', label: 'New' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'FOLLOW_UP_REQUIRED', label: 'Follow-up required' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
]

/**
 * Moving a concern along, with an optional note.
 *
 * The note is appended to the record rather than replacing it: a safeguarding
 * trail that can be overwritten is not a trail, and the next person to read
 * this needs to see what was thought at each step.
 */
export function ConcernControls({ id, status }: { id: string; status: string }) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [next, setNext] = React.useState(status)
  const [note, setNote] = React.useState('')

  const submit = () =>
    startTransition(async () => {
      const result = await updateConcernAction({
        id,
        status: next,
        note: note.trim() || undefined,
      })
      if (!result.ok) {
        toast.push({ tone: 'error', title: 'Could not update', description: result.message })
        return
      }
      toast.push({ tone: 'success', title: 'Concern updated', description: result.message })
      setNote('')
    })

  const changed = next !== status || note.trim().length > 0

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Select
        value={next}
        aria-label="Concern status"
        className="w-52"
        onChange={(e) => setNext(e.target.value)}
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>

      <Input
        value={note}
        placeholder="Add a note to the record (optional)"
        className="max-w-sm"
        onChange={(e) => setNote(e.target.value)}
      />

      <Button size="sm" loading={pending} disabled={!changed} onClick={submit}>
        Save
      </Button>
    </div>
  )
}
