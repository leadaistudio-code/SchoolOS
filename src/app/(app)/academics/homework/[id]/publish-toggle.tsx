'use client'

import * as React from 'react'
import { Eye, EyeOff, Trash2 } from 'lucide-react'
import { deleteHomeworkAction, togglePublishAction } from '../actions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

export function PublishToggle({ id, isPublished }: { id: string; isPublished: boolean }) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await togglePublishAction(id, !isPublished)
          toast.push({
            tone: r.ok ? 'success' : 'error',
            title: r.ok ? 'Updated' : 'Could not update',
            description: r.message,
          })
        })
      }
    >
      {isPublished ? (
        <>
          <EyeOff className="size-4" aria-hidden />
          Unpublish
        </>
      ) : (
        <>
          <Eye className="size-4" aria-hidden />
          Publish
        </>
      )}
    </Button>
  )
}

export function DeleteHomeworkButton({ id, title }: { id: string; title: string }) {
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      className="text-[var(--danger)]"
      onClick={() => {
        if (!window.confirm(`Delete "${title}"? Students and parents will no longer see it.`)) return
        startTransition(async () => {
          const r = await deleteHomeworkAction(id)
          if (r && !r.ok) toast.push({ tone: 'error', title: 'Could not delete', description: r.message })
        })
      }}
    >
      <Trash2 className="size-4" aria-hidden />
      Delete
    </Button>
  )
}
