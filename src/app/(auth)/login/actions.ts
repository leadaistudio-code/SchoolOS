'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { login } from '@/server/auth/login'
import { resolveTenant, isPlatformHost } from '@/server/tenant'
import { getSessionUser } from '@/server/auth/session'
import type { FormState as LoginState } from '@/lib/form-state'

const schema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or phone number'),
  password: z.string().min(1, 'Enter your password'),
  next: z.string().optional(),
})



export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    identifier: formData.get('identifier'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  })

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message
    }
    return { error: null, fieldErrors }
  }

  // The tenant comes from the request host. Platform hosts (app., admin., apex)
  // always authenticate as the platform super-admin, never a school tenant.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const tenant = isPlatformHost(host) ? null : await resolveTenant()

  const result = await login({
    identifier: parsed.data.identifier,
    password: parsed.data.password,
    tenantId: tenant?.id ?? null,
  })

  if (!result.ok) return { error: result.message, fieldErrors: {} }

  const next = parsed.data.next
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null

  if (result.mustChangePassword) redirect('/account/password')
  redirect(safeNext ?? (tenant ? '/' : '/platform'))
}

export async function currentUserOrNull() {
  return getSessionUser()
}
