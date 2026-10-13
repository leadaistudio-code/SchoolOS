'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { applyLateFinesAction } from './actions'

export function LateFinesButton() {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          if (!window.confirm('Apply late fines to all overdue invoices now, using your active late-fee rule?')) return
          const result = await applyLateFinesAction()
          toast.push({
            tone: result.ok ? 'success' : 'error',
            title: result.ok ? 'Late fines applied' : 'Late fines not applied',
            description: result.message,
          })
          router.refresh()
        })
      }
    >
      Apply late fines now
    </Button>
  )
}
