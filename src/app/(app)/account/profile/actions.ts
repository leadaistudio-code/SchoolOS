'use server'

import { revalidatePath } from 'next/cache'
import { getContext } from '@/server/context'
import {
  getOwnProfile,
  removeOwnAvatar,
  setOwnAvatar,
  updateOwnProfile,
} from '@/server/modules/account/profile'
import { ApiException } from '@/server/api/response'

type ActionResult = { ok: boolean; message: string }

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const ctx = await getContext()
  if (!ctx) return { ok: false, message: 'Please sign in again.' }

  try {
    await updateOwnProfile(ctx, {
      firstName: String(formData.get('firstName') ?? ''),
      lastName: String(formData.get('lastName') ?? ''),
      displayName: String(formData.get('displayName') ?? ''),
      phone: String(formData.get('phone') ?? ''),
    })
    revalidatePath('/account/profile')
    revalidatePath('/', 'layout')
    return { ok: true, message: 'Profile saved.' }
  } catch (error) {
    if (error instanceof ApiException) {
      return { ok: false, message: error.message }
    }
    return { ok: false, message: 'Could not save your profile.' }
  }
}

export async function uploadOwnAvatarAction(formData: FormData): Promise<{
  ok: boolean
  message: string
  photoUrl?: string
}> {
  const ctx = await getContext()
  if (!ctx) return { ok: false, message: 'Please sign in again.' }
  const file = formData.get('file')
  if (!(file instanceof File) || !file.size) {
    return { ok: false, message: 'Choose a photo to upload.' }
  }
  try {
    const { avatarUrl } = await setOwnAvatar(ctx, file)
    revalidatePath('/account/profile')
    revalidatePath('/', 'layout')
    return { ok: true, message: 'Photo updated.', photoUrl: avatarUrl }
  } catch (error) {
    if (error instanceof ApiException) {
      return { ok: false, message: error.message }
    }
    return { ok: false, message: 'Could not upload the photo.' }
  }
}

export async function removeOwnAvatarAction(): Promise<{
  ok: boolean
  message: string
  photoUrl?: string
}> {
  const ctx = await getContext()
  if (!ctx) return { ok: false, message: 'Please sign in again.' }
  try {
    await removeOwnAvatar(ctx)
    revalidatePath('/account/profile')
    revalidatePath('/', 'layout')
    return { ok: true, message: 'Photo removed.' }
  } catch (error) {
    if (error instanceof ApiException) {
      return { ok: false, message: error.message }
    }
    return { ok: false, message: 'Could not remove the photo.' }
  }
}

/** Used by the page for typed loading — not a form action. */
export async function loadOwnProfile() {
  const ctx = await getContext()
  if (!ctx) return null
  return getOwnProfile(ctx)
}
