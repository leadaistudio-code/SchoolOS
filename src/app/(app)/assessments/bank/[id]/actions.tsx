'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

/**
 * Status and deletion.
 *
 * Approval is a separate call from editing on purpose — it is the gate that AI
 * drafts have to pass in Phase D, and a gate sharing a button with "save" is a
 * gate that gets opened by accident.
 */
const TRANSFORMS = [
  { key: 'EASIER', label: 'Make easier' },
  { key: 'HARDER', label: 'Make harder' },
  { key: 'SIMPLIFY', label: 'Simplify language' },
  { key: 'SIMILAR', label: 'Similar question' },
  { key: 'TO_MCQ', label: 'Convert to MCQ' },
  { key: 'TO_DESCRIPTIVE', label: 'Convert to descriptive' },
] as const

export function QuestionActions({
  id,
  status,
  canApprove,
  canDelete,
  canTransform,
}: {
  id: string
  status: string
  canApprove: boolean
  canDelete: boolean
  canTransform: boolean
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
    <div className="flex flex-wrap items-center gap-2">
      {canTransform && (
        <Select
          aria-label="Create a variant with AI"
          value=""
          disabled={busy}
          className="w-48"
          onChange={async (event) => {
            const action = event.target.value
            if (!action) return
            event.target.value = ''
            setBusy(true)
            try {
              const res = await fetch(`/api/v1/questions/${id}/transform`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action }),
              })
              const parsed = await res.json().catch(() => null)
              if (!res.ok) {
                push({
                  tone: 'error',
                  title: 'Could not create a variant',
                  description: parsed?.error?.message ?? 'Please try again.',
                })
                return
              }
              push({
                tone: 'success',
                title: 'Draft variant created',
                description: 'The original is unchanged.',
              })
              router.push(`/assessments/bank/${parsed.data.id}`)
              router.refresh()
            } catch {
              push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
            } finally {
              setBusy(false)
            }
          }}
        >
          <option value="">Create a variant…</option>
          {TRANSFORMS.map((transform) => (
            <option key={transform.key} value={transform.key}>
              {transform.label}
            </option>
          ))}
        </Select>
      )}

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
