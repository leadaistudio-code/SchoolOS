'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { replyAction, resolveAction } from './actions'

export function ReplyBox({ id }: { id: string }) {
  const router = useRouter()
  const toast = useToast()
  const [text, setText] = useState('')
  const [pending, start] = useTransition()

  function send(resolve: boolean) {
    start(async () => {
      const r = await replyAction(id, text, resolve)
      toast.push({ tone: r.ok ? 'success' : 'error', title: r.ok ? 'Sent' : 'Could not send', description: r.message })
      if (r.ok) {
        setText('')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-2">
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a reply…" aria-label="Reply" maxLength={1000} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => send(true)} loading={pending} disabled={text.trim().length < 2}>
          <Send className="size-3.5" aria-hidden /> Reply and resolve
        </Button>
        <Button size="sm" variant="secondary" onClick={() => send(false)} disabled={pending || text.trim().length < 2}>
          Reply, keep open
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await resolveAction(id)
              toast.push({ tone: r.ok ? 'success' : 'error', title: r.message })
              if (r.ok) router.refresh()
            })
          }
        >
          Resolve without reply
        </Button>
      </div>
    </div>
  )
}
