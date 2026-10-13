'use client'

import { useActionState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Upload } from 'lucide-react'
import { deleteDocumentAction, uploadDocumentAction } from '../actions'
import { emptyFormState } from '@/lib/form-state'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

export function UploadDocumentForm() {
  const [state, action, pending] = useActionState(uploadDocumentAction, emptyFormState)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state])

  return (
    <form ref={formRef} action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Field label="Title" htmlFor="title" hint="e.g. Proposal — Cosmos Public School. Defaults to the file name.">
        <Input id="title" name="title" maxLength={160} />
      </Field>
      <Field label="File" htmlFor="file" required error={state.fieldErrors.file} hint="PDF, Word, Excel or image">
        <Input
          id="file"
          name="file"
          type="file"
          required
          accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp,.csv,.txt"
          className="h-auto py-1.5 text-sm file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-surface-2 file:px-2.5 file:py-1 file:text-sm file:text-ink"
        />
      </Field>
      <Button type="submit" loading={pending}>
        <Upload aria-hidden /> Upload
      </Button>
    </form>
  )
}

export function DeleteDocumentButton({ id, title }: { id: string; title: string }) {
  const router = useRouter()
  const { push } = useToast()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      aria-label={`Remove ${title}`}
      onClick={() => {
        if (!window.confirm(`Remove “${title}” from the library? Emails that already carried it keep their copy.`)) return
        startTransition(async () => {
          const r = await deleteDocumentAction(id)
          push({ title: r.message, tone: r.ok ? 'success' : 'error' })
          router.refresh()
        })
      }}
    >
      <Trash2 aria-hidden />
    </Button>
  )
}
