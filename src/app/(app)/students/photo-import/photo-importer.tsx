'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Upload } from 'lucide-react'
import { unzipSync } from 'fflate'
import { uploadStudentPhotoAction } from '../[id]/photo-actions'
import { uploadStaffPhotoAction } from '../../staff/[id]/photo-actions'
import { downloadCsv } from '@/components/bulk-selection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

type Person = {
  id: string
  identifier: string
  name: string
  photoUrl: string | null
}

type UploadStatus =
  | 'READY'
  | 'UNMATCHED'
  | 'DUPLICATE'
  | 'INVALID'
  | 'UPLOADING'
  | 'DONE'
  | 'FAILED'

type PreparedPhoto = {
  key: string
  file: File
  sourceName: string
  identifier: string
  person: Person | null
  status: UploadStatus
  message?: string
}

const IMAGE_EXTENSION = /\.(jpe?g|png|webp)$/i
const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function basename(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

function identifierFromFilename(path: string) {
  return basename(path).replace(/\.[^.]+$/, '').trim()
}

function normalizeIdentifier(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function preparePhotos(files: File[], people: Person[]): PreparedPhoto[] {
  const directory = new Map<string, Person | null>()
  for (const person of people) {
    const normalized = normalizeIdentifier(person.identifier)
    directory.set(normalized, directory.has(normalized) ? null : person)
  }

  const identifierCounts = new Map<string, number>()
  for (const file of files) {
    const normalized = normalizeIdentifier(identifierFromFilename(file.name))
    identifierCounts.set(normalized, (identifierCounts.get(normalized) ?? 0) + 1)
  }

  return files.map((file) => {
    const identifier = identifierFromFilename(file.name)
    const normalized = normalizeIdentifier(identifier)
    const person = directory.get(normalized)
    if (!IMAGE_EXTENSION.test(file.name) || !file.type.startsWith('image/')) {
      return {
        key: crypto.randomUUID(),
        file,
        sourceName: file.name,
        identifier,
        person: null,
        status: 'INVALID',
        message: 'Only JPEG, PNG and WebP images are supported',
      }
    }
    if (!normalized || person === undefined) {
      return {
        key: crypto.randomUUID(),
        file,
        sourceName: file.name,
        identifier,
        person: null,
        status: 'UNMATCHED',
        message: 'No matching admission number or employee code',
      }
    }
    if (person === null) {
      return {
        key: crypto.randomUUID(),
        file,
        sourceName: file.name,
        identifier,
        person: null,
        status: 'UNMATCHED',
        message: 'The identifier is duplicated in the school directory',
      }
    }
    if ((identifierCounts.get(normalized) ?? 0) > 1) {
      return {
        key: crypto.randomUUID(),
        file,
        sourceName: file.name,
        identifier,
        person,
        status: 'DUPLICATE',
        message: 'More than one selected file uses this identifier',
      }
    }
    return {
      key: crypto.randomUUID(),
      file,
      sourceName: file.name,
      identifier,
      person,
      status: 'READY',
    }
  })
}

async function filesFromSelection(selected: File[]) {
  const archives = selected.filter((file) => file.name.toLowerCase().endsWith('.zip'))
  if (archives.length > 0 && selected.length > 1) {
    throw new Error('Choose one ZIP file, or select multiple image files without a ZIP')
  }
  if (archives.length === 0) return selected

  const archive = archives[0]!
  if (archive.size > 200 * 1024 * 1024) {
    throw new Error('The ZIP file must be smaller than 200 MB')
  }

  const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()))
  const files: File[] = []
  let totalBytes = 0
  for (const [path, bytes] of Object.entries(entries)) {
    if (
      path.endsWith('/') ||
      path.includes('__MACOSX') ||
      basename(path).startsWith('.') ||
      !IMAGE_EXTENSION.test(path)
    ) {
      continue
    }
    totalBytes += bytes.byteLength
    if (files.length >= 1000 || totalBytes > 500 * 1024 * 1024) {
      throw new Error('The ZIP contains too many files or more than 500 MB of images')
    }
    const extension = path.split('.').pop()?.toLowerCase() ?? ''
    files.push(new File([bytes], basename(path), { type: MIME[extension] ?? '' }))
  }
  return files
}

async function optimizedProfilePhoto(file: File): Promise<File> {
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    )
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
      type: 'image/webp',
      lastModified: file.lastModified,
    })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}

export function BulkPhotoImporter({
  students,
  staff,
  canUploadStudents,
  canUploadStaff,
}: {
  students: Person[]
  staff: Person[]
  canUploadStudents: boolean
  canUploadStaff: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const initialMode = canUploadStudents ? 'STUDENT' : 'STAFF'
  const [mode, setMode] = React.useState<'STUDENT' | 'STAFF'>(initialMode)
  const [photos, setPhotos] = React.useState<PreparedPhoto[]>([])
  const [preparing, setPreparing] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)

  const people = mode === 'STUDENT' ? students : staff
  const ready = photos.filter((photo) => photo.status === 'READY')
  const done = photos.filter((photo) => photo.status === 'DONE').length
  const failed = photos.filter((photo) => photo.status === 'FAILED')
  const unmatched = photos.filter((photo) =>
    ['UNMATCHED', 'DUPLICATE', 'INVALID'].includes(photo.status),
  )
  const replacements = ready.filter((photo) => photo.person?.photoUrl).length

  const choose = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (selected.length === 0) return
    setPreparing(true)
    try {
      const files = await filesFromSelection(selected)
      if (files.length === 0) throw new Error('No JPEG, PNG or WebP images were found')
      setPhotos(preparePhotos(files, people))
    } catch (error) {
      toast.push({
        tone: 'error',
        title: 'Could not read these files',
        description: error instanceof Error ? error.message : 'The files could not be prepared',
      })
    } finally {
      setPreparing(false)
    }
  }

  const updatePhoto = (key: string, update: Partial<PreparedPhoto>) =>
    setPhotos((current) =>
      current.map((photo) => (photo.key === key ? { ...photo, ...update } : photo)),
    )

  const upload = async () => {
    if (ready.length === 0) return
    if (
      replacements > 0 &&
      !window.confirm(
        `${replacements} selected people already have a photo. Continue and replace those photos?`,
      )
    ) {
      return
    }

    setUploading(true)
    let successCount = 0
    for (let offset = 0; offset < ready.length; offset += 4) {
      const batch = ready.slice(offset, offset + 4)
      await Promise.all(
        batch.map(async (photo) => {
          updatePhoto(photo.key, { status: 'UPLOADING', message: undefined })
          try {
            const formData = new FormData()
            formData.set('file', await optimizedProfilePhoto(photo.file))
            const result =
              mode === 'STUDENT'
                ? await uploadStudentPhotoAction(photo.person!.id, formData)
                : await uploadStaffPhotoAction(photo.person!.id, formData)
            if (result.ok) {
              successCount += 1
              updatePhoto(photo.key, { status: 'DONE', message: result.message })
            } else {
              updatePhoto(photo.key, { status: 'FAILED', message: result.message })
            }
          } catch (error) {
            updatePhoto(photo.key, {
              status: 'FAILED',
              message: error instanceof Error ? error.message : 'The upload failed',
            })
          }
        }),
      )
    }
    setUploading(false)
    router.refresh()
    toast.push({
      tone: successCount === ready.length ? 'success' : 'error',
      title: `${successCount} photo${successCount === 1 ? '' : 's'} uploaded`,
      description:
        successCount === ready.length
          ? 'Every matched photo was updated.'
          : `${ready.length - successCount} upload${ready.length - successCount === 1 ? '' : 's'} failed. Review the report below.`,
    })
  }

  const statusTone = (status: UploadStatus) => {
    if (status === 'DONE') return 'success' as const
    if (status === 'READY') return 'info' as const
    if (status === 'UPLOADING') return 'warning' as const
    return 'danger' as const
  }

  return (
    <Card variant="elevated" className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Upload profile photos</CardTitle>
          <p className="mt-0.5 text-sm text-ink-muted">
            Files are matched locally first. Only confirmed matches are uploaded.
          </p>
        </div>
        <Select
          aria-label="Photo type"
          value={mode}
          className="w-44"
          disabled={uploading}
          onChange={(event) => {
            setMode(event.target.value as 'STUDENT' | 'STAFF')
            setPhotos([])
          }}
        >
          {canUploadStudents ? <option value="STUDENT">Student photos</option> : null}
          {canUploadStaff ? <option value="STAFF">Staff photos</option> : null}
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept=".zip,image/jpeg,image/png,image/webp"
          multiple
          onChange={choose}
        />

        <button
          type="button"
          disabled={preparing || uploading}
          onClick={() => inputRef.current?.click()}
          className="grid min-h-36 w-full place-items-center rounded-[var(--radius)] border border-dashed border-[var(--product-300)] bg-[var(--product-50)] p-6 text-center transition-colors hover:bg-[var(--product-100)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>
            <span className="mx-auto grid size-11 place-items-center rounded-full bg-white text-[var(--product-600)]">
              {preparing ? <Archive className="size-5" aria-hidden /> : <Upload className="size-5" aria-hidden />}
            </span>
            <span className="mt-3 block text-sm font-semibold text-ink">
              {preparing ? 'Reading files…' : 'Choose a ZIP or multiple images'}
            </span>
            <span className="mt-1 block text-xs text-ink-muted">
              Matching against {people.length} active {mode === 'STUDENT' ? 'students' : 'staff members'}
            </span>
          </span>
        </button>

        {photos.length === 0 ? (
          <EmptyState
            title="No photos selected"
            description="The preview will show exactly which people match before anything is uploaded."
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Summary label="Matched" value={ready.length + done} tone="success" />
              <Summary label="Need attention" value={unmatched.length} tone={unmatched.length ? 'danger' : 'neutral'} />
              <Summary label="Will replace" value={replacements} tone={replacements ? 'warning' : 'neutral'} />
              <Summary label="Uploaded" value={done} tone={done ? 'success' : 'neutral'} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={upload}
                loading={uploading}
                disabled={ready.length === 0 || uploading}
              >
                <Upload aria-hidden />
                Upload {ready.length} matched photo{ready.length === 1 ? '' : 's'}
              </Button>
              {failed.length > 0 || unmatched.length > 0 ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadCsv(
                      'bulk-photo-upload-errors.csv',
                      ['File', 'Identifier', 'Status', 'Reason'],
                      [...unmatched, ...failed].map((photo) => [
                        photo.sourceName,
                        photo.identifier,
                        photo.status,
                        photo.message,
                      ]),
                    )
                  }
                >
                  Download error report
                </Button>
              ) : null}
              <Button variant="ghost" disabled={uploading} onClick={() => setPhotos([])}>
                Clear
              </Button>
            </div>

            <div className="max-h-[32rem] overflow-auto rounded-[var(--radius)] border border-line">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface-2">
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold text-ink-muted">File</th>
                    <th className="px-3 py-2 text-xs font-semibold text-ink-muted">Matched person</th>
                    <th className="px-3 py-2 text-xs font-semibold text-ink-muted">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {photos.map((photo) => (
                    <tr key={photo.key}>
                      <td className="px-3 py-2">
                        <span className="block max-w-64 truncate text-ink">{photo.sourceName}</span>
                        <span className="text-xs text-ink-subtle">{photo.identifier}</span>
                      </td>
                      <td className="px-3 py-2">
                        {photo.person ? (
                          <>
                            <span className="block text-ink">{photo.person.name}</span>
                            <span className="text-xs text-ink-subtle">{photo.person.identifier}</span>
                          </>
                        ) : (
                          <span className="text-ink-subtle">No match</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={statusTone(photo.status)}>
                          {photo.status.toLowerCase()}
                        </Badge>
                        {photo.message ? (
                          <span className="ml-2 text-xs text-ink-muted">{photo.message}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'success' | 'danger' | 'warning' | 'neutral'
}) {
  const color = {
    success: 'text-success',
    danger: 'text-[var(--danger)]',
    warning: 'text-warning',
    neutral: 'text-ink',
  }[tone]
  return (
    <div className="rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2.5">
      <p className={`text-xl font-semibold tnum ${color}`}>{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  )
}
