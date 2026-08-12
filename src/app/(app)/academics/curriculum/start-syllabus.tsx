'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Creates the syllabus for a class-subject and goes straight into it.
 *
 * There is nothing to ask for at this point — the class, the subject and the
 * session are all already known — so a form here would be a dialog whose only
 * field is a title the server can derive.
 */
export function StartSyllabus({
  classSubjectId,
  label,
}: {
  classSubjectId: string
  label: string
}) {
  const [busy, setBusy] = React.useState(false)
  const router = useRouter()
  const { push } = useToast()

  async function start() {
    setBusy(true)
    try {
      const res = await fetch('/api/v1/curriculum', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ classSubjectId }),
      })
      const body = await res.json()
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Could not start the syllabus',
          description: body?.error?.message ?? 'Please try again.',
        })
        return
      }
      push({ tone: 'success', title: 'Syllabus started', description: label })
      router.push(`/academics/curriculum/${body.data.id}`)
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size="sm" variant="secondary" onClick={start} disabled={busy}>
      {busy ? 'Starting…' : 'Start'}
    </Button>
  )
}
