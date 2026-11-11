'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { reviewProjectAction } from '../actions'

export function ReviewForm({ id, feedback, score }: { id: string; feedback: string; score: string }) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, startTransition] = React.useTransition()
  const [form, setForm] = React.useState({ feedback, score })
  const [busy, setBusy] = React.useState<string | null>(null)

  function decide(decision: 'APPROVED' | 'CHANGES_REQUESTED') {
    setBusy(decision)
    startTransition(async () => {
      const result = await reviewProjectAction(id, { ...form, decision })
      setBusy(null)
      push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (result.ok) {
        router.push('/lms/reviews')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3">
      <Field label="Feedback for the student" htmlFor="rv-feedback" hint="Needed when you send it back">
        <Textarea
          id="rv-feedback"
          rows={4}
          value={form.feedback}
          onChange={(e) => setForm((f) => ({ ...f, feedback: e.target.value }))}
          placeholder="Great wiring! Try tuning the turn speed so it does not overshoot the corners."
        />
      </Field>
      <Field label="Score %" htmlFor="rv-score" hint="Optional" className="max-w-32">
        <Input id="rv-score" type="number" min={0} max={100} value={form.score} onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button loading={busy === 'APPROVED'} disabled={pending} onClick={() => decide('APPROVED')}>
          <Check /> Approve
        </Button>
        <Button variant="secondary" loading={busy === 'CHANGES_REQUESTED'} disabled={pending} onClick={() => decide('CHANGES_REQUESTED')}>
          <Undo2 /> Ask for changes
        </Button>
      </div>
    </div>
  )
}
