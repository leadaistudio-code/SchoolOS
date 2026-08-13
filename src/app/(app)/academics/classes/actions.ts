'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  classCreateSchema,
  createClassLevel,
  createSection,
  sectionCreateSchema,
} from '@/server/modules/academics/service'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

function fail(err: unknown, fallback: string): ActionResult {
  if (err instanceof ZodError) {
    return { ok: false, message: err.issues[0]?.message ?? fallback }
  }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

/**
 * Both actions revalidate the screens that read the class tree, not just this
 * page: attendance, the timetable and fee assignment all render from it, and a
 * class that appears here but not in the register would be worse than one that
 * appears nowhere.
 */
function revalidateClassTree() {
  revalidatePath('/academics/classes')
  revalidatePath('/academics/subjects')
  revalidatePath('/attendance')
  revalidatePath('/students')
}

export async function createClassAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    const created = await createClassLevel(ctx, classCreateSchema.parse(payload))
    revalidateClassTree()
    return { ok: true, message: `${created.name} added. Give it at least one section next.` }
  } catch (err) {
    return fail(err, 'The class could not be created')
  }
}

export async function createSectionAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    const created = await createSection(ctx, sectionCreateSchema.parse(payload))
    revalidateClassTree()
    return { ok: true, message: `Section ${created.name} added with ${created.capacity} seats.` }
  } catch (err) {
    return fail(err, 'The section could not be created')
  }
}
