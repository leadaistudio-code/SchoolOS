'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  cancelGatePass,
  createGatePass,
  lookupGatePass,
  markGatePassExited,
  pickupCandidates,
  resendGatePassOtp,
  searchStudentsForPass,
  verifyGatePassOtp,
  type GatePassInput,
} from '@/server/modules/front-office/gate-pass'

export type ActionResult = { ok: boolean; message: string }

function message(error: unknown, fallback: string) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? fallback
  return error instanceof Error ? error.message : fallback
}

function refresh(id?: string) {
  revalidatePath('/front-office/gate-passes')
  if (id) revalidatePath(`/front-office/gate-passes/${id}`)
}

export async function searchStudentsAction(q: string) {
  const ctx = await requireContext('frontoffice.gatepass')
  return searchStudentsForPass(ctx, q)
}

export async function pickupCandidatesAction(studentId: string) {
  const ctx = await requireContext('frontoffice.gatepass')
  try {
    return { ok: true as const, student: await pickupCandidates(ctx, studentId) }
  } catch (error) {
    return { ok: false as const, message: message(error, 'Could not load the student') }
  }
}

export async function createGatePassAction(
  input: GatePassInput,
): Promise<ActionResult & { id?: string; awaitingOtp?: boolean; sentTo?: string | null }> {
  const ctx = await requireContext('frontoffice.gatepass')
  try {
    const pass = await createGatePass(ctx, input)
    refresh()
    return {
      ok: true,
      id: pass.id,
      awaitingOtp: pass.status === 'AWAITING_OTP',
      sentTo: pass.otpSentTo,
      message: pass.status === 'AWAITING_OTP' ? `Code sent to ${pass.otpSentTo}` : `Pass ${pass.passNumber} approved`,
    }
  } catch (error) {
    return { ok: false, message: message(error, 'Could not issue the pass') }
  }
}

export async function verifyOtpAction(id: string, code: string): Promise<ActionResult> {
  const ctx = await requireContext('frontoffice.gatepass')
  try {
    await verifyGatePassOtp(ctx, id, code)
    refresh(id)
    return { ok: true, message: 'Guardian approved. The student can go.' }
  } catch (error) {
    return { ok: false, message: message(error, 'Could not check the code') }
  }
}

export async function resendOtpAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('frontoffice.gatepass')
  try {
    const pass = await resendGatePassOtp(ctx, id)
    refresh(id)
    return { ok: true, message: `New code sent to ${pass.otpSentTo}` }
  } catch (error) {
    return { ok: false, message: message(error, 'Could not resend') }
  }
}

export async function cancelGatePassAction(id: string, reason: string): Promise<ActionResult> {
  const ctx = await requireContext('frontoffice.gatepass')
  try {
    await cancelGatePass(ctx, id, reason)
    refresh(id)
    return { ok: true, message: 'Pass cancelled' }
  } catch (error) {
    return { ok: false, message: message(error, 'Could not cancel') }
  }
}

export async function lookupPassAction(code: string) {
  const ctx = await requireContext('frontoffice.gate')
  try {
    return { ok: true as const, pass: await lookupGatePass(ctx, code) }
  } catch (error) {
    return { ok: false as const, message: message(error, 'Pass not found') }
  }
}

export async function markExitedAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext('frontoffice.gate')
  try {
    const { told } = await markGatePassExited(ctx, id)
    refresh(id)
    return { ok: true, message: told ? 'Scanned out. Parents have been told.' : 'Scanned out. No parent contact on file.' }
  } catch (error) {
    return { ok: false, message: message(error, 'Could not scan out') }
  }
}
