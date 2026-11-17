'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  addSlot,
  createPlan,
  deletePlan,
  deleteSlot,
  publishPlan,
  revisionPlanSchema,
  revisionSlotSchema,
  unpublishPlan,
  updatePlan,
  updateSlot,
} from '@/server/modules/revision/service'
import type { FormState } from '@/lib/form-state'

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

function toFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) out[issue.path.join('.')] ??= issue.message
  return out
}

function fail(err: unknown, fallback: string): ActionResult {
  if (err instanceof ZodError) {
    return { ok: false, message: err.issues[0]?.message ?? fallback }
  }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

function stripOptional(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (!raw[key]) delete raw[key]
}

function revisionPaths(planId?: string) {
  const paths = ['/academics/revision']
  if (planId) paths.push(`/academics/revision/${planId}`, `/academics/revision/${planId}/edit`)
  return paths
}

function revalidateRevision(planId?: string) {
  for (const p of revisionPaths(planId)) revalidatePath(p)
}

export async function createRevisionPlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('exams.manage')

  let target: string
  try {
    const raw = Object.fromEntries(formData.entries()) as Record<string, unknown>
    stripOptional(raw, ['classLevelId', 'notes'])
    const created = await createPlan(ctx, revisionPlanSchema.parse(raw))
    target = `/academics/revision/${created.id}`
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: 'Please correct the highlighted fields', fieldErrors: toFieldErrors(err) }
    }
    return {
      error: err instanceof Error ? err.message : 'The revision plan could not be saved',
      fieldErrors: {},
    }
  }

  revalidateRevision()
  redirect(target)
}

export async function updateRevisionPlanAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('exams.manage')

  let target: string
  try {
    const raw = Object.fromEntries(formData.entries()) as Record<string, unknown>
    stripOptional(raw, ['classLevelId', 'notes'])
    await updatePlan(ctx, id, revisionPlanSchema.parse(raw))
    target = `/academics/revision/${id}`
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: 'Please correct the highlighted fields', fieldErrors: toFieldErrors(err) }
    }
    return {
      error: err instanceof Error ? err.message : 'The revision plan could not be saved',
      fieldErrors: {},
    }
  }

  revalidateRevision(id)
  redirect(target)
}

export async function deleteRevisionPlanAction(id: string): Promise<void> {
  const ctx = await requireContext('exams.manage')
  await deletePlan(ctx, id)
  revalidateRevision()
  redirect('/academics/revision')
}

export async function publishRevisionPlanAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('exams.manage')
  try {
    await publishPlan(ctx, id)
    revalidateRevision(id)
    return { ok: true, message: 'The revision plan is now visible to teachers and students.' }
  } catch (err) {
    return fail(err, 'Could not publish the plan')
  }
}

export async function unpublishRevisionPlanAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('exams.manage')
  try {
    await unpublishPlan(ctx, id)
    revalidateRevision(id)
    return { ok: true, message: 'The plan is back in draft — only exam managers can see it.' }
  } catch (err) {
    return fail(err, 'Could not unpublish the plan')
  }
}

export async function addRevisionSlotAction(planId: string, payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('exams.manage')
  try {
    const raw = typeof payload === 'object' && payload ? { ...(payload as Record<string, unknown>) } : {}
    stripOptional(raw, ['sectionId', 'startTime', 'endTime', 'periodLabel', 'teacherStaffId', 'room', 'notes'])
    await addSlot(ctx, planId, revisionSlotSchema.parse(raw))
    revalidateRevision(planId)
    return { ok: true, message: 'Revision slot added.' }
  } catch (err) {
    return fail(err, 'Could not add the slot')
  }
}

export async function updateRevisionSlotAction(slotId: string, planId: string, payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('exams.manage')
  try {
    const raw = typeof payload === 'object' && payload ? { ...(payload as Record<string, unknown>) } : {}
    stripOptional(raw, ['sectionId', 'startTime', 'endTime', 'periodLabel', 'teacherStaffId', 'room', 'notes'])
    await updateSlot(ctx, slotId, revisionSlotSchema.parse(raw))
    revalidateRevision(planId)
    return { ok: true, message: 'Slot updated.' }
  } catch (err) {
    return fail(err, 'Could not update the slot')
  }
}

export async function deleteRevisionSlotAction(slotId: string, planId: string): Promise<ActionResult> {
  const ctx = await requireContext('exams.manage')
  try {
    await deleteSlot(ctx, slotId)
    revalidateRevision(planId)
    return { ok: true, message: 'Slot removed.' }
  } catch (err) {
    return fail(err, 'Could not remove the slot')
  }
}