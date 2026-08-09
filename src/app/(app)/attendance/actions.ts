'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { markAttendance } from '@/server/modules/attendance/service'
import { markAttendanceSchema } from '@/server/modules/attendance/schema'
import { checkIn, checkOut } from '@/server/modules/staff-attendance/service'
import { checkInSchema, overrideAttendance, manualMarkSchema } from '@/server/modules/staff-attendance/service'

export type SaveResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

/** Saves a section register. Called from the marker with the whole roll. */
export async function saveAttendanceAction(payload: unknown): Promise<SaveResult> {
  const ctx = await requireContext('attendance.mark')

  try {
    const input = markAttendanceSchema.parse(payload)
    const result = await markAttendance(ctx, input)

    revalidatePath('/attendance')
    revalidatePath('/')

    const parts = [`${result.saved} students saved`]
    if (result.updated > 0) parts.push(`${result.updated} changed`)
    if (result.absentNotified > 0) parts.push(`${result.absentNotified} parents notified`)

    return { ok: true, message: parts.join(' · ') }
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: err.issues[0]?.message ?? 'The register could not be saved' }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The register could not be saved',
    }
  }
}

export type CheckInState = {
  ok: boolean | null
  message: string
  distanceM?: number
  status?: string
}

/**
 * Geofenced check-in. The browser supplies coordinates; this action forwards
 * them to the service, which decides. Nothing the client sends can assert that
 * it is inside the fence.
 */
export async function checkInAction(payload: unknown): Promise<CheckInState> {
  const ctx = await requireContext('staff_attendance.mark')

  try {
    const input = checkInSchema.parse(payload)
    const result = await checkIn(ctx, input)

    revalidatePath('/attendance/me')
    return {
      ok: result.ok,
      message: result.message,
      distanceM: result.distanceM,
      status: result.status,
    }
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: 'Your device did not report a usable location' }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Attendance could not be marked',
    }
  }
}

export async function checkOutAction(): Promise<CheckInState> {
  const ctx = await requireContext('staff_attendance.mark')
  try {
    const result = await checkOut(ctx)
    revalidatePath('/attendance/me')
    return { ok: result.ok, message: result.message }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Check-out failed',
    }
  }
}

export async function overrideStaffAttendanceAction(payload: unknown): Promise<SaveResult> {
  const ctx = await requireContext('staff_attendance.manage')
  try {
    await overrideAttendance(ctx, manualMarkSchema.parse(payload))
    revalidatePath('/attendance/staff')
    return { ok: true, message: 'Attendance corrected and recorded in the audit log' }
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: err.issues[0]?.message ?? 'Invalid correction' }
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'The correction could not be saved',
    }
  }
}
