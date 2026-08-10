'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, MailOpen, Star } from 'lucide-react'
import { markReadAction, toggleArchiveAction, toggleStarAction } from './actions'
import { IconButton } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/**
 * Star, archive and mark-unread for the open thread.
 *
 * Each control writes optimistically and reverts if the server disagrees: the
 * state is the reader's own, so the round trip is not worth waiting on.
 */
export function ThreadActions({
  conversationId,
  starred,
  archived,
}: {
  conversationId: string
  starred: boolean
  archived: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [isStarred, setStarred] = React.useState(starred)
  const [isArchived, setArchived] = React.useState(archived)

  React.useEffect(() => setStarred(starred), [starred])
  React.useEffect(() => setArchived(archived), [archived])

  const star = async () => {
    const next = !isStarred
    setStarred(next)
    const result = await toggleStarAction(conversationId, next)
    if (!result.ok) {
      setStarred(!next)
      toast.push({ tone: 'error', title: 'Not saved', description: result.message })
    }
  }

  const archive = async () => {
    const next = !isArchived
    setArchived(next)
    const result = await toggleArchiveAction(conversationId, next)
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? 'Done' : 'Not saved',
      description: result.message,
    })
    if (!result.ok) setArchived(!next)
    else router.refresh()
  }

  const unread = async () => {
    const result = await markReadAction(conversationId, false)
    toast.push({
      tone: result.ok ? 'success' : 'error',
      title: result.ok ? 'Marked unread' : 'Not saved',
      description: result.message,
    })
    if (result.ok) router.push('/communication/messages')
  }

  return (
    <div className="flex items-center gap-0.5">
      <IconButton label={isStarred ? 'Remove star' : 'Star this thread'} onClick={star}>
        <Star
          className={cn('size-4', isStarred && 'fill-[var(--chart-staff)] text-[var(--chart-staff)]')}
          aria-hidden
        />
      </IconButton>
      <IconButton label="Mark as unread" onClick={unread}>
        <MailOpen className="size-4" aria-hidden />
      </IconButton>
      <IconButton
        label={isArchived ? 'Move back to inbox' : 'Archive this thread'}
        onClick={archive}
      >
        {isArchived ? (
          <ArchiveRestore className="size-4" aria-hidden />
        ) : (
          <Archive className="size-4" aria-hidden />
        )}
      </IconButton>
    </div>
  )
}
