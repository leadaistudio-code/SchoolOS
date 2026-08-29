'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  archiveStaff,
  createStaff,
  issueStaffPortalLogin,
  staffCreateSchema,
  staffUpdateSchema,
  updateStaff,
} from '@/server/modules/people/service'
import {
  deletePayslip,
  generatePayslip,
  payslipGenerateSchema,
  payslipStatusSchema,
  salaryStructureSchema,
  setPayslipStatus,
  setSalaryStructure,
} from '@/server/modules/staff/payroll'
import {
  appraisalCreateSchema,
  appraisalReviewSchema,
  createAppraisal,
  saveAppraisalReview,
} from '@/server/modules/staff/appraisals'
import type { FormState } from '@/lib/form-state'

export type ActionResult<T = unknown> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string }

function fail(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof ZodError) {
    return { ok: false, message: err.issues[0]?.message ?? fallback }
  }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

function fieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) out[issue.path.join('.')] = issue.message
  return out
}

/**
 * Everything the staff module writes.
 *
 * The personnel record uses the FormState shape because it is a long form
 * where field-level errors matter; the payroll and appraisal controls return
 * a sentence, because they are single-purpose dialogs where the first problem
 * is the only one worth showing.
 */

/* ------------------------------------------------------- personnel record */

export async function createStaffAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('staff.create')

  let id: string
  let temporaryPassword: string | undefined
  try {
    const raw = Object.fromEntries(formData.entries()) as Record<string, unknown>
    raw.createLogin = formData.get('createLogin') === 'on'
    for (const key of ['salaryMinor', 'experienceYears', 'dateOfBirth', 'joinedOn', 'roleKey']) {
      if (!raw[key]) delete raw[key]
    }
    // The form asks for rupees; the column stores paise.
    if (raw.salaryMinor) raw.salaryMinor = Math.round(Number(raw.salaryMinor) * 100)

    const result = await createStaff(ctx, staffCreateSchema.parse(raw))
    id = result.staff.id
    temporaryPassword = result.temporaryPassword
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: 'Please correct the highlighted fields', fieldErrors: fieldErrors(err) }
    }
    return {
      error: err instanceof Error ? err.message : 'The staff record could not be saved',
      fieldErrors: {},
    }
  }

  revalidatePath('/staff')
  // The temporary password is shown once, on the profile it belongs to — it
  // is never stored anywhere it could be read again.
  redirect(temporaryPassword ? `/staff/${id}?welcome=${temporaryPassword}` : `/staff/${id}`)
}

export async function updateStaffAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireContext('staff.edit')

  try {
    const raw = Object.fromEntries(formData.entries()) as Record<string, unknown>
    delete raw.createLogin
    delete raw.roleKey
    for (const key of ['salaryMinor', 'experienceYears', 'dateOfBirth', 'joinedOn']) {
      if (!raw[key]) delete raw[key]
    }
    if (raw.salaryMinor) raw.salaryMinor = Math.round(Number(raw.salaryMinor) * 100)

    await updateStaff(ctx, id, staffUpdateSchema.parse(raw))
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: 'Please correct the highlighted fields', fieldErrors: fieldErrors(err) }
    }
    return {
      error: err instanceof Error ? err.message : 'The staff record could not be saved',
      fieldErrors: {},
    }
  }

  revalidatePath('/staff')
  revalidatePath(`/staff/${id}`)
  redirect(`/staff/${id}`)
}

export async function archiveStaffAction(id: string, reason?: string): Promise<ActionResult> {
  const ctx = await requireContext('staff.delete')
  try {
    await archiveStaff(ctx, id, reason)
    revalidatePath('/staff')
    return { ok: true, message: 'Staff record archived and any login disabled.' }
  } catch (err) {
    return fail(err, 'The record could not be archived')
  }
}

/** Issues a portal login for staff without one. Password shown once via `?welcome=`. */
export async function issueStaffPortalLoginAction(staffId: string): Promise<void> {
  const ctx = await requireContext()
  if (!ctx.can('users.create') && !ctx.can('staff.create') && !ctx.can('staff.edit')) {
    ctx.require('staff.edit')
  }

  const { temporaryPassword } = await issueStaffPortalLogin(ctx, staffId)

  revalidatePath(`/staff/${staffId}`)
  redirect(`/staff/${staffId}?welcome=${encodeURIComponent(temporaryPassword)}`)
}

/* ------------------------------------------------------------------ salary */

export async function setSalaryAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('staff.payroll_manage')
  try {
    const created = await setSalaryStructure(ctx, salaryStructureSchema.parse(payload))
    revalidatePath(`/staff/${created.staffId}`)
    revalidatePath('/staff/payroll')
    return { ok: true, message: 'Salary saved. It applies to payslips from that date onward.' }
  } catch (err) {
    return fail(err, 'The salary could not be saved')
  }
}

export async function generatePayslipAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('staff.payroll_manage')
  try {
    const created = await generatePayslip(ctx, payslipGenerateSchema.parse(payload))
    revalidatePath(`/staff/${created.staffId}`)
    revalidatePath('/staff/payroll')
    return { ok: true, message: 'Payslip generated as a draft. Check it, then publish.' }
  } catch (err) {
    return fail(err, 'The payslip could not be generated')
  }
}

export async function setPayslipStatusAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('staff.payroll_manage')
  try {
    const updated = await setPayslipStatus(ctx, payslipStatusSchema.parse(payload))
    revalidatePath(`/staff/${updated.staffId}`)
    revalidatePath('/staff/payroll')
    return { ok: true, message: `Payslip marked ${updated.status.toLowerCase()}.` }
  } catch (err) {
    return fail(err, 'The payslip could not be updated')
  }
}

export async function deletePayslipAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('staff.payroll_manage')
  try {
    await deletePayslip(ctx, id)
    revalidatePath('/staff/payroll')
    return { ok: true, message: 'Draft payslip deleted.' }
  } catch (err) {
    return fail(err, 'The payslip could not be deleted')
  }
}

/* -------------------------------------------------------------- appraisals */

export async function createAppraisalAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('staff.appraise')
  try {
    const created = await createAppraisal(ctx, appraisalCreateSchema.parse(payload))
    revalidatePath('/staff/appraisals')
    revalidatePath(`/staff/${created.staffId}`)
    return { ok: true, message: `${created.cycleName} opened.` }
  } catch (err) {
    return fail(err, 'The appraisal could not be opened')
  }
}

export async function saveAppraisalAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('staff.appraise')
  try {
    const updated = await saveAppraisalReview(ctx, appraisalReviewSchema.parse(payload))
    revalidatePath('/staff/appraisals')
    revalidatePath(`/staff/${updated.staffId}`)
    return {
      ok: true,
      message:
        updated.status === 'COMPLETED'
          ? 'Appraisal completed and recorded.'
          : 'Appraisal saved.',
    }
  } catch (err) {
    return fail(err, 'The appraisal could not be saved')
  }
}
