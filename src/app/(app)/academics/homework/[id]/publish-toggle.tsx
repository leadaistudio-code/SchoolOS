'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { togglePublishAction } from '../actions'
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
