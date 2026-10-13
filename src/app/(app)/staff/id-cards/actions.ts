'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { saveIdCardSettings } from '@/server/modules/id-cards/settings'
import type { IdCardSettings } from '@/lib/id-cards/designs'

export async function saveStaffIdCardDesignAction(settings: IdCardSettings) {
  const ctx = await requireContext('staff.id_cards')
  try {
    await saveIdCardSettings(ctx, 'staff', settings)
    revalidatePath('/staff/id-cards')
    return { ok: true, message: 'Staff ID card design saved.' }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof ZodError ? (err.issues[0]?.message ?? 'Invalid design') : err instanceof Error ? err.message : 'Could not save',
    }
  }
}
