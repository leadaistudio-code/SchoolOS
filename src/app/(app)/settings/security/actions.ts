'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  beginMfaEnrolment,
  confirmMfaEnrolment,
  disableMfa,
  mfaCodeSchema,
  mfaDisableSchema,
} from '@/server/modules/mfa/service'
import type { FormState } from '@/lib/form-state'

function fields(error: ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

export async function beginMfaEnrolmentAction(): Promise<
  | { ok: true; secret: string; qrDataUrl: string }
  | { ok: false; message: string }
> {
  try {
    const ctx = await requireContext('settings.view')
    const result = await beginMfaEnrolment(ctx)
    return { ok: true, secret: result.secret, qrDataUrl: result.qrDataUrl }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not start MFA setup' }
  }
}

export async function confirmMfaEnrolmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const ctx = await requireContext('settings.view')
    await confirmMfaEnrolment(ctx, mfaCodeSchema.parse({ code: formData.get('code') }))
    revalidatePath('/settings/security')
    return { ok: true, error: null, fieldErrors: {}, message: 'Authenticator app enabled.' }
  } catch (error) {
    if (error instanceof ZodError) return { error: 'Enter a valid 6-digit code', fieldErrors: fields(error) }
    return { error: error instanceof Error ? error.message : 'Could not enable MFA', fieldErrors: {} }
  }
}

export async function disableMfaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await requireContext('settings.view')
    await disableMfa(
      ctx,
      mfaDisableSchema.parse({
        password: formData.get('password'),
        code: formData.get('code'),
      }),
    )
    revalidatePath('/settings/security')
    return { ok: true, error: null, fieldErrors: {}, message: 'Authenticator app disabled.' }
  } catch (error) {
    if (error instanceof ZodError) return { error: 'Please correct the highlighted fields', fieldErrors: fields(error) }
    return { error: error instanceof Error ? error.message : 'Could not disable MFA', fieldErrors: {} }
  }
}
