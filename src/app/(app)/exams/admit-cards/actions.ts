'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import {
  approveAdmitCard,
  admitCardApproveSchema,
  admitCardRejectSchema,
  generateAdmitCards,
  refreshAdmitCardFees,
  rejectAdmitCard,
  revokeAdmitCardApproval,
} from '@/server/modules/exams/admit-cards'

async function inBatches<T>(
  items: T[],
  size: number,
  run: (item: T) => Promise<void>,
) {
  const errors: string[] = []
  let completed = 0
  for (let index = 0; index < items.length; index += size) {
    const settled = await Promise.allSettled(items.slice(index, index + size).map(run))
    for (const result of settled) {
      if (result.status === 'fulfilled') completed++
      else errors.push(result.reason instanceof Error ? result.reason.message : 'Action failed')
    }
  }
  return { completed, errors }
}

export async function generateAdmitCardsAction(
  examId: string,
  sectionIds?: string[],
): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await generateAdmitCards(
      await requireContext('exams.admit_cards'),
      examId,
      sectionIds,
    )
    revalidatePath(`/exams/${examId}/admit-cards`)
    const skipped =
      result.skippedWithoutPapers > 0
        ? ` Skipped ${result.skippedWithoutPapers} student${result.skippedWithoutPapers === 1 ? '' : 's'} with no section papers.`
        : ''
    return {
      ok: true,
      message:
        result.created > 0
          ? `Generated ${result.created} admit cards (${result.total} total).${skipped}`
          : `All ${result.eligible} eligible students already have admit cards.${skipped}`,
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

export async function approveAdmitCardAction(
  id: string,
  examId: string,
  feeOverrideReason?: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    await approveAdmitCard(
      await requireContext('exams.admit_approve'),
      admitCardApproveSchema.parse({ id, feeOverrideReason }),
    )
    revalidatePath(`/exams/${examId}/admit-cards`)
    return {
      ok: true,
      message: feeOverrideReason
        ? 'Admit card approved with a recorded fee exception.'
        : 'Admit card approved.',
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not approve admit card' }
  }
}

export async function bulkApproveAdmitCardsAction(
  ids: string[],
  examId: string,
): Promise<{ ok: boolean; message: string }> {
  const uniqueIds = [...new Set(ids)].filter(Boolean).slice(0, 250)
  if (uniqueIds.length === 0) return { ok: false, message: 'Select at least one admit card.' }
  const ctx = await requireContext('exams.admit_approve')
  const result = await inBatches(uniqueIds, 10, async (id) => {
      await approveAdmitCard(
        ctx,
        admitCardApproveSchema.parse({ id }),
      )
  })
  revalidatePath(`/exams/${examId}/admit-cards`)
  return {
    ok: result.completed > 0 && result.errors.length === 0,
    message: result.errors.length > 0
      ? `${result.completed} approved; ${result.errors.length} could not be approved. ${result.errors[0]}`
      : `${result.completed} admit card${result.completed === 1 ? '' : 's'} approved.`,
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

export async function bulkRejectAdmitCardsAction(
  ids: string[],
  examId: string,
  reason: string,
): Promise<{ ok: boolean; message: string }> {
  const uniqueIds = [...new Set(ids)].filter(Boolean).slice(0, 250)
  if (uniqueIds.length === 0) return { ok: false, message: 'Select at least one admit card.' }
  const ctx = await requireContext('exams.admit_approve')
  const result = await inBatches(uniqueIds, 10, async (id) => {
      await rejectAdmitCard(ctx, admitCardRejectSchema.parse({ id, reason }))
  })
  revalidatePath(`/exams/${examId}/admit-cards`)
  return {
    ok: result.completed > 0 && result.errors.length === 0,
    message: result.errors.length > 0
      ? `${result.completed} rejected; ${result.errors.length} could not be updated. ${result.errors[0]}`
      : `${result.completed} admit card${result.completed === 1 ? '' : 's'} rejected.`,
  }
}

export async function revokeAdmitCardAction(
  id: string,
  examId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    await revokeAdmitCardApproval(await requireContext('exams.admit_approve'), id)
    revalidatePath(`/exams/${examId}/admit-cards`)
    revalidatePath(`/exams/admit-cards/${id}`)
    return { ok: true, message: 'Approval rolled back. The card is pending again.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not roll back approval' }
  }
}
