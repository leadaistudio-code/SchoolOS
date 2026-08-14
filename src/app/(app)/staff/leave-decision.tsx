'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { decideLeaveAction } from '../leave/actions'

/**
 * Approve or reject one staff leave request.
 *
 * A rejection asks for a note and an approval does not: somebody turned down
 * has to be told why, and somebody approved already has their answer. The
 * note box only appears once Reject is pressed, so the common case stays one
 * click.
 */
export function LeaveDecision({ id }: { id: string }) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const [rejecting, setRejecting] = React.useState(false)
  const [note, setNote] = React.useState('')

  const decide = (status: 'APPROVED' | 'REJECTED', decisionNote?: string) =>
    startTransition(async () => {
      const result = await decideLeaveAction(id, status, decisionNote)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Decision saved' : 'Could not save',
        description: result.message,
      })
      if (result.ok) {
        setRejecting(false)
        setNote('')
      }
    })

  if (rejecting) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input
          value={note}
          autoFocus
          placeholder="Why is this being refused?"
          className="max-w-xs"
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && note.trim()) decide('REJECTED', note)
          }}
        />
        <Button
          size="sm"
          variant="danger"
          loading={pending}
          disabled={!note.trim()}
          onClick={() => decide('REJECTED', note)}
        >
          Reject
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
          Cancel
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button size="sm" loading={pending} onClick={() => decide('APPROVED')}>
        Approve
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}>
        Reject
      </Button>
    </div>
  )
}
