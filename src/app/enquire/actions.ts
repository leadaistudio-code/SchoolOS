'use server'

import { headers } from 'next/headers'
import { ZodError } from 'zod'
import { resolveTenant } from '@/server/tenant'
import { submitPublicEnquiry } from '@/server/modules/admissions/service'
import { publicEnquireSchema } from '@/server/modules/admissions/schema'
import { ApiException } from '@/server/api/response'
import { emptyFormState, type FormState } from '@/lib/form-state'

export async function publicEnquireAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tenant = await resolveTenant()
  if (!tenant) {
    return { error: 'This form is only available on a school website.', fieldErrors: {} }
  }

  try {
    const raw = Object.fromEntries(formData.entries())
    const input = publicEnquireSchema.parse(raw)
    const h = await headers()
    const result = await submitPublicEnquiry(tenant.id, input, {
      ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip'),
    })
    return {
      ...emptyFormState,
      ok: true,
      message: `Thank you. Your enquiry reference is ${result.reference}. The school will contact you.`,
    }
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of error.issues) fieldErrors[issue.path.join('.')] = issue.message
      return { error: 'Please correct the highlighted fields', fieldErrors }
    }
    if (error instanceof ApiException) {
      return { error: error.message, fieldErrors: {} }
    }
    return {
      error: error instanceof Error ? error.message : 'Could not submit the enquiry',
      fieldErrors: {},
    }
  }
}
