'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  assignSubjectToClass,
  classSubjectSchema,
  createSubject,
  subjectCreateSchema,
} from '@/server/modules/academics/service'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

function fail(err: unknown, fallback: string): ActionResult {
  if (err instanceof ZodError) {
    return { ok: false, message: err.issues[0]?.message ?? fallback }
  }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

export async function createSubjectAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    const created = await createSubject(ctx, subjectCreateSchema.parse(payload))
    revalidatePath('/academics/subjects')
    return {
      ok: true,
      message: `${created.name} added. Attach it to the classes that study it.`,
    }
  } catch (err) {
    return fail(err, 'The subject could not be created')
  }
}

/**
 * Attaching a subject to a class opens up the syllabus, the timetable, the
 * lesson log and homework for that pairing, so all four are revalidated.
 */
export async function assignSubjectAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    await assignSubjectToClass(ctx, classSubjectSchema.parse(payload))
    revalidatePath('/academics/subjects')
    revalidatePath('/academics/classes')
    revalidatePath('/academics/curriculum')
    revalidatePath('/academics/classwork')
    revalidatePath('/academics/timetable')
    return { ok: true, message: 'The class can now have a syllabus, timetable and lesson log.' }
  } catch (err) {
    return fail(err, 'The subject could not be assigned')
  }
}
