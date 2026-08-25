'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import { setStaffPhoto, removeStaffPhoto } from '@/server/modules/staff/photo'

/**
 * The staff profile-photo write path, bound to one staff member.
 *
 * The student action's twin: same bound-id safety, same `{ ok, message }`
 * contract, gated on `staff.edit` rather than `students.edit`.
 */

type PhotoResult = { ok: boolean; message: string; photoUrl?: string }

export async function uploadStaffPhotoAction(
  id: string,
  formData: FormData,
): Promise<PhotoResult> {
  const ctx = await requireContext('staff.edit')
  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose an image to upload' }
  }

  try {
    const { photoUrl } = await setStaffPhoto(ctx, id, file)
    revalidatePath(`/staff/${id}`)
    revalidatePath('/staff')
    return { ok: true, message: 'Photo updated.', photoUrl }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The photo could not be uploaded',
    }
  }
}

export async function removeStaffPhotoAction(id: string): Promise<PhotoResult> {
  const ctx = await requireContext('staff.edit')

  try {
    await removeStaffPhoto(ctx, id)
    revalidatePath(`/staff/${id}`)
    revalidatePath('/staff')
    return { ok: true, message: 'Photo removed.' }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The photo could not be removed',
    }
  }
}
