'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z, ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  archiveStaff,
  bulkIssueStaffTempPasswords,
  createStaff,
  issueStaffPortalLogin,
  issueStaffTempPassword,
  staffCreateSchema,
  staffUpdateSchema,
  updateStaff,
} from '@/server/modules/people/service'
import {
  deletePayslip,
  generatePayslip,
  payslipDeductionSchema,
  payslipGenerateSchema,
  payslipStatusSchema,
  salaryStructureSchema,
  setPayslipStatus,
  setSalaryStructure,
  updateDraftPayslipDeduction,
} from '@/server/modules/staff/payroll'
import {
  appraisalCreateSchema,
  appraisalReviewSchema,
  createAppraisal,
  saveAppraisalReview,
} from '@/server/modules/staff/appraisals'
import type { FormState } from '@/lib/form-state'
import { timeToMinutes } from '@/lib/attendance-hours'

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

function parseStaffAttendanceHours(formData: FormData, raw: Record<string, unknown>) {
  const custom = formData.get('customAttendanceHours') === 'on'
  raw.customAttendanceHours = custom
  if (!custom) {
    raw.attendanceStartMinutes = null
    raw.attendanceEndMinutes = null
    raw.attendanceLateAfterMinutes = null
    delete raw.attendanceStart
    delete raw.attendanceEnd
    delete raw.attendanceLateAfter
    return
  }
  const start = timeToMinutes(String(raw.attendanceStart ?? ''))
  const end = timeToMinutes(String(raw.attendanceEnd ?? ''))
  const late = timeToMinutes(String(raw.attendanceLateAfter ?? ''))
  raw.attendanceStartMinutes = start
  raw.attendanceEndMinutes = end
  raw.attendanceLateAfterMinutes = late ?? start
  delete raw.attendanceStart
  delete raw.attendanceEnd
  delete raw.attendanceLateAfter
}

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
    parseStaffAttendanceHours(formData, raw)

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
    parseStaffAttendanceHours(formData, raw)

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

  try {
    const { temporaryPassword } = await issueStaffPortalLogin(ctx, staffId)
    revalidatePath(`/staff/${staffId}`)
    redirect(`/staff/${staffId}?welcome=${encodeURIComponent(temporaryPassword)}`)
  } catch (err) {
    const { isRedirectError } = await import('next/dist/client/components/redirect-error')
    if (isRedirectError(err)) throw err
    const message = err instanceof Error ? err.message : 'Could not issue a portal login'
    redirect(`/staff/${staffId}?issueError=${encodeURIComponent(message)}`)
  }
}

/** Issues a 24h temporary password (create or reset). Shown once via `?tempPassword=`. */
export async function issueStaffTempPasswordAction(staffId: string): Promise<void> {
  const ctx = await requireContext('users.edit')

  try {
    const issued = await issueStaffTempPassword(ctx, staffId)
    revalidatePath(`/staff/${staffId}`)
    revalidatePath('/staff')
    revalidatePath('/settings/users')
    redirect(
      `/staff/${staffId}?tempPassword=${encodeURIComponent(issued.password)}&tempExpires=${encodeURIComponent(issued.expiresAt.toISOString())}`,
    )
  } catch (err) {
    const { isRedirectError } = await import('next/dist/client/components/redirect-error')
    if (isRedirectError(err)) throw err
    const message = err instanceof Error ? err.message : 'Could not issue a temporary password'
    redirect(`/staff/${staffId}?issueError=${encodeURIComponent(message)}`)
  }
}

const bulkStaffTempPasswordSchema = z.object({
  staffIds: z.array(z.string().min(1)).max(150).optional(),
  all: z.boolean().optional(),
  staffType: z.string().trim().max(40).optional(),
})

/**
 * Bulk temporary passwords for selected staff, or every staff on file (capped).
 * Returns plaintext rows once for CSV download on the client.
 */
export async function bulkIssueStaffTempPasswordsAction(
  payload: unknown,
): Promise<
  ActionResult<{
    issued: {
      staffId: string
      name: string
      employeeCode: string
      phone: string
      password: string
      expiresAt: string
      createdLogin: boolean
    }[]
    skipped: { staffId: string; name: string; employeeCode: string; reason: string }[]
  }>
> {
  const ctx = await requireContext('users.edit')

  try {
    const input = bulkStaffTempPasswordSchema.parse(payload)
    if (!input.all && (!input.staffIds || input.staffIds.length === 0)) {
      return { ok: false, message: 'Select at least one staff member, or choose all staff.' }
    }

    const result = await bulkIssueStaffTempPasswords(ctx, {
      staffIds: input.staffIds,
      all: input.all,
      staffType: input.staffType || undefined,
    })

    revalidatePath('/staff')
    revalidatePath('/settings/users')

    const issued = result.issued.length
    const skipped = result.skipped.length
    if (issued === 0 && skipped === 0) {
      return { ok: false, message: 'No staff members matched.' }
    }

    return {
      ok: true,
      message:
        skipped === 0
          ? `Temporary passwords issued for ${issued} staff member${issued === 1 ? '' : 's'}. Download the CSV now — passwords are not stored.`
          : `Issued ${issued}; skipped ${skipped}. Download the CSV for issued passwords — they are not stored.`,
      data: result,
    }
  } catch (err) {
    return fail(err, 'Temporary passwords could not be issued')
  }
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
    const input = payslipStatusSchema.parse(payload)
    const updated = await setPayslipStatus(ctx, input)
    revalidatePath(`/staff/${updated.staffId}`)
    revalidatePath('/staff/payroll')
    const message =
      input.status === 'DRAFT'
        ? 'Payslip returned to draft. You can edit, delete, or publish again.'
        : `Payslip marked ${updated.status.toLowerCase()}.`
    return { ok: true, message }
  } catch (err) {
    return fail(err, 'The payslip could not be updated')
  }
}

const bulkPublishPayslipsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
})

export async function bulkPublishPayslipsAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('staff.payroll_manage')
  try {
    const input = bulkPublishPayslipsSchema.parse(payload)
    const ids = [...new Set(input.ids)]
    const eligible = await ctx.db.staffPayslip.findMany({
      where: {
        id: { in: ids },
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        status: 'DRAFT',
      },
      select: { id: true },
    })

    let published = 0
    let failed = ids.length - eligible.length
    for (let offset = 0; offset < eligible.length; offset += 10) {
      const results = await Promise.allSettled(
        eligible.slice(offset, offset + 10).map(({ id }) =>
          setPayslipStatus(ctx, payslipStatusSchema.parse({ id, status: 'PUBLISHED' })),
        ),
      )
      for (const result of results) {
        if (result.status === 'fulfilled') published += 1
        else failed += 1
      }
    }

    revalidatePath('/staff/payroll')
    return {
      ok: failed === 0,
      message: failed
        ? `${published} published; ${failed} skipped or changed during review.`
        : `${published} payslip${published === 1 ? '' : 's'} published.`,
    }
  } catch (err) {
    return fail(err, 'The selected payslips could not be published')
  }
}

export async function updatePayslipDeductionAction(payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext('staff.payroll_manage')
  try {
    const updated = await updateDraftPayslipDeduction(
      ctx,
      payslipDeductionSchema.parse(payload),
    )
    revalidatePath(`/staff/${updated.staffId}`)
    revalidatePath('/staff/payroll')
    return { ok: true, message: 'Manual deduction updated on the draft payslip.' }
  } catch (err) {
    return fail(err, 'The deduction could not be updated')
  }
}

export async function deletePayslipAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('staff.payroll_manage')
  try {
    const deleted = await deletePayslip(ctx, id)
    revalidatePath('/staff/payroll')
    revalidatePath(`/staff/${deleted.staffId}`)
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
