'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  archiveClassLevel,
  archiveSection,
  classCreateSchema,
  classUpdateSchema,
  createClassLevel,
  createSection,
  sectionCreateSchema,
  sectionUpdateSchema,
  updateClassLevel,
  updateSection,
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

export async function updateClassAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    const updated = await updateClassLevel(ctx, classUpdateSchema.parse(payload))
    revalidateClassTree()
    return { ok: true, message: `${updated.name} saved.` }
  } catch (err) {
    return fail(err, 'The class could not be updated')
  }
}

export async function updateSectionAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    const { id, ...rest } = sectionUpdateSchema.parse(payload)
    const updated = await updateSection(ctx, id, rest)
    revalidateClassTree()
    return { ok: true, message: `Section ${updated.name} saved.` }
  } catch (err) {
    return fail(err, 'The section could not be updated')
  }
}

/**
 * Removal is archival, not deletion. Last year's attendance and receipts still
 * reference these rows, so the record stays and only stops being offered.
 */
export async function archiveClassAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    const archived = await archiveClassLevel(ctx, id)
    revalidateClassTree()
    return { ok: true, message: `${archived.name} removed.` }
  } catch (err) {
    return fail(err, 'The class could not be removed')
  }
}

export async function archiveSectionAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    const archived = await archiveSection(ctx, id)
    revalidateClassTree()
    return { ok: true, message: `Section ${archived.name} removed.` }
  } catch (err) {
    return fail(err, 'The section could not be removed')
  }
}
