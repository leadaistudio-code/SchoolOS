'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  deleteStudentDocument,
  documentStudentOptions,
  setDocumentVerified,
  uploadStudentDocument,
} from '@/server/modules/students/documents'
import { studentDocumentCreateSchema } from '@/server/modules/students/schema'

type Result = { ok: boolean; message: string }

function message(err: unknown, fallback: string): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? fallback
  return err instanceof Error ? err.message : fallback
}

/**
 * The upload goes through FormData rather than a JSON payload because the file
 * itself has to travel with it, and a server action is the only path that
 * carries bytes without the browser first having to ask for an upload URL.
 */
export async function uploadStudentDocumentAction(formData: FormData): Promise<Result> {
  const ctx = await requireContext('documents.manage')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose a file to upload' }
  }

  try {
    const expiresOn = String(formData.get('expiresOn') ?? '')
    const input = studentDocumentCreateSchema.parse({
      studentId: formData.get('studentId'),
      category: formData.get('category'),
      title: formData.get('title'),
      ...(expiresOn ? { expiresOn } : {}),
    })

    await uploadStudentDocument(ctx, input, file)

    revalidatePath('/students/documents')
    revalidatePath(`/students/${input.studentId}`)

    return { ok: true, message: `${input.title} is on file.` }
  } catch (err) {
    return { ok: false, message: message(err, 'The document could not be uploaded') }
  }
}

export async function setDocumentVerifiedAction(
  id: string,
  isVerified: boolean,
  studentId?: string,
): Promise<Result> {
  const ctx = await requireContext('documents.manage')

  try {
    await setDocumentVerified(ctx, id, isVerified)
    revalidatePath('/students/documents')
    if (studentId) revalidatePath(`/students/${studentId}`)
    return {
      ok: true,
      message: isVerified ? 'Marked as checked against the original.' : 'Verification removed.',
    }
  } catch (err) {
    return { ok: false, message: message(err, 'Could not update the document') }
  }
}

export async function deleteStudentDocumentAction(
  id: string,
  studentId?: string,
): Promise<Result> {
  const ctx = await requireContext('documents.manage')

  try {
    await deleteStudentDocument(ctx, id)
    revalidatePath('/students/documents')
    if (studentId) revalidatePath(`/students/${studentId}`)
    return { ok: true, message: 'The document and its file have been removed.' }
  } catch (err) {
    return { ok: false, message: message(err, 'Could not remove the document') }
  }
}

/** Type-ahead for the upload dialog's student picker. */
export async function searchDocumentStudentsAction(
  search: string,
): Promise<{ id: string; label: string }[]> {
  const ctx = await requireContext('documents.view')
  const trimmed = search.trim()
  return documentStudentOptions(ctx, trimmed.length >= 2 ? trimmed : undefined)
}
