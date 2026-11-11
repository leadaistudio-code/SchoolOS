'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import { lmsFail } from '@/server/modules/lms/authoring'
import { restoreCertificate, revokeCertificate } from '@/server/modules/lms/certificates'
import type { LmsResult } from '@/components/lms/types'

export async function revokeCertificateAction(id: string, reason: string): Promise<LmsResult> {
  const ctx = await requireContext('lms.manage')
  try {
    const row = await revokeCertificate(ctx, id, reason)
    revalidatePath('/lms/certificates', 'layout')
    revalidatePath('/my/learning', 'layout')
    return { ok: true, message: `${row.number} revoked. The verification page now shows it as revoked.` }
  } catch (err) {
    return lmsFail(err, 'The certificate could not be revoked')
  }
}

export async function restoreCertificateAction(id: string): Promise<LmsResult> {
  const ctx = await requireContext('lms.manage')
  try {
    const row = await restoreCertificate(ctx, id)
    revalidatePath('/lms/certificates', 'layout')
    revalidatePath('/my/learning', 'layout')
    return { ok: true, message: `${row.number} is valid again` }
  } catch (err) {
    return lmsFail(err, 'The certificate could not be restored')
  }
}
