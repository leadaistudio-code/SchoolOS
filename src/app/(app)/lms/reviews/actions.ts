'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import { lmsFail } from '@/server/modules/lms/authoring'
import { reviewProject } from '@/server/modules/lms/projects'
import type { LmsResult } from '@/components/lms/types'

export async function reviewProjectAction(id: string, input: unknown): Promise<LmsResult> {
  const ctx = await requireContext('lms.teach')
  try {
    const decision = await reviewProject(ctx, id, input as never)
    revalidatePath('/lms', 'layout')
    revalidatePath('/my/learning', 'layout')
    return { ok: true, message: decision === 'APPROVED' ? 'Approved. The lesson is complete for the student.' : 'Sent back with your feedback.' }
  } catch (err) {
    return lmsFail(err, 'The review could not be saved')
  }
}
