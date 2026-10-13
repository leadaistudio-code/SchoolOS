'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * One step back in browser history. Falls back to `fallbackHref` when there is
 * no prior in-app history (e.g. opened from a bookmark or new tab).
 */
export function BackButton({
  label = 'Back',
  fallbackHref = '/finance',
}: {
  label?: string
  fallbackHref?: string
}) {
  const router = useRouter()

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back()
          return
        }
        router.push(fallbackHref)
      }}
    >
      <ArrowLeft aria-hidden />
      {label}
    </Button>
  )
}
