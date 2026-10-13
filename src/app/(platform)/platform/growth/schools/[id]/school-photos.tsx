'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { addSchoolPhotosAction, deleteCrmPhotoAction } from '../../actions'
import { PhotoPicker } from '../../photo-picker'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/states'

type Photo = { id: string; label: string }

const src = (id: string) => `/api/v1/platform/crm/photos/${id}?view=1`

export function SchoolPhotos({ schoolId, photos, canEdit }: { schoolId: string; photos: Photo[]; canEdit: boolean }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [pickerKey, setPickerKey] = useState(0)

  function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (fd.getAll('photos').every((f) => typeof f === 'string' || f.size === 0)) {
      setMsg({ tone: 'danger', text: 'Take or choose a photo first' })
      return
    }
    start(async () => {
      const res = await addSchoolPhotosAction(schoolId, fd)
      setMsg(res.error ? { tone: 'danger', text: res.error } : { tone: 'success', text: res.message ?? 'Added' })
      if (!res.error) setPickerKey((k) => k + 1)
    })
  }

  function remove(id: string) {
    if (!confirm('Remove this photo?')) return
    start(async () => {
      const res = await deleteCrmPhotoAction(id)
      setMsg(res.error ? { tone: 'danger', text: res.error } : null)
    })
  }

  return (
    <div className="space-y-4">
      {photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id} className="group relative overflow-hidden rounded-[var(--radius-sm)] border border-line bg-surface-2">
              <a href={src(p.id)} target="_blank" rel="noreferrer" className="block aspect-[4/3]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src(p.id)} alt={p.label} loading="lazy" className="size-full object-cover" />
              </a>
              <div className="flex items-center justify-between gap-1 px-2 py-1">
                <span className="truncate text-xs text-ink-subtle">{p.label}</span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    disabled={pending}
                    aria-label="Remove photo"
                    className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-ink-subtle hover:bg-surface hover:text-[var(--danger)]"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">No photos yet.</p>
      )}

      {canEdit ? (
        <form onSubmit={upload} className="space-y-3 border-t border-line pt-4">
          <PhotoPicker key={pickerKey} />
          <Button type="submit" variant="secondary" loading={pending} block>
            Upload photos
          </Button>
        </form>
      ) : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </div>
  )
}
