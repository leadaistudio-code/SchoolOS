'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import type { LmsResult } from './types'

export type ProjectSubmissionView = {
  status: 'SUBMITTED' | 'CHANGES_REQUESTED' | 'APPROVED'
  note: string | null
  linkUrl: string | null
  feedback: string | null
  score: number | null
  reviewedByLabel: string | null
  code?: string | null
  pathway?: string | null
  fileKeys?: string[]
  version?: number
}

export type ProjectInput = { note: string; linkUrl: string; code?: string; pathway?: string; fileKeys?: string[] }
export type UploadProjectFile = (form: FormData) => Promise<{ ok: true; key: string; name: string } | { ok: false; message: string }>

const PATHWAYS = [
  { id: 'PHYSICAL', title: 'I built the robot', hint: 'Add a photo, your code and a video link.' },
  { id: 'TEACHER_VERIFIED', title: 'My teacher watched it run', hint: 'Your teacher confirms the run when reviewing.' },
  { id: 'VIRTUAL', title: 'Virtual pathway', hint: 'No kit: finish both simulator challenge tracks above.' },
] as const

export function ProjectPanel({
  submission,
  submit,
  upload,
  capstone,
  virtualReady,
  uploadLabel,
}: {
  submission: ProjectSubmissionView | null
  submit: (input: ProjectInput) => Promise<LmsResult>
  /** Present when the project accepts photo uploads. */
  upload?: UploadProjectFile
  /** Robotics capstone: pathway choice, code and photo evidence. */
  capstone?: boolean
  /** The simulator challenge tracks are finished (virtual pathway allowed). */
  virtualReady?: boolean
  /** Outside the capstone: invites screenshots under this heading. */
  uploadLabel?: string
}) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, startTransition] = React.useTransition()
  const [uploading, setUploading] = React.useState(false)
  const [editing, setEditing] = React.useState(!submission || submission.status === 'CHANGES_REQUESTED')
  const [form, setForm] = React.useState<ProjectInput>({
    note: submission?.note ?? '',
    linkUrl: submission?.linkUrl ?? '',
    code: submission?.code ?? '',
    pathway: submission?.pathway ?? 'PHYSICAL',
    fileKeys: submission?.fileKeys ?? [],
  })
  const [names, setNames] = React.useState<Record<string, string>>({})

  function send() {
    startTransition(async () => {
      const result = await submit(capstone ? form : { note: form.note, linkUrl: form.linkUrl, ...(uploadLabel ? { fileKeys: form.fileKeys } : {}) })
      push({ tone: result.ok ? 'success' : 'error', title: result.message })
      if (result.ok) {
        setEditing(false)
        router.refresh()
      }
    })
  }

  async function addFiles(files: FileList | null) {
    if (!files || !upload) return
    setUploading(true)
    try {
      for (const file of Array.from(files).slice(0, 4 - (form.fileKeys?.length ?? 0))) {
        const fd = new FormData()
        fd.set('file', file)
        const result = await upload(fd)
        if (!result.ok) {
          push({ tone: 'error', title: result.message })
          continue
        }
        setForm((f) => ({ ...f, fileKeys: [...(f.fileKeys ?? []), result.key] }))
        setNames((n) => ({ ...n, [result.key]: result.name }))
      }
    } finally {
      setUploading(false)
    }
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
            {capstone ? (
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-ink">How are you showing your robot?</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {PATHWAYS.map((p) => {
                    const disabled = p.id === 'VIRTUAL' && !virtualReady
                    return (
                      <label
                        key={p.id}
                        className={cn(
                          'cursor-pointer rounded-[var(--radius)] border p-3 text-sm',
                          form.pathway === p.id ? 'border-ink bg-surface-2' : 'border-line',
                          disabled && 'cursor-not-allowed opacity-60',
                        )}
                      >
                        <input type="radio" name="pathway" className="sr-only" checked={form.pathway === p.id} disabled={disabled} onChange={() => setForm((f) => ({ ...f, pathway: p.id }))} />
                        <span className="block font-medium text-ink">{p.title}</span>
                        <span className="mt-0.5 block text-xs text-ink-muted">{disabled ? 'Finish the S-curve and sharp-turns tracks in the simulator first.' : p.hint}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            ) : null}
            <Field label={capstone ? 'Tell your teacher about it' : 'What did you build?'} htmlFor="p-note" hint="What works, what was hard, and one problem you fixed">
              <Textarea id="p-note" rows={5} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </Field>
            {upload && (capstone ? form.pathway !== 'VIRTUAL' : !!uploadLabel) ? (
              <div>
                <p className="text-sm font-medium text-ink">{capstone ? 'Photos of your robot and track' : uploadLabel}</p>
                <p className="text-xs text-ink-muted">Up to 4 photos (JPG, PNG, WebP) or a PDF. Only you and your teachers can see them.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(form.fileKeys ?? []).map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs">
                      {names[k] ?? 'Photo'}
                      <button type="button" aria-label="Remove" onClick={() => setForm((f) => ({ ...f, fileKeys: (f.fileKeys ?? []).filter((x) => x !== k) }))}>
                        <X className="size-3" aria-hidden />
                      </button>
                    </span>
                  ))}
                  {(form.fileKeys?.length ?? 0) < 4 ? (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm hover:bg-surface-2">
                      <FileUp className="size-4" aria-hidden /> {uploading ? 'Uploading…' : 'Add photo'}
                      <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple className="sr-only" disabled={uploading} onChange={(e) => void addFiles(e.target.files)} />
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}
            {capstone ? (
              <Field label="Your final code" htmlFor="p-code" hint="Paste your line_follower sketch">
                <Textarea id="p-code" rows={6} className="font-mono text-xs" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
              </Field>
            ) : null}
            <Field
              label={capstone ? 'Video link (optional)' : 'Link to your work'}
              htmlFor="p-link"
              hint={
                capstone
                  ? 'A video of it working (Google Drive or unlisted YouTube), or your code on GitHub / Tinkercad. Make sure your teacher can open it.'
                  : 'A video or slides showing your work (Google Drive or unlisted YouTube). Make sure your teacher can open it.'
              }
            >
              <Input id="p-link" value={form.linkUrl} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} placeholder="https://" />
            </Field>
            <Button loading={pending} disabled={uploading} onClick={send}>
              <Send /> {submission ? 'Send again' : 'Send to teacher'}
            </Button>
          </>
        ) : submission ? (
          <div className="space-y-2 text-sm">
            {submission.pathway ? <p className="text-xs text-ink-subtle">Pathway: {PATHWAYS.find((p) => p.id === submission.pathway)?.title ?? submission.pathway}</p> : null}
            {submission.note ? <p className="whitespace-pre-wrap text-ink">{submission.note}</p> : null}
            {submission.fileKeys?.length ? (
              <div className="flex flex-wrap gap-2">
                {submission.fileKeys.map((k) =>
                  k.endsWith('.pdf') ? (
                    <a key={k} href={`/api/v1/files/${encodeURIComponent(k)}`} target="_blank" rel="noopener noreferrer" className="text-[var(--brand-600)] hover:underline">
                      PDF
                    </a>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={k} src={`/api/v1/files/${encodeURIComponent(k)}`} alt="Your project photo" className="size-24 rounded-[var(--radius)] border border-line object-cover" />
                  ),
                )}
              </div>
            ) : null}
            {submission.linkUrl ? (
              <a href={submission.linkUrl} target="_blank" rel="noopener noreferrer" className="break-all text-[var(--brand-600)] hover:underline">
                {submission.linkUrl}
              </a>
            ) : null}
            {submission.status === 'SUBMITTED' ? (
              <div className="pt-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  Change what I sent
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
