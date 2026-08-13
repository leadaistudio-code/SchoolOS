'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { emptyFormState, type FormState } from '@/lib/form-state'
import {
  deleteNotificationTemplate,
  ensureDefaultTemplates,
  upsertNotificationTemplate,
} from '@/server/modules/notification-templates/service'
import { notificationTemplateSchema } from '@/server/modules/notification-templates/schema'

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Please correct the highlighted fields', fieldErrors }
  }
  if (error instanceof ApiException) return { error: error.message, fieldErrors: {} }
  return { error: error instanceof Error ? error.message : fallback, fieldErrors: {} }
}

export async function saveTemplateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('settings.manage')
  try {
    await upsertNotificationTemplate(
      ctx,
      notificationTemplateSchema.parse({
        ...Object.fromEntries(formData.entries()),
        isActive: formData.get('isActive') !== 'off',
      }),
    )
    revalidatePath('/settings/templates')
    return { ...emptyFormState, ok: true, message: 'Template saved' }
  } catch (error) {
    return fail(error, 'Could not save template')
  }
}

export async function seedTemplatesAction(): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireContext('settings.manage')
  try {
    await ensureDefaultTemplates(ctx)
    revalidatePath('/settings/templates')
    return { ok: true, message: 'Default templates created' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not seed' }
  }
}

export async function deleteTemplateAction(id: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireContext('settings.manage')
  try {
    await deleteNotificationTemplate(ctx, id)
    revalidatePath('/settings/templates')
    return { ok: true, message: 'Deleted' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not delete' }
  }
}
