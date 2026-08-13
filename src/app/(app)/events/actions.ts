'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { emptyFormState, type FormState } from '@/lib/form-state'
import {
  createEvent,
  registerParticipant,
  unregisterParticipant,
} from '@/server/modules/events/service'
import { eventSchema } from '@/server/modules/events/schema'

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Please correct the highlighted fields', fieldErrors }
  }
  if (error instanceof ApiException) return { error: error.message, fieldErrors: {} }
  return { error: error instanceof Error ? error.message : fallback, fieldErrors: {} }
}

export type ActionResult = { ok: boolean; message: string }

export async function createEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('events.manage')
  try {
    const raw = Object.fromEntries(formData.entries())
    const event = await createEvent(
      ctx,
      eventSchema.parse({
        ...raw,
        registrationOpen: formData.get('registrationOpen') === 'on',
      }),
    )
    revalidatePath('/events')
    redirect(`/events/${event.id}`)
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error) throw error
    return fail(error, 'Could not create event')
  }
}

export async function registerParticipantAction(
  eventId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('events.manage')
  try {
    await registerParticipant(ctx, eventId, String(formData.get('studentId') ?? ''))
    revalidatePath(`/events/${eventId}`)
    return { ...emptyFormState, ok: true, message: 'Registered' }
  } catch (error) {
    return fail(error, 'Could not register')
  }
}

export async function unregisterParticipantAction(
  eventId: string,
  participantId: string,
): Promise<ActionResult> {
  const ctx = await requireContext('events.manage')
  try {
    await unregisterParticipant(ctx, participantId)
    revalidatePath(`/events/${eventId}`)
    return { ok: true, message: 'Removed' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not remove' }
  }
}
