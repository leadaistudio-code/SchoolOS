'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { classworkCreateSchema, createClasswork } from '@/server/modules/academics/content-service'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

export async function logClassworkAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('classwork.create')
  try {
    const created = await createClasswork(ctx, classworkCreateSchema.parse(payload))
    revalidatePath('/academics/classwork')
    return { ok: true, message: `"${created.topic}" logged.` }
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: err.issues[0]?.message ?? 'Please check the form' }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The lesson could not be logged',
    }
  }
}
