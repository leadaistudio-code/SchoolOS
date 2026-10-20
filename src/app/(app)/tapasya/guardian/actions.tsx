'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { api } from '../_components/api'

function useAction() {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState<string | null>(null)
  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key)
    try {
      await fn()
      push({ tone: 'success', title: done })
      router.refresh()
    } catch (e) {
      push({ tone: 'error', title: 'Could not save', description: (e as Error).message })
      router.refresh()
    } finally {
      setBusy(null)
    }
  }
  return { busy, run }
}

export function ConsentButtons({ studentId, status }: { studentId: string; status: string }) {
  const { busy, run } = useAction()
  const decide = (decision: 'APPROVE' | 'DECLINE' | 'WITHDRAW', done: string) =>
    run(decision, () => api('/api/v1/tapasya/guardian/consent', { method: 'POST', body: { studentId, decision } }), done)

  if (status === 'PENDING_GUARDIAN') {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy === 'APPROVE'} onClick={() => decide('APPROVE', 'Approved: your child can appear on the global board')}>Approve</Button>
        <Button size="sm" variant="secondary" loading={busy === 'DECLINE'} onClick={() => decide('DECLINE', 'Declined')}>Decline</Button>
      </div>
    )
  }
  if (status === 'ACTIVE') {
    return (
      <Button
        size="sm"
        variant="ghost"
        loading={busy === 'WITHDRAW'}
        onClick={() => {
          if (window.confirm('Remove your child from the global leaderboard? Their XP is kept.')) void decide('WITHDRAW', 'Removed from the global board')
        }}
      >
        Withdraw consent
      </Button>
    )
  }
  return null
}

export function UnlockDecision({ id, requestedMinutes }: { id: string; requestedMinutes: number }) {
  const { busy, run } = useAction()
  const decide = (decision: 'APPROVE' | 'REJECT') =>
    run(decision, () => api(`/api/v1/tapasya/guardian/unlock/${id}`, { method: 'POST', body: { decision } }), decision === 'APPROVE' ? `Allowed for up to ${requestedMinutes} minutes` : 'Request declined')
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" loading={busy === 'APPROVE'} onClick={() => decide('APPROVE')}>Allow</Button>
      <Button size="sm" variant="secondary" loading={busy === 'REJECT'} onClick={() => decide('REJECT')}>Decline</Button>
    </div>
  )
}
