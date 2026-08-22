'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { captureSnapshotAction } from './actions'

/**
 * Records today's score.
 *
 * A deliberate act rather than something the page does on load: a trend line
 * assembled from whenever somebody happened to open a screen would say more
 * about browsing habits than about the school. Re-recording on the same day
 * replaces that day, so this is safe to press twice.
 */
export function CaptureButton() {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = React.useTransition()

  const capture = () =>
    start(async () => {
      const result = await captureSnapshotAction()
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Checkpoint recorded' : 'Could not record today',
        description: result.message,
      })
      if (result.ok) router.refresh()
    })

  return (
    <Button size="sm" variant="secondary" onClick={capture} loading={pending}>
      <CalendarPlus aria-hidden />
      Record today
    </Button>
  )
}
