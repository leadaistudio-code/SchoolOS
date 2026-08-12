'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Status and deletion.
 *
 * Approval is a separate call from editing on purpose — it is the gate that AI
 * drafts have to pass in Phase D, and a gate sharing a button with "save" is a
 * gate that gets opened by accident.
 */
export function QuestionActions({
  id,
  status,
  canApprove,
  canDelete,
}: {
  id: string
  status: string
  canApprove: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)

  async function call(url: string, method: string, body?: unknown, success?: string) {
    setBusy(true)
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        const parsed = await res.json().catch(() => null)
        push({
          tone: 'error',
          title: 'Not saved',
          description: parsed?.error?.message ?? 'Please try again.',
        })
        return false
      }
      if (success) push({ tone: 'success', title: success })
      return true
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {canApprove && status === 'DRAFT' && (
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            if (await call(`/api/v1/questions/${id}/status`, 'POST', { status: 'APPROVED' }, 'Question approved'))
              router.refresh()
          }}
        >
          Approve
        </Button>
      )}

      {canApprove && status === 'APPROVED' && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            if (await call(`/api/v1/questions/${id}/status`, 'POST', { status: 'ARCHIVED' }, 'Question archived'))
              router.refresh()
          }}
        >
          Archive
        </Button>
      )}

      {canDelete && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm('Delete this question? Papers already built keep their copy.')) return
            if (await call(`/api/v1/questions/${id}`, 'DELETE', undefined, 'Question deleted')) {
              router.push('/assessments/bank')
              router.refresh()
            }
          }}
        >
          Delete
        </Button>
      )}
    </div>
  )
}
