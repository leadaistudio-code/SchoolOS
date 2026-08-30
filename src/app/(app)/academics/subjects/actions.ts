'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  archiveSubject,
  assignSubjectToClass,
  assignSubjectToClasses,
  assignSubjectToClassesSchema,
  classSubjectSchema,
  classSubjectUpdateSchema,
  createSubjectWithClasses,
  subjectCreateWithClassesSchema,
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
    const parsed = subjectCreateWithClassesSchema.parse(payload)
    const { subject, assigned, skipped } = await createSubjectWithClasses(ctx, parsed)
    revalidatePath('/academics/subjects')
    const skippedNote =
      skipped.length > 0 ? ` (${skipped.length} class${skipped.length === 1 ? '' : 'es'} were already mapped)` : ''
    return {
      ok: true,
      message:
        assigned > 0
          ? `${subject.name} created and mapped to ${assigned} class${assigned === 1 ? '' : 'es'}.${skippedNote}`
          : `${subject.name} added. Map it to the classes that study it when ready.`,
    }
  } catch (err) {
    return fail(err, 'The subject could not be created')
  }
}

export async function assignSubjectsToClassesAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('academics.manage')
  try {
    const result = await assignSubjectToClasses(ctx, assignSubjectToClassesSchema.parse(payload))
    revalidateAcademics()
    const skippedNote =
      result.skipped.length > 0
        ? ` Skipped ${result.skipped.length} already mapped: ${result.skipped.join(', ')}.`
        : ''
    return {
      ok: true,
      message: `${result.subjectName} mapped to ${result.created} class${result.created === 1 ? '' : 'es'}.${skippedNote}`,
    }
  } catch (err) {
    return fail(err, 'The subject could not be mapped')
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
