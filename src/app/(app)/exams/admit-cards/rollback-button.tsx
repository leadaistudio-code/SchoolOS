'use client'

import * as React from 'react'
import { Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { revokeAdmitCardAction } from './actions'

export function AdmitCardRollbackButton({ id, examId }: { id: string; examId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()

  const rollback = () => {
    if (
      !window.confirm(
        'Roll back approval? The admit card will return to pending and cannot be printed until approved again.',
      )
    ) {
      return
    }
    startTransition(async () => {
      const result = await revokeAdmitCardAction(id, examId)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: 'Rollback',
        description: result.message,
      })
      if (result.ok) {
        router.push(`/exams/${examId}/admit-cards`)
        router.refresh()
      }
    })
  }

  return (
    <Button size="sm" variant="secondary" disabled={pending} onClick={rollback}>
      <Undo2 aria-hidden /> Rollback approval
    </Button>
  )
}
