'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  classTestCreateSchema,
  classTestResultsSchema,
  createClassTest,
  deleteClassTest,
  saveClassTestResults,
} from '@/server/modules/class-tests/service'
import type { FormState } from '@/lib/form-state'

export async function createClassTestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('exams.class_tests')

  let id: string
  try {
    const raw = Object.fromEntries(formData.entries()) as Record<string, unknown>
    for (const key of ['sectionId', 'maxMarks', 'syllabus']) if (!raw[key]) delete raw[key]
    const test = await createClassTest(ctx, classTestCreateSchema.parse(raw))
    id = test.id
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of err.issues) fieldErrors[issue.path.join('.')] ??= issue.message
      return { error: 'Please correct the highlighted fields', fieldErrors }
    }
    return { error: err instanceof Error ? err.message : 'The class test could not be saved', fieldErrors: {} }
  }

  revalidatePath('/exams/class-tests')
  redirect(`/exams/class-tests/${id}`)
}

export async function saveClassTestResultsAction(
  id: string,
  entries: { studentId: string; done: boolean; marks: number | null }[],
): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireContext('exams.class_tests')
  try {
    const result = await saveClassTestResults(ctx, id, classTestResultsSchema.parse({ entries }))
    revalidatePath(`/exams/class-tests/${id}`)
    revalidatePath('/exams/class-tests')
    return { ok: true, message: `${result.completed} of ${result.total} marked as completed.` }
  } catch (err) {
    if (err instanceof ZodError) return { ok: false, message: err.issues[0]?.message ?? 'Invalid entries' }
    return { ok: false, message: err instanceof Error ? err.message : 'Could not save the register' }
  }
}

export async function deleteClassTestAction(id: string): Promise<void> {
  const ctx = await requireContext('exams.class_tests')
  await deleteClassTest(ctx, id)
  revalidatePath('/exams/class-tests')
  redirect('/exams/class-tests')
}
