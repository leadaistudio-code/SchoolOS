'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getContext } from '@/server/context'
import { changeOwnPassword } from '@/server/auth/change-password'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'
import type { FormState as PasswordState } from '@/lib/form-state'

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(1, 'Enter a new password'),
    confirmPassword: z.string().min(1, 'Confirm the new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The two passwords do not match',
  })



export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const ctx = await getContext()
  if (!ctx) redirect('/login')

  const limited = await rateLimit(
    `password-change:${ctx.user.userId}`,
    RATE_LIMITS.passwordReset.limit,
    RATE_LIMITS.passwordReset.windowSeconds,
  )
  if (!limited.ok) {
    return { error: 'Too many attempts. Please wait a few minutes.', fieldErrors: {} }
  }

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return { error: null, fieldErrors }
  }

  const result = await changeOwnPassword(ctx, parsed.data.currentPassword, parsed.data.newPassword)
  if (!result.ok) {
    return result.field
      ? { error: null, fieldErrors: { [result.field]: result.message } }
      : { error: result.message, fieldErrors: {} }
  }

  redirect('/')
}
