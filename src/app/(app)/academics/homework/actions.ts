'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  createHomework,
  homeworkCreateSchema,
  reviewSchema,
  reviewSubmission,
  submitHomework,
  submissionSchema,
  updateHomework,
} from '@/server/modules/homework/service'
import type { FormState } from '@/lib/form-state'

function toFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) out[issue.path.join('.')] = issue.message
  return out
}

export async function createHomeworkAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('homework.create')

  let id: string
  try {
    const raw = Object.fromEntries(formData.entries()) as Record<string, unknown>
    raw.isPublished = formData.get('isPublished') === 'on'
    if (!raw.sectionId) delete raw.sectionId
    if (!raw.maxScore) delete raw.maxScore

    const homework = await createHomework(ctx, homeworkCreateSchema.parse(raw))
    id = homework.id
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: 'Please correct the highlighted fields', fieldErrors: toFieldErrors(err) }
    }
    return {
      error: err instanceof Error ? err.message : 'The homework could not be saved',
      fieldErrors: {},
    }
  }

  revalidatePath('/academics/homework')
  redirect(`/academics/homework/${id}`)
}

export type ActionResult = { ok: boolean; message: string }

/** A student (or their parent) hands the work in. */
export async function submitHomeworkAction(
  homeworkId: string,
  studentId: string,
  note?: string,
): Promise<ActionResult> {
  const ctx = await requireContext('homework.submit')
  try {
    await submitHomework(ctx, submissionSchema.parse({ homeworkId, studentId, note }))
    revalidatePath(`/academics/homework/${homeworkId}`)
    revalidatePath('/academics/homework')
    return { ok: true, message: 'Handed in. Your teacher will review it.' }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The submission could not be recorded',
    }
  }
}

export async function reviewSubmissionAction(
  submissionId: string,
  payload: { status: 'REVIEWED' | 'REDO'; score?: number; teacherComment?: string },
): Promise<ActionResult> {
  const ctx = await requireContext('homework.review')
  try {
    await reviewSubmission(ctx, submissionId, reviewSchema.parse(payload))
    revalidatePath('/academics/homework')
    return {
      ok: true,
      message:
        payload.status === 'REDO'
          ? 'Sent back to be redone. The student has been notified.'
          : 'Reviewed. The student has been notified.',
    }
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: err.issues[0]?.message ?? 'Invalid review' }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The review could not be saved',
    }
  }
}

export async function togglePublishAction(id: string, isPublished: boolean): Promise<ActionResult> {
  const ctx = await requireContext('homework.edit')
  try {
    await updateHomework(ctx, id, { isPublished })
    revalidatePath('/academics/homework')
    revalidatePath(`/academics/homework/${id}`)
    return {
      ok: true,
      message: isPublished
        ? 'Published. The class has been notified.'
        : 'Unpublished. It is now a draft.',
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Could not change the status',
    }
  }
}
