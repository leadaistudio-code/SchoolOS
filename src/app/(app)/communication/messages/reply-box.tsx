'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { SendHorizontal } from 'lucide-react'
import { replyAction } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

/** Replying to the open thread. Ctrl+Enter sends, because this is a keyboard tool. */
export function ReplyBox({ conversationId }: { conversationId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [body, setBody] = React.useState('')
  const [pending, setPending] = React.useState(false)

  const send = async () => {
    if (!body.trim()) return
    setPending(true)
    const result = await replyAction(conversationId, body)
    setPending(false)

    if (result.ok) {
      setBody('')
      router.refresh()
    } else {
      toast.push({ tone: 'error', title: 'Not sent', description: result.message })
    }
  }

  return (
    <div className="border-t border-line bg-surface-2 p-3">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            void send()
          }
        }}
        rows={3}
        placeholder="Write a reply"
        aria-label="Reply"
        className="bg-surface"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={send} loading={pending} disabled={!body.trim()}>
          <SendHorizontal className="size-4" aria-hidden />
          Reply
        </Button>
        <span className="text-xs text-ink-subtle">Ctrl + Enter sends</span>
      </div>
    </div>
  )
}
