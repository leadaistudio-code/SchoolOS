'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { requestMeta } from '@/server/auth/session'
import { resolveTenant, isPlatformHost } from '@/server/tenant'
import { createPasswordResetTicket } from '@/server/modules/platform/support'
import { passwordResetRequestSchema } from '@/server/modules/platform/schema'
import type { FormState } from '@/lib/form-state'

const SUCCESS_MESSAGE =
  'If an account exists for that email, our platform team has been notified and will contact you to reset your password.'

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (isPlatformHost(host)) redirect('/login')

  const tenant = await resolveTenant()
  if (!tenant) redirect('/login')

  const parsed = passwordResetRequestSchema.safeParse({
    email: formData.get('email'),
    note: formData.get('note') || undefined,
  })

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message
    }
    return { error: null, fieldErrors }
  }

  const meta = await requestMeta()
  await createPasswordResetTicket({
    ...parsed.data,
    tenantId: tenant.id,
    tenantName: tenant.school?.name ?? tenant.name,
    ip: meta.ip,
  })

  return { error: null, fieldErrors: {}, ok: true, message: SUCCESS_MESSAGE }
}
