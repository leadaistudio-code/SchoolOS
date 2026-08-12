'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Releases every marked paper in this assignment at once.
 *
 * Per assignment rather than per student on purpose: releasing one child's
 * result while their neighbour waits tells the class who was marked first, and
 * no teacher wants that conversation.
 */
export function PublishResults({
  assignmentId,
  pending,
}: {
  assignmentId: string
  pending: number
}) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)

  return (
    <Button
      size="sm"
      disabled={busy || pending <= 0}
      onClick={async () => {
        if (!window.confirm(`Release ${pending} results to students and their parents?`)) return
        setBusy(true)
        try {
          const res = await fetch(`/api/v1/assignments/${assignmentId}/publish`, { method: 'POST' })
          const body = await res.json().catch(() => null)
          if (!res.ok) {
            push({
              tone: 'error',
              title: 'Not released',
              description: body?.error?.message ?? 'Please try again.',
            })
            return
          }
          push({
            tone: 'success',
            title: `${body.data.released} results released`,
            description: 'Students have been notified.',
          })
          router.refresh()
        } finally {
          setBusy(false)
        }
      }}
    >
      {pending > 0 ? `Release ${pending}` : 'Nothing to release'}
    </Button>
  )
}
