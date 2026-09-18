'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import {
  issueParentPortalLogin,
  parentUpdateSchema,
  updateParent,
} from '@/server/modules/people/service'
import type { FormState } from '@/lib/form-state'

function fieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !out[key]) out[key] = issue.message
  }
  return out
}

/**
 * Issues a portal login for a parent who does not yet have one.
 * Redirects to the profile with the one-time password in `?welcome=`.
 */
export async function issueParentPortalLoginAction(parentId: string): Promise<void> {
  const ctx = await requireContext()
  if (!ctx.can('users.create') && !ctx.can('parents.create') && !ctx.can('parents.edit')) {
    ctx.require('parents.edit')
  }

  try {
    const { temporaryPassword } = await issueParentPortalLogin(ctx, parentId)
    revalidatePath(`/parents/${parentId}`)
    redirect(`/parents/${parentId}?welcome=${encodeURIComponent(temporaryPassword)}`)
  } catch (err) {
    if (isRedirectError(err)) throw err
    const message =
      err instanceof ApiException
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Could not issue a portal login'
    redirect(`/parents/${parentId}?issueError=${encodeURIComponent(message)}`)
  }
}

export async function updateParentAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('parents.edit')

  try {
    const text = (key: string) => String(formData.get(key) ?? '').trim()
    const optionalText = (key: string) => {
      const value = text(key)
      return value === '' ? null : value
    }

    const phoneRaw = text('phone')
    const emailRaw = text('email')
    const parsed = parentUpdateSchema.parse({
      firstName: text('firstName'),
      lastName: text('lastName'),
      ...(phoneRaw ? { phone: phoneRaw } : {}),
      ...(emailRaw ? { email: emailRaw } : {}),
    })

    await updateParent(ctx, id, {
      firstName: parsed.firstName,
      lastName: parsed.lastName ?? '',
      phone: phoneRaw ? parsed.phone : null,
      email: emailRaw ? parsed.email : null,
      occupation: optionalText('occupation'),
      annualIncome: optionalText('annualIncome'),
      addressLine1: optionalText('addressLine1'),
      city: optionalText('city'),
      state: optionalText('state'),
      postalCode: optionalText('postalCode'),
    })
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: 'Please correct the highlighted fields', fieldErrors: fieldErrors(err) }
    }
    return {
      error: err instanceof Error ? err.message : 'The parent record could not be saved',
      fieldErrors: {},
    }
  }

  revalidatePath('/parents')
  revalidatePath(`/parents/${id}`)
  redirect(`/parents/${id}`)
}
