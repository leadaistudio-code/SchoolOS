'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  cancelTransferCertificate,
  issueTransferCertificate,
  tcPrefill,
} from '@/server/modules/students/transfer-certificates'

export type TcActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string }

function fail(err: unknown, fallback: string): TcActionResult {
  if (err instanceof ZodError) return { ok: false, message: err.issues[0]?.message ?? fallback }
  return { ok: false, message: err instanceof Error ? err.message : fallback }
}

export async function loadTcPrefillAction(studentId: string) {
  const ctx = await requireContext('students.tc')
  try {
    return { ok: true as const, data: await tcPrefill(ctx, studentId) }
  } catch (err) {
    return fail(err, 'Could not load the student') as { ok: false; message: string }
  }
}

export async function issueTcAction(payload: unknown): Promise<TcActionResult> {
  const ctx = await requireContext('students.tc')
  try {
    const tc = await issueTransferCertificate(ctx, payload)
    revalidatePath('/students', 'layout')
    return { ok: true, id: tc.id, message: `TC ${tc.number} issued.` }
  } catch (err) {
    return fail(err, 'The certificate could not be issued')
  }
}

export async function cancelTcAction(payload: unknown): Promise<TcActionResult> {
  const ctx = await requireContext('students.tc')
  try {
    const res = await cancelTransferCertificate(ctx, payload)
    revalidatePath('/students', 'layout')
    return { ok: true, message: `TC ${res.number} cancelled and the student restored.` }
  } catch (err) {
    return fail(err, 'The certificate could not be cancelled')
  }
}
