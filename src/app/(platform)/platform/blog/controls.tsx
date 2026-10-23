'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  deletePostAction,
  generatePostAction,
  regenerateCoverAction,
  setPostStatusAction,
  type BlogActionResult,
} from './actions'

function useAction() {
  const router = useRouter()
  const { push } = useToast()
  const [pending, start] = useTransition()
  const run = (action: () => Promise<BlogActionResult>) =>
    start(async () => {
      const result = await action()
      push({ title: result.message, tone: result.ok ? 'success' : 'error' })
      router.refresh()
    })
  return { pending, run }
}

export function GenerateButton({ disabled }: { disabled?: boolean }) {
  const { pending, run } = useAction()
  return (
    <div className="flex items-center gap-3">
      {pending ? <span className="text-sm text-ink-muted">Writing — this takes about a minute…</span> : null}
      <Button onClick={() => run(generatePostAction)} loading={pending} disabled={disabled || pending}>
        <Sparkles aria-hidden />
        Generate a post now
      </Button>
    </div>
  )
}

export function PostControls({ id, status }: { id: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' }) {
  const { pending, run } = useAction()
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => regenerateCoverAction(id))}>
        Cover photo
      </Button>
      {status !== 'PUBLISHED' ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setPostStatusAction(id, 'PUBLISHED'))}>
          Publish
        </Button>
      ) : (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setPostStatusAction(id, 'ARCHIVED'))}>
          Unpublish
        </Button>
      )}
      {confirming ? (
        <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => deletePostAction(id))}>
          Confirm delete
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(true)}>
          Delete
        </Button>
      )}
    </div>
  )
}
