'use client'

import * as React from 'react'
import { PenLine, Trash2, Upload } from 'lucide-react'
import { uploadReportCardSignatureAction } from '../actions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Upload / replace / remove one signatory's signature image. The image is
 * stored on upload; the template only uses it once the surrounding form or
 * design studio is saved.
 */
export function SignatureUpload({
  value,
  onChange,
  label,
}: {
  value: string | null
  onChange: (url: string | null) => void
  label: string
}) {
  const toast = useToast()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [pending, start] = React.useTransition()

  const onFile = (file: File | null | undefined) => {
    if (inputRef.current) inputRef.current.value = ''
    if (!file?.size) return
    const form = new FormData()
    form.set('file', file)
    start(async () => {
      const result = await uploadReportCardSignatureAction(form)
      toast.push({ tone: result.ok ? 'success' : 'error', title: result.ok ? 'Signature uploaded' : 'Upload failed', description: result.message })
      if (result.ok && result.url) onChange(result.url)
    })
  }

  return (
    <div className="space-y-1.5">
      <div className="grid h-16 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-dashed border-line bg-white">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={`${label} signature`} className="max-h-14 max-w-full object-contain" />
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-ink-subtle">
            <PenLine className="size-3.5" aria-hidden /> No signature
          </span>
        )}
      </div>
      <div className="flex gap-1.5">
        <Button type="button" variant="secondary" size="sm" className="flex-1" loading={pending} onClick={() => inputRef.current?.click()}>
          {!pending ? <Upload className="size-3.5" aria-hidden /> : null}
          {value ? 'Replace' : 'Upload'}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={pending} aria-label={`Remove ${label} signature`}>
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </div>
  )
}
