'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import { emptyFormState, type FormState } from '@/lib/form-state'
import {
  checkInVisitor,
  checkOutVisitor,
  convertVisitorToLead,
  createAppointment,
  setAppointmentStatus,
} from '@/server/modules/front-office/service'
import {
  appointmentSchema,
  visitorCheckInSchema,
} from '@/server/modules/front-office/schema'

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Please correct the highlighted fields', fieldErrors }
  }
  if (error instanceof ApiException) return { error: error.message, fieldErrors: {} }
  return { error: error instanceof Error ? error.message : fallback, fieldErrors: {} }
}

export type ActionResult = { ok: boolean; message: string }

export async function checkInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireContext('frontoffice.manage')
  try {
    await checkInVisitor(ctx, visitorCheckInSchema.parse(Object.fromEntries(formData.entries())))
    revalidatePath('/front-office')
    return { ...emptyFormState, ok: true, message: 'Visitor checked in' }
  } catch (error) {
    return fail(error, 'Could not check in')
  }
}

export async function checkOutAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('frontoffice.manage')
  try {
    await checkOutVisitor(ctx, id)
    revalidatePath('/front-office')
    return { ok: true, message: 'Checked out' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not check out' }
  }
}

export async function createAppointmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('frontoffice.manage')
  try {
    await createAppointment(ctx, appointmentSchema.parse(Object.fromEntries(formData.entries())))
    revalidatePath('/front-office')
    return { ...emptyFormState, ok: true, message: 'Appointment scheduled' }
  } catch (error) {
    return fail(error, 'Could not schedule')
  }
}

export async function setAppointmentStatusAction(id: string, status: string): Promise<ActionResult> {
  const ctx = await requireContext('frontoffice.manage')
  try {
    await setAppointmentStatus(ctx, id, status)
    revalidatePath('/front-office')
    return { ok: true, message: 'Updated' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not update' }
  }
}

export async function visitorToLeadAction(visitorId: string): Promise<ActionResult> {
  const ctx = await requireContext('frontoffice.manage')
  try {
    const lead = await convertVisitorToLead(ctx, visitorId)
    revalidatePath('/front-office')
    revalidatePath('/admissions')
    redirect(`/admissions/${lead.id}`)
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error) throw error
    return { ok: false, message: error instanceof Error ? error.message : 'Could not convert' }
  }
}
