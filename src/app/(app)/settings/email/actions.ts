'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { audit } from '@/server/audit'
import {
  clearSmtpSettings,
  saveSmtpSettings,
  smtpSchema,
  verifySmtp,
} from '@/server/mail/smtp'
import type { FormState } from '@/lib/form-state'

const PAGE = '/settings/email'

function describe(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export async function saveMailSettingsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const ctx = await requireContext('settings.manage')
    await saveSmtpSettings(
      ctx.tenant.id,
      smtpSchema.parse({
        enabled: formData.get('enabled') === 'on',
        host: formData.get('host'),
        port: formData.get('port'),
        secure: formData.get('secure') === 'on',
        username: formData.get('username') || undefined,
        // Blank means "keep the stored password"; the form never receives it.
        password: formData.get('password') || undefined,
        fromName: formData.get('fromName'),
        fromEmail: formData.get('fromEmail'),
        replyTo: formData.get('replyTo') || undefined,
      }),
    )

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'settings.email.save',
      module: 'settings',
      summary: `Updated the school mail server (${formData.get('host')})`,
    })

    revalidatePath(PAGE)
    return { ok: true, error: null, fieldErrors: {} }
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        error: 'Please correct the highlighted fields',
        fieldErrors: Object.fromEntries(
          error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      }
    }
    return { error: describe(error, 'The settings could not be saved'), fieldErrors: {} }
  }
}

export async function testMailAction(recipient: string): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('settings.manage')
    const result = await verifySmtp(ctx.tenant.id, recipient)
    revalidatePath(PAGE)
    return result
  } catch (error) {
    return { ok: false, message: describe(error, 'The test could not be run') }
  }
}

export async function disconnectMailAction(): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('settings.manage')
    await clearSmtpSettings(ctx.tenant.id)
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'settings.email.disconnect',
      module: 'settings',
      summary: 'Disconnected the school mail server',
    })
    revalidatePath(PAGE)
    return { ok: true, message: 'Mail server disconnected. Outgoing email falls back to the platform sender.' }
  } catch (error) {
    return { ok: false, message: describe(error, 'It could not be disconnected') }
  }
}
