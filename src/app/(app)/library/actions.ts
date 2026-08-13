'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { emptyFormState, type FormState } from '@/lib/form-state'
import {
  createBook,
  createCategory,
  issueLoan,
  returnLoan,
  markLoanLost,
} from '@/server/modules/library/service'
import { bookSchema, issueLoanSchema } from '@/server/modules/library/schema'

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Please correct the highlighted fields', fieldErrors }
  }
  if (error instanceof ApiException) return { error: error.message, fieldErrors: {} }
  return { error: error instanceof Error ? error.message : fallback, fieldErrors: {} }
}

export type ActionResult = { ok: boolean; message: string }

export async function createBookAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('library.manage')
  try {
    await createBook(ctx, bookSchema.parse(Object.fromEntries(formData.entries())))
    revalidatePath('/library')
    return { ...emptyFormState, ok: true, message: 'Book added' }
  } catch (error) {
    return fail(error, 'Could not add book')
  }
}

export async function createCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('library.manage')
  try {
    await createCategory(ctx, String(formData.get('name') ?? ''))
    revalidatePath('/library')
    return { ...emptyFormState, ok: true, message: 'Category added' }
  } catch (error) {
    return fail(error, 'Could not add category')
  }
}

export async function issueLoanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('library.issue')
  try {
    await issueLoan(ctx, issueLoanSchema.parse(Object.fromEntries(formData.entries())))
    revalidatePath('/library')
    revalidatePath('/library/loans')
    return { ...emptyFormState, ok: true, message: 'Book issued' }
  } catch (error) {
    return fail(error, 'Could not issue')
  }
}

export async function returnLoanAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('library.issue')
  try {
    const loan = await returnLoan(ctx, id)
    revalidatePath('/library')
    revalidatePath('/library/loans')
    const fine = loan.fineMinor
      ? ` Fine ₹${(loan.fineMinor / 100).toFixed(0)}.`
      : ''
    return { ok: true, message: `Returned.${fine}` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not return' }
  }
}

export async function markLostAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('library.issue')
  try {
    await markLoanLost(ctx, id)
    revalidatePath('/library/loans')
    return { ok: true, message: 'Marked lost' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not update' }
  }
}