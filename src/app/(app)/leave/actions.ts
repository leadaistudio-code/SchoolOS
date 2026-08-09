'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  applyForLeave,
  cancelLeave,
  decideLeave,
  leaveApplySchema,
  leaveDecisionSchema,
} from '@/server/modules/leave/service'
import type { FormState } from '@/lib/form-state'

function fieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) out[issue.path.join('.')] = issue.message
  return out
}

export async function applyLeaveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('leave.apply')

  try {
    const raw = Object.fromEntries(formData.entries())
    const input = leaveApplySchema.parse(raw)
    await applyForLeave(ctx, input)
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: 'Please correct the highlighted fields', fieldErrors: fieldErrors(err) }
    }
    return {
      error: err instanceof Error ? err.message : 'The request could not be submitted',
      fieldErrors: {},
    }
  }

  revalidatePath('/leave')
  redirect('/leave?submitted=1')
}

export type ActionResult = { ok: boolean; message: string }

/** Approve or reject. The service refuses self-approval regardless of the UI. */
export async function decideLeaveAction(
  id: string,
  status: 'APPROVED' | 'REJECTED',
  decisionNote?: string,
): Promise<ActionResult> {
  const ctx = await requireContext('leave.approve')
  try {
    await decideLeave(ctx, id, leaveDecisionSchema.parse({ status, decisionNote }))
    revalidatePath('/leave')
    revalidatePath('/attendance')
    return {
      ok: true,
      message:
        status === 'APPROVED'
          ? 'Leave approved. The attendance register has been updated.'
          : 'Leave rejected and the applicant notified.',
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The decision could not be saved',
    }
  }
}

export async function cancelLeaveAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('leave.apply')
  try {
    await cancelLeave(ctx, id)
    revalidatePath('/leave')
    return { ok: true, message: 'Request withdrawn' }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The request could not be withdrawn',
    }
  }
}
