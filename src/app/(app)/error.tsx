'use client'

import { ErrorState } from '@/components/ui/states'
import { Button } from '@/components/ui/button'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      title="This page could not be loaded"
      description={
        error.digest
          ? `Please try again. If it keeps happening, quote reference ${error.digest} to support.`
          : 'Please try again. If it keeps happening, contact support.'
      }
      action={
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      }
    />
  )
}
