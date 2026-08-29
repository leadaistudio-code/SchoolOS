'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  createPeriod,
  deletePeriod,
  periodSchema,
  periodUpdateSchema,
  setSlot,
  slotSchema,
  updatePeriod,
} from '@/server/modules/timetable/service'

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

/**
 * Adds a period to the school day.
 *
 * Periods are the rows of every grid in the product, so until one exists the
 * timetable has nothing to draw. Kept on this page rather than in Settings
 * because the person building the timetable is the person who knows when the
 * bells go.
 */
export async function createPeriodAction(payload: unknown): Promise<SlotResult> {
  const ctx = await requireContext('timetable.manage')

  try {
    const created = await createPeriod(ctx, periodSchema.parse(payload))
    revalidatePath('/academics/timetable')
    return {
      ok: true,
      message: `${created.name} runs ${created.startTime}–${created.endTime}.`,
    }
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: err.issues[0]?.message ?? 'Invalid period' }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The period could not be saved',
    }
  }
}

export async function updatePeriodAction(payload: unknown): Promise<SlotResult> {
  const ctx = await requireContext('timetable.manage')

  try {
    const updated = await updatePeriod(ctx, periodUpdateSchema.parse(payload))
    revalidatePath('/academics/timetable')
    return {
      ok: true,
      message: `${updated.name} now runs ${updated.startTime}–${updated.endTime}.`,
    }
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: err.issues[0]?.message ?? 'Invalid period' }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The period could not be saved',
    }
  }
}

export async function deletePeriodAction(id: string): Promise<SlotResult> {
  const ctx = await requireContext('timetable.manage')

  try {
    const result = await deletePeriod(ctx, id)
    revalidatePath('/academics/timetable')
    return {
      ok: true,
      message:
        result.slotsRemoved > 0
          ? `Period removed, along with ${result.slotsRemoved} scheduled lesson${result.slotsRemoved === 1 ? '' : 's'}.`
          : 'Period removed.',
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The period could not be deleted',
    }
  }
}
