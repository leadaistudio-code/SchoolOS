'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  archiveSubject,
  assignSubjectToClass,
  classSubjectSchema,
  classSubjectUpdateSchema,
  createSubject,
  subjectCreateSchema,
  subjectUpdateSchema,
  unassignSubjectFromClass,
  updateClassSubject,
  updateSubject,
} from '@/server/modules/academics/service'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

function fail(err: unknown, fallback: string): ActionResult {
  if (err instanceof ZodError) {
    return { ok: false, message: err.issues[0]?.message ?? fallback }
  }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

function revalidateAcademics() {
  revalidatePath('/academics/subjects')
  revalidatePath('/academics/classes')
  revalidatePath('/academics/curriculum')
  revalidatePath('/academics/classwork')
  revalidatePath('/academics/timetable')
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

export async function updateSubjectAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    const updated = await updateSubject(ctx, subjectUpdateSchema.parse(payload))
    revalidateAcademics()
    return { ok: true, message: `${updated.name} updated.` }
  } catch (err) {
    return fail(err, 'The subject could not be updated')
  }
}

export async function archiveSubjectAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    const archived = await archiveSubject(ctx, id)
    revalidateAcademics()
    return { ok: true, message: `${archived.name} archived.` }
  } catch (err) {
    return fail(err, 'The subject could not be archived')
  }
}

export async function assignSubjectAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    await assignSubjectToClass(ctx, classSubjectSchema.parse(payload))
    revalidateAcademics()
    return { ok: true, message: 'The class can now have a syllabus, timetable and lesson log.' }
  } catch (err) {
    return fail(err, 'The subject could not be assigned')
  }
}

export async function updateClassSubjectAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    await updateClassSubject(ctx, classSubjectUpdateSchema.parse(payload))
    revalidateAcademics()
    return { ok: true, message: 'Assignment updated.' }
  } catch (err) {
    return fail(err, 'The assignment could not be updated')
  }
}

export async function unassignSubjectAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    await unassignSubjectFromClass(ctx, id)
    revalidateAcademics()
    return { ok: true, message: 'Subject removed from this class.' }
  } catch (err) {
    return fail(err, 'The assignment could not be removed')
  }
}
