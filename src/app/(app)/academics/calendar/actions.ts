'use server'

import { revalidatePath } from 'next/cache'
import { ZodError, z } from 'zod'
import { requireContext } from '@/server/context'
import {
  calendarEventSchema,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from '@/server/modules/academics/content-service'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

function fail(err: unknown, fallback: string): ActionResult {
  if (err instanceof ZodError) {
    return { ok: false, message: err.issues[0]?.message ?? fallback }
  }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

export async function createCalendarEventAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('calendar.manage')
  try {
    const created = await createCalendarEvent(ctx, calendarEventSchema.parse(payload))
    revalidatePath('/academics/calendar')
    return { ok: true, message: `"${created.title}" added to the calendar.` }
  } catch (err) {
    return fail(err, 'The event could not be added')
  }
}

export async function updateCalendarEventAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('calendar.manage')
  try {
    const raw = z.object({ id: z.string().min(1) }).passthrough().parse(payload)
    const { id, ...rest } = raw
    const updated = await updateCalendarEvent(ctx, id, calendarEventSchema.parse(rest))
    revalidatePath('/academics/calendar')
    return { ok: true, message: `"${updated.title}" updated.` }
  } catch (err) {
    return fail(err, 'The event could not be updated')
  }
}

export async function deleteCalendarEventAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('calendar.manage')
  try {
    await deleteCalendarEvent(ctx, id)
    revalidatePath('/academics/calendar')
    return { ok: true, message: 'Event removed from the calendar.' }
  } catch (err) {
    return fail(err, 'The event could not be removed')
  }
}
