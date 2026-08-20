'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'
import {
  DOCUMENT_ACCEPT,
  STUDENT_DOCUMENT_CATEGORIES,
  documentCategory,
} from '@/lib/student-documents'
import { searchDocumentStudentsAction, uploadStudentDocumentAction } from './actions'

/**
 * Upload dialog.
 *
 * The student is chosen by searching rather than from a full list: a school of
 * two thousand children cannot be a `<select>`, and the person filing a birth
 * certificate has the child's name in front of them, not their position in an
 * alphabetical list.
 *
 * When the dialog is opened from a student's own record the picker collapses
 * to a fixed label — there is nothing to choose, and offering the choice would
 * invite filing the paper against the wrong child.
 */
export function UploadDocumentDialog({
  student,
  label = 'Upload document',
  variant = 'primary',
  maxUploadMb,
}: {
  /** Fixes the document to one student. Omit for the searchable picker. */
  student?: { id: string; name: string }
  label?: string
  variant?: 'primary' | 'secondary' | 'ghost'
  maxUploadMb: number
}) {
  const router = useRouter()
  const toast = useToast()

  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const [studentId, setStudentId] = React.useState(student?.id ?? '')
  const [search, setSearch] = React.useState('')
  const [options, setOptions] = React.useState<{ id: string; label: string }[]>([])
  const [searching, setSearching] = React.useState(false)

  const [category, setCategory] = React.useState(STUDENT_DOCUMENT_CATEGORIES[0]!.key)
  const [title, setTitle] = React.useState('')
  const [expiresOn, setExpiresOn] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const selected = documentCategory(category)

  // Search only once typing has settled, and only from two characters: a
  // request per keystroke against a table of thousands is a request per
  // keystroke nobody reads the answer to.
  React.useEffect(() => {
    if (student || !open) return
    const q = search.trim()
    if (q.length < 2) {
      setOptions([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      const rows = await searchDocumentStudentsAction(q)
      if (!cancelled) {
        setOptions(rows)
        setSearching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [search, open, student])

  // The document name defaults to its type, so the common case is one click.
  // Typing over it wins, which is why this only fires while the field is
  // untouched or still holds a previous default.
  React.useEffect(() => {
    const labels = STUDENT_DOCUMENT_CATEGORIES.map((c) => c.label)
    setTitle((current) => (current === '' || labels.includes(current) ? (selected?.label ?? '') : current))
  }, [selected])

  const reset = () => {
    setStudentId(student?.id ?? '')
    setSearch('')
    setOptions([])
    setCategory(STUDENT_DOCUMENT_CATEGORIES[0]!.key)
    setTitle('')
    setExpiresOn('')
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = () =>
    startTransition(async () => {
      if (!file) return
      const form = new FormData()
      form.set('studentId', studentId)
      form.set('category', category)
      form.set('title', title.trim())
      if (expiresOn) form.set('expiresOn', expiresOn)
      form.set('file', file)

      const result = await uploadStudentDocumentAction(form)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Document uploaded' : 'Upload failed',
        description: result.message,
      })
      if (result.ok) {
        setOpen(false)
        reset()
        router.refresh()
      }
    })

  const ready = Boolean(studentId && category && title.trim() && file)

  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden /> {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Upload a document"
        description={
          student
            ? `Filed against ${student.name}.`
            : 'Find the student, say what the paper is, and attach it.'
        }
        footer={
          <>
            <Button onClick={submit} loading={pending} disabled={!ready}>
              <Upload aria-hidden />
              Upload
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {student ? null : (
            <Field
              label="Student"
              htmlFor="doc-student-search"
              required
              hint="Type at least two letters of a name or an admission number"
            >
              <Input
                id="doc-student-search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setStudentId('')
                }}
                placeholder="Name or admission number"
                autoComplete="off"
              />
            </Field>
          )}

          {student || search.trim().length < 2 ? null : (
            <Select
              aria-label="Matching students"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">
                {searching
                  ? 'Searching…'
                  : options.length === 0
                    ? 'Nobody matches that'
                    : `${options.length} match${options.length === 1 ? '' : 'es'} — choose one`}
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="doc-category" required hint={selected?.hint}>
              <Select
                id="doc-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {STUDENT_DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                    {c.required ? ' *' : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Name on file"
              htmlFor="doc-title"
              required
              hint="What this paper is called when someone goes looking for it"
            >
              <Input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
              />
            </Field>
          </div>

          {selected?.expires ? (
            <Field
              label="Valid until"
              htmlFor="doc-expires"
              hint="Leave blank if it does not expire. Expiring papers are flagged 45 days ahead."
            >
              <Input
                id="doc-expires"
                type="date"
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
              />
            </Field>
          ) : null}

          <Field
            label="File"
            htmlFor="doc-file"
            required
            hint={`PDF, Word, JPEG, PNG or WebP · up to ${maxUploadMb}MB`}
          >
            <Input
              id="doc-file"
              ref={fileRef}
              type="file"
              accept={DOCUMENT_ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-2 file:rounded-[var(--radius-sm)] file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs"
            />
          </Field>

          <Notice tone="info">
            Documents are private to staff who hold the documents permission. Every download is
            checked and recorded, and the file is never reachable by its address alone.
          </Notice>
        </div>
      </Dialog>
    </>
  )
}
