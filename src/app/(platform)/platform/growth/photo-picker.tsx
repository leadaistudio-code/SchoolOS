'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'

const MAX_EDGE = 1600
const QUALITY = 0.8

/** Phone photos are 3–8 MB; a 1600px JPEG keeps the detail and uploads in seconds on 4G. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    if (!blob || blob.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

type Picked = { file: File; url: string }

/**
 * Camera + gallery picker that submits as `name` on the surrounding form.
 * The shrunk files are written into a hidden file input, so the form posts
 * them like any other field.
 */
export function PhotoPicker({ name = 'photos', max = 6 }: { name?: string; max?: number }) {
  const [items, setItems] = useState<Picked[]>([])
  const [busy, setBusy] = useState(false)
  const hidden = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!hidden.current) return
    const dt = new DataTransfer()
    for (const it of items) dt.items.add(it.file)
    hidden.current.files = dt.files
  }, [items])

  useEffect(() => () => items.forEach((it) => URL.revokeObjectURL(it.url)), []) // eslint-disable-line react-hooks/exhaustive-deps

  async function add(list: FileList | null) {
    if (!list || list.length === 0) return
    setBusy(true)
    const room = Math.max(0, max - items.length)
    const shrunk = await Promise.all(Array.from(list).slice(0, room).map(shrink))
    setItems((prev) => [...prev, ...shrunk.map((file) => ({ file, url: URL.createObjectURL(file) }))])
    setBusy(false)
  }

  function remove(i: number) {
    setItems((prev) => {
      URL.revokeObjectURL(prev[i]!.url)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  const full = items.length >= max

  return (
    <div className="space-y-3">
      <input ref={hidden} type="file" name={name} multiple hidden tabIndex={-1} aria-hidden />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void add(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          void add(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={full || busy}
          onClick={() => camera.current?.click()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
        >
          <Camera className="size-4.5" aria-hidden /> Take photo
        </button>
        <button
          type="button"
          disabled={full || busy}
          onClick={() => gallery.current?.click()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
        >
          <ImagePlus className="size-4.5" aria-hidden /> From gallery
        </button>
      </div>
      {items.length > 0 || busy ? (
        <ul className="grid grid-cols-3 gap-2">
          {items.map((it, i) => (
            <li key={it.url} className="relative aspect-square overflow-hidden rounded-[var(--radius-sm)] border border-line bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.url} alt={`Photo ${i + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
          {busy ? (
            <li className="grid aspect-square place-items-center rounded-[var(--radius-sm)] border border-dashed border-line text-xs text-ink-subtle">
              Preparing…
            </li>
          ) : null}
        </ul>
      ) : null}
      <p className="text-xs text-ink-subtle">
        {items.length}/{max} photos · school front, notice board, prospectus or fee card
      </p>
    </div>
  )
}
