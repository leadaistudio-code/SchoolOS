'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import { setStudentPhoto, removeStudentPhoto } from '@/server/modules/students/photo'

/**
 * The profile-photo write path, bound to one student.
 *
 * The id is bound in the page (`uploadStudentPhotoAction.bind(null, id)`) rather
 * than read from a form field, so a form cannot be edited to aim the upload at
 * another child. Everything the service throws — wrong file type, over the size
 * cap, no access to this student — comes back as `{ ok:false }` with the reason,
 * which is what the avatar shows in its toast.
 */

type PhotoResult = { ok: boolean; message: string; photoUrl?: string }

export async function uploadStudentPhotoAction(
  id: string,
  formData: FormData,
): Promise<PhotoResult> {
  const ctx = await requireContext('students.edit')
  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose an image to upload' }
  }

  try {
    const { photoUrl } = await setStudentPhoto(ctx, id, file)
    revalidatePath(`/students/${id}`)
    revalidatePath('/students')
    return { ok: true, message: 'Photo updated.', photoUrl }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The photo could not be uploaded',
    }
  }
}

export async function removeStudentPhotoAction(id: string): Promise<PhotoResult> {
  const ctx = await requireContext('students.edit')

  try {
    await removeStudentPhoto(ctx, id)
    revalidatePath(`/students/${id}`)
    revalidatePath('/students')
    return { ok: true, message: 'Photo removed.' }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The photo could not be removed',
    }
  }
}
