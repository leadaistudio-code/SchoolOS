import { z } from 'zod'
import { resolveTenant } from '@/server/tenant'
import { completeWithToken } from './reset'
import type { OneTimePurpose } from './tokens'
import type { FormState } from '@/lib/form-state'

/**
 * Form handling shared by the reset and invite pages.
 *
 * Kept out of the 'use server' action files because those may only export
 * async server actions — a shared helper living there would be exposed as an
 * endpoint of its own.
 */
const schema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(1, 'Choose a new password'),
    confirmPassword: z.string().min(1, 'Confirm the new password'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The two passwords do not match',
  })

export async function redeemPasswordForm(
  purpose: OneTimePurpose,
  formData: FormData,
): Promise<FormState> {
  const tenant = await resolveTenant()
  if (!tenant) {
    return { error: 'This link must be opened on your school address.', fieldErrors: {} }
  }

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { error: null, fieldErrors }
  }

  const result = await completeWithToken(
    parsed.data.token,
    purpose,
    tenant.id,
    parsed.data.password,
  )

  if (!result.ok) {
    return result.field === 'password'
      ? { error: null, fieldErrors: { password: result.message } }
      : { error: result.message, fieldErrors: {} }
  }

  return { error: null, fieldErrors: {}, ok: true }
}
