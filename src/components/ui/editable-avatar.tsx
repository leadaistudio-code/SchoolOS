'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, X } from 'lucide-react'
import { Avatar } from './identity'
import { useToast } from './toast'

/**
 * The profile-header avatar, made editable in place.
 *
 * When the viewer cannot edit this record it is a plain `Avatar` — no label, no
 * input, nothing to tab into — so the control is genuinely absent rather than
 * hidden with CSS. When they can, the avatar itself is the file picker: click
 * the face, choose an image, and a hover overlay plus a spinner say what is
 * happening. The actions arrive pre-bound to one person's id from the server
 * component, so this stays a dumb control that cannot be pointed at anyone else.
 *
 * Mirrors `AssetUploadField` in `settings/branding/branding-form.tsx`: same
 * `FormData` shape, same toast-then-refresh on success.
 */

type PhotoResult = { ok: boolean; message: string; photoUrl?: string }

export function EditableAvatar({
  firstName,
  lastName,
  photoUrl,
  canEdit,
  uploadAction,
  removeAction,
}: {
  firstName: string
  lastName: string
  photoUrl: string | null
  canEdit: boolean
  /** Pre-bound to the record's id in the page (`action.bind(null, id)`). */
  uploadAction: (formData: FormData) => Promise<PhotoResult>
  removeAction: () => Promise<PhotoResult>
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = React.useTransition()
  const inputRef = React.useRef<HTMLInputElement>(null)

  if (!canEdit) {
    return (
      <Avatar
        firstName={firstName}
        lastName={lastName}
        avatarUrl={photoUrl}
        className="size-20 text-2xl"
      />
    )
  }

  const onFile = (file: File | null | undefined) => {
    // Let the picker be reopened with the same file after a failure.
    if (inputRef.current) inputRef.current.value = ''
    if (!file?.size) return
    const form = new FormData()
    form.set('file', file)
    startTransition(async () => {
      const result = await uploadAction(form)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Photo updated' : 'Upload failed',
        description: result.message,
      })
      if (result.ok) router.refresh()
    })
  }

  const onRemove = () => {
    startTransition(async () => {
      const result = await removeAction()
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Photo removed' : 'Could not remove photo',
        description: result.message,
      })
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-2">
      <label
        className="group relative size-20 shrink-0 cursor-pointer rounded-full"
        title="Upload or replace photo"
      >
        <Avatar
          firstName={firstName}
          lastName={lastName}
          avatarUrl={photoUrl}
          className="size-20 text-2xl"
        />
        <span
          className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        >
          {pending ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <Camera className="size-6" />
          )}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <span className="sr-only">Upload or replace photo</span>
      </label>

      {photoUrl ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          className="text-ink-subtle transition-colors hover:text-[var(--danger)] disabled:opacity-50"
          title="Remove photo"
          aria-label="Remove photo"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
