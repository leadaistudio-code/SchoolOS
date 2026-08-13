/**
 * Shared shape for server-action form results.
 *
 * Lives outside any 'use server' module: those files may only export async
 * functions, so the type and the initial value have to be declared here and
 * imported by both the action and the form.
 */
export type FormState = {
  error: string | null
  fieldErrors: Record<string, string>
  ok?: boolean
  message?: string
}

export const emptyFormState: FormState = { error: null, fieldErrors: {} }
