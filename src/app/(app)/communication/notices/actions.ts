'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { createNotice, noticeCreateSchema } from '@/server/modules/notices/service'
import type { FormState } from '@/lib/form-state'

export async function createNoticeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('notices.create')

  let id: string
  try {
    const raw = Object.fromEntries(formData.entries()) as Record<string, unknown>
    raw.isPublished = formData.get('isPublished') === 'on'
    raw.pinned = formData.get('pinned') === 'on'
    raw.notifyNow = formData.get('notifyNow') === 'on'
    for (const key of ['expiresOn', 'roleKey', 'classLevelId', 'sectionId']) {
      if (!raw[key]) delete raw[key]
    }

    const notice = await createNotice(ctx, noticeCreateSchema.parse(raw))
    id = notice.id
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of err.issues) fieldErrors[issue.path.join('.')] = issue.message
      return { error: 'Please correct the highlighted fields', fieldErrors }
    }
    return {
      error: err instanceof Error ? err.message : 'The notice could not be posted',
      fieldErrors: {},
    }
  }

  revalidatePath('/communication/notices')
  redirect(`/communication/notices/${id}`)
}
