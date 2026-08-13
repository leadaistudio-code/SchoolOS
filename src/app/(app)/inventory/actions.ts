'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { emptyFormState, type FormState } from '@/lib/form-state'
import { createAsset, recordAssetAction } from '@/server/modules/inventory/service'
import { assetActionSchema, assetSchema } from '@/server/modules/inventory/schema'

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Please correct the highlighted fields', fieldErrors }
  }
  if (error instanceof ApiException) return { error: error.message, fieldErrors: {} }
  return { error: error instanceof Error ? error.message : fallback, fieldErrors: {} }
}

export async function createAssetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('inventory.manage')
  try {
    const asset = await createAsset(ctx, assetSchema.parse(Object.fromEntries(formData.entries())))
    revalidatePath('/inventory')
    redirect(`/inventory/${asset.id}`)
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error) throw error
    return fail(error, 'Could not create asset')
  }
}

export async function assetActionForm(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('inventory.manage')
  try {
    await recordAssetAction(ctx, id, assetActionSchema.parse(Object.fromEntries(formData.entries())))
    revalidatePath('/inventory')
    revalidatePath(`/inventory/${id}`)
    return { ...emptyFormState, ok: true, message: 'Recorded' }
  } catch (error) {
    return fail(error, 'Could not update asset')
  }
}
