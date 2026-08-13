'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { completeMfaChallenge } from '@/server/modules/mfa/service'
import { resolveTenant, isPlatformHost } from '@/server/tenant'
import { headers } from 'next/headers'
import type { FormState } from '@/lib/form-state'

const schema = z.object({
  token: z.string().min(20),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  next: z.string().optional(),
})

export async function mfaChallengeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = schema.safeParse({
    token: formData.get('token'),
    code: formData.get('code'),
    next: formData.get('next') || undefined,
  })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message
    }
    return { error: null, fieldErrors }
  }

  const result = await completeMfaChallenge(parsed.data.token, parsed.data.code)
  if (!result.ok) return { error: result.message, fieldErrors: {} }

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const tenant = isPlatformHost(host) ? null : await resolveTenant()
  const next = parsed.data.next
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null

  if (result.mustChangePassword) redirect('/account/password')
  redirect(safeNext ?? (tenant ? '/' : '/platform'))
}
