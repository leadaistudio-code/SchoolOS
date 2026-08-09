'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { setSlot, slotSchema } from '@/server/modules/timetable/service'

export type SlotResult = { ok: boolean; message: string }

/** Sets or clears one timetable cell. Conflicts come back as a sentence. */
export async function setSlotAction(payload: unknown): Promise<SlotResult> {
  const ctx = await requireContext('timetable.manage')

  try {
    const input = slotSchema.parse(payload)
    const result = await setSlot(ctx, input)
    revalidatePath('/academics/timetable')
    return {
      ok: true,
      message: result ? 'The timetable has been updated.' : 'The slot is now free.',
    }
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: err.issues[0]?.message ?? 'Invalid slot' }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The slot could not be saved',
    }
  }
}
