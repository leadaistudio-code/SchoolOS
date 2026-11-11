'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import type { LmsResult } from './types'

export type ProjectSubmissionView = {
  status: 'SUBMITTED' | 'CHANGES_REQUESTED' | 'APPROVED'
  note: string | null
  linkUrl: string | null
  feedback: string | null
  score: number | null
  reviewedByLabel: string | null
}

export function ProjectPanel({
  submission,
  submit,
}: {
  submission: ProjectSubmissionView | null
  submit: (input: { note: string; linkUrl: string }) => Promise<LmsResult>
}) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, startTransition] = React.useTransition()
  const [editing, setEditing] = React.useState(!submission || submission.status === 'CHANGES_REQUESTED')
  const [form, setForm] = React.useState({ note: submission?.note ?? '', linkUrl: submission?.linkUrl ?? '' })

  function send() {
    startTransition(async () => {
      const result = await submit(form)
      push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (result.ok) {
        setEditing(false)
        router.refresh()
      }
    })
  }

  const approved = submission?.status === 'APPROVED'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hand in your project</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {submission?.status === 'SUBMITTED' ? (
          <Notice tone="info" title="Waiting for your teacher">They will look at it and approve it or suggest changes.</Notice>
        ) : null}
        {submission?.status === 'CHANGES_REQUESTED' ? (
          <Notice tone="warning" title={`${submission.reviewedByLabel ?? 'Your teacher'} asked for changes`}>
            {submission.feedback}
          </Notice>
        ) : null}
        {approved ? (
          <Notice tone="success" title={`Approved${submission.score !== null ? ` · ${submission.score}%` : ''}`}>
            {submission.feedback || 'Great work!'}
          </Notice>
        ) : null}

        {editing && !approved ? (
          <>
            <Field label="What did you build?" htmlFor="p-note" hint="What works, what was hard, what you would change">
              <Textarea id="p-note" rows={5} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </Field>
            <Field
              label="Link to your work"
              htmlFor="p-link"
              hint="A video of it working, photos in Google Drive, or your code on GitHub / Tinkercad. Make sure your teacher can open it."
            >
              <Input id="p-link" value={form.linkUrl} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} placeholder="https://" />
            </Field>
            <Button loading={pending} onClick={send}>
              <Send /> {submission ? 'Send again' : 'Send to teacher'}
            </Button>
          </>
        ) : submission ? (
          <div className="space-y-1 text-sm">
            {submission.note ? <p className="whitespace-pre-wrap text-ink">{submission.note}</p> : null}
            {submission.linkUrl ? (
              <a href={submission.linkUrl} target="_blank" rel="noopener noreferrer" className="break-all text-[var(--brand-600)] hover:underline">
                {submission.linkUrl}
              </a>
            ) : null}
            {submission.status === 'SUBMITTED' ? (
              <div className="pt-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Change what I sent</Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
