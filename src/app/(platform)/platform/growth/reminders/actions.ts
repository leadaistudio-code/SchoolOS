'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requirePlatformContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { emptyFormState, type FormState } from '@/lib/form-state'
import {
  createRecipient,
  deleteRecipient,
  recipientSchema,
  setRecipientActive,
  updateRecipient,
} from '@/server/modules/platform/growth/reminders'
import { sendTestReminder, type TestKind } from '@/server/modules/platform/growth/jobs'
import { saveStageCadence } from '@/server/modules/platform/growth/service'
import { CADENCE_STAGES } from '@/lib/growth-cadence'
import { FOLLOW_UP_TYPES } from '@/lib/growth-crm'

const PATH = '/platform/growth/reminders'

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of error.issues) fieldErrors[issue.path.join('.') || 'form'] = issue.message
    return { error: 'Please correct the highlighted fields', fieldErrors }
  }
  if (error instanceof ApiException) return { error: error.message, fieldErrors: {} }
  return { error: error instanceof Error ? error.message : fallback, fieldErrors: {} }
}

export async function saveRecipientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_comms')
  try {
    const id = String(formData.get('id') ?? '')
    const input = recipientSchema.parse(Object.fromEntries(formData.entries()))
    if (id) await updateRecipient(ctx, id, input)
    else await createRecipient(ctx, input)
    revalidatePath(PATH)
    return { ...emptyFormState, ok: true, message: id ? 'Saved' : `${input.name} will get the reminders` }
  } catch (error) {
    return fail(error, 'Could not save')
  }
}

export async function toggleRecipientAction(id: string, isActive: boolean) {
  const ctx = await requirePlatformContext('platform.crm_comms')
  await setRecipientActive(ctx, id, isActive)
  revalidatePath(PATH)
}

export async function deleteRecipientAction(id: string) {
  const ctx = await requirePlatformContext('platform.crm_comms')
  await deleteRecipient(ctx, id)
  revalidatePath(PATH)
}

export async function saveCadenceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformContext('platform.crm_comms')
  try {
    const rows = CADENCE_STAGES.map((stage) => {
      const days = Number(formData.get(`days-${stage}`))
      const type = String(formData.get(`type-${stage}`) ?? 'CALL')
      if (!Number.isInteger(days) || days < 1 || days > 60) throw new Error('Days must be between 1 and 60')
      return {
        stage,
        days,
        followUpType: (FOLLOW_UP_TYPES as readonly string[]).includes(type) ? type : 'CALL',
        enabled: formData.get(`on-${stage}`) === 'on',
      }
    })
    await saveStageCadence(ctx, rows)
    revalidatePath(PATH)
    return { ...emptyFormState, ok: true, message: 'Follow-up rules saved' }
  } catch (error) {
    return fail(error, 'Could not save the rules')
  }
}

export async function sendTestReminderAction(id: string, kind: TestKind): Promise<{ ok: boolean; message: string }> {
  await requirePlatformContext('platform.crm_comms')
  try {
    const message = await sendTestReminder(id, kind)
    return { ok: !message.includes('failed'), message }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not send' }
  }
}
