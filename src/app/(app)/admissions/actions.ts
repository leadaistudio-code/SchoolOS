'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { emptyFormState, type FormState } from '@/lib/form-state'
import {
  completeFollowUp,
  convertLead,
  createFollowUp,
  createLead,
  moveLeadStage,
  updateLead,
} from '@/server/modules/admissions/service'
import {
  draftFollowUpMessage,
  generateLeadBrief,
  suggestNextAction,
} from '@/server/modules/admissions/ai'
import {
  followUpCompleteSchema,
  followUpCreateSchema,
  leadConvertSchema,
  leadCreateSchema,
  leadStageSchema,
  leadUpdateSchema,
} from '@/server/modules/admissions/schema'

function fieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) out[issue.path.join('.')] = issue.message
  return out
}

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof ZodError) {
    return { error: 'Please correct the highlighted fields', fieldErrors: fieldErrors(error) }
  }
  if (error instanceof ApiException) {
    return { error: error.message, fieldErrors: {} }
  }
  return {
    error: error instanceof Error ? error.message : fallback,
    fieldErrors: {},
  }
}

export type ActionResult = { ok: boolean; message: string; data?: unknown }

export async function createLeadAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('admissions.manage')
  try {
    const raw = Object.fromEntries(formData.entries())
    const lead = await createLead(ctx, leadCreateSchema.parse(raw))
    revalidatePath('/admissions')
    redirect(`/admissions/${lead.id}`)
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error) throw error
    return fail(error, 'Could not create the lead')
  }
}

export async function updateLeadAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('admissions.manage')
  try {
    const raw = Object.fromEntries(formData.entries())
    await updateLead(ctx, id, leadUpdateSchema.parse(raw))
    revalidatePath('/admissions')
    revalidatePath(`/admissions/${id}`)
    return { ...emptyFormState, ok: true, message: 'Lead updated' }
  } catch (error) {
    return fail(error, 'Could not update the lead')
  }
}

export async function moveLeadStageAction(
  id: string,
  stage: string,
  lostReason?: string,
): Promise<ActionResult> {
  const ctx = await requireContext('admissions.manage')
  try {
    await moveLeadStage(ctx, id, leadStageSchema.parse({ stage, lostReason }))
    revalidatePath('/admissions')
    revalidatePath(`/admissions/${id}`)
    return { ok: true, message: 'Stage updated' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not move the lead',
    }
  }
}

export async function createFollowUpAction(
  leadId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('admissions.manage')
  try {
    const raw = Object.fromEntries(formData.entries())
    await createFollowUp(ctx, leadId, followUpCreateSchema.parse(raw))
    revalidatePath('/admissions/followups')
    revalidatePath(`/admissions/${leadId}`)
    return { ...emptyFormState, ok: true, message: 'Follow-up scheduled' }
  } catch (error) {
    return fail(error, 'Could not schedule the follow-up')
  }
}

export async function completeFollowUpAction(
  followUpId: string,
  leadId: string,
  outcome: string,
): Promise<ActionResult> {
  const ctx = await requireContext('admissions.manage')
  try {
    await completeFollowUp(ctx, followUpId, followUpCompleteSchema.parse({ outcome }))
    revalidatePath('/admissions/followups')
    revalidatePath(`/admissions/${leadId}`)
    return { ok: true, message: 'Follow-up completed' }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not complete the follow-up',
    }
  }
}

export async function convertLeadAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('admissions.convert')
  try {
    const raw = Object.fromEntries(formData.entries())
    const result = await convertLead(ctx, id, leadConvertSchema.parse(raw))
    revalidatePath('/admissions')
    revalidatePath(`/admissions/${id}`)
    revalidatePath('/students')
    redirect(`/students/${result.student.id}`)
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error) throw error
    return fail(error, 'Could not convert the lead')
  }
}

export async function suggestNextActionAction(leadId: string): Promise<ActionResult> {
  const ctx = await requireContext('admissions.view')
  try {
    const data = await suggestNextAction(ctx, leadId)
    return { ok: true, message: data.rationale, data }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not suggest a next action',
    }
  }
}

export async function draftFollowUpAction(
  leadId: string,
  channel?: 'CALL' | 'SMS' | 'EMAIL' | 'WHATSAPP',
): Promise<ActionResult> {
  const ctx = await requireContext('admissions.manage')
  try {
    const data = await draftFollowUpMessage(ctx, leadId, channel)
    return { ok: true, message: 'Draft ready — copy and send yourself', data }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not draft a message',
    }
  }
}

export async function leadBriefAction(leadId: string): Promise<ActionResult> {
  const ctx = await requireContext('admissions.view')
  try {
    const data = await generateLeadBrief(ctx, leadId)
    return { ok: true, message: 'Brief ready', data }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Could not generate a brief',
    }
  }
}
