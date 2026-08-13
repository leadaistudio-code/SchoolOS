import { redirect } from 'next/navigation'
import type { ZodError } from 'zod'

/** Redirect back with the first validation message (platform console forms). */
export function redirectWithFormError(path: string, error: ZodError) {
  const message = error.issues[0]?.message ?? 'Invalid form data'
  redirect(`${path}?error=${encodeURIComponent(message)}`)
}
