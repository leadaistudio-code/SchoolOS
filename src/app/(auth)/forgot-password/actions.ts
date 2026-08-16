'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requestPasswordReset } from '@/server/auth/reset'
import { requestWhatsappOtp, verifyWhatsappOtp } from '@/server/auth/otp'
import { resolveTenant, isPlatformHost } from '@/server/tenant'
import type { FormState } from '@/lib/form-state'

/**
 * The two ways into a reset.
 *
 * WhatsApp is the primary path because a phone number is the contact detail a
 * school actually keeps current — it is on the admission form and it is how
 * the office already reaches families. Email remains available for staff, who
 * usually have a working address and may not want the school's WhatsApp.
 */
async function tenantOrBounce() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  // Platform super admins have no school host to receive anything on.
  if (isPlatformHost(host)) redirect('/login')

  const tenant = await resolveTenant()
  if (!tenant) redirect('/login')

  return { id: tenant.id, slug: tenant.slug, name: tenant.school?.name ?? tenant.name }
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) out[String(issue.path[0])] = issue.message
  return out
}

/* ------------------------------------------------------------- whatsapp */

const phoneSchema = z.object({
  phone: z.string().trim().min(6, 'Enter your mobile number'),
})

export async function requestOtpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenant = await tenantOrBounce()

  const parsed = phoneSchema.safeParse({ phone: formData.get('phone') })
  if (!parsed.success) return { error: null, fieldErrors: fieldErrors(parsed.error) }

  const result = await requestWhatsappOtp(parsed.data.phone, tenant)

  if (!result.ok) {
    return result.reason === 'invalid_phone'
      ? { error: null, fieldErrors: { phone: result.message } }
      : // The secondary path: WhatsApp could not deliver, so a human picks it up.
        { error: null, fieldErrors: {}, ok: true, message: result.message }
  }

  // The challenge is meaningless without the code, so it can travel in the URL.
  redirect(
    `/forgot-password/verify?c=${encodeURIComponent(result.challengeToken)}&to=${encodeURIComponent(result.maskedPhone)}`,
  )
}

const codeSchema = z.object({
  challenge: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export async function verifyOtpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenant = await tenantOrBounce()

  const parsed = codeSchema.safeParse({
    challenge: formData.get('challenge'),
    code: formData.get('code'),
  })
  if (!parsed.success) return { error: null, fieldErrors: fieldErrors(parsed.error) }

  const result = await verifyWhatsappOtp(parsed.data.challenge, parsed.data.code, tenant.id)
  if (!result.ok) {
    return {
      error: null,
      fieldErrors: {
        code:
          result.attemptsLeft !== undefined && result.attemptsLeft > 0
            ? `${result.message} ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left.`
            : result.message,
      },
    }
  }

  // Hands off to the same page the emailed link lands on.
  redirect(`/reset-password?token=${encodeURIComponent(result.resetToken)}`)
}

/* ---------------------------------------------------------------- email */

const emailSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
})

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenant = await tenantOrBounce()

  const parsed = emailSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return { error: null, fieldErrors: fieldErrors(parsed.error) }

  const result = await requestPasswordReset(parsed.data.email, tenant)
  return { error: null, fieldErrors: {}, ok: true, message: result.message }
}
