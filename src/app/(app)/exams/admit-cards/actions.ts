'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import {
  approveAdmitCard,
  admitCardRejectSchema,
  generateAdmitCards,
  refreshAdmitCardFees,
  rejectAdmitCard,
} from '@/server/modules/exams/admit-cards'

export async function generateAdmitCardsAction(
  examId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await generateAdmitCards(await requireContext('exams.admit_cards'), examId)
    revalidatePath(`/exams/${examId}/admit-cards`)
    return {
      ok: true,
      message:
        result.created > 0
          ? `Generated ${result.created} admit cards (${result.total} total).`
          : `All ${result.total} students already have admit cards.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not generate admit cards' }
  }
}

export async function refreshAdmitCardFeesAction(
  examId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await refreshAdmitCardFees(await requireContext('exams.admit_cards'), examId)
    revalidatePath(`/exams/${examId}/admit-cards`)
    return { ok: true, message: `Refreshed fee status for ${result.updated} pending cards.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not refresh fees' }
  }
}

export async function approveAdmitCardAction(id: string, examId: string): Promise<{ ok: boolean; message: string }> {
  try {
    await approveAdmitCard(await requireContext('exams.admit_approve'), id)
    revalidatePath(`/exams/${examId}/admit-cards`)
    return { ok: true, message: 'Admit card approved.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not approve admit card' }
  }
}

export async function rejectAdmitCardAction(
  id: string,
  examId: string,
  reason: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    await rejectAdmitCard(await requireContext('exams.admit_approve'), admitCardRejectSchema.parse({ id, reason }))
    revalidatePath(`/exams/${examId}/admit-cards`)
    return { ok: true, message: 'Admit card rejected.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not reject admit card' }
  }
}
