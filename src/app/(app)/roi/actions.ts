'use server'

import { ZodError, z } from 'zod'
import { requireContext } from '@/server/context'
import { listRoiCalculations, saveRoiCalculation } from '@/server/modules/roi/service'
import { roiInputsSchema } from '@/lib/roi/validation'

type Result = { ok: true; message: string; id: string } | { ok: false; message: string }

const saveSchema = z.object({
  schoolName: z.string().trim().min(1, 'Name the school').max(160),
  contactName: z.string().trim().max(120).optional(),
  email: z.string().trim().email('Enter a valid email').max(160).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  scenario: z.enum(['CONSERVATIVE', 'EXPECTED', 'OPTIMISTIC']),
  inputs: roiInputsSchema,
  assumptions: z.record(z.unknown()),
  results: z.record(z.unknown()),
  netMonthlyBenefit: z.number().finite(),
  roiPercent: z.number().finite().nullable(),
})

/**
 * Stores a calculation as it was presented.
 *
 * Inputs and assumptions go in beside the results so the figure can be
 * re-derived weeks later rather than merely re-read — a saved total nobody can
 * reconstruct is worth nothing in the follow-up meeting.
 */
export async function saveRoiCalculationAction(payload: unknown): Promise<Result> {
  const ctx = await requireContext('roi.view')

  try {
    const input = saveSchema.parse(payload)
    const saved = await saveRoiCalculation(ctx, {
      schoolName: input.schoolName,
      contactName: input.contactName || undefined,
      email: input.email || undefined,
      phone: input.phone || undefined,
      studentCount: input.inputs.profile.students,
      scenario: input.scenario,
      includeRevenue: input.inputs.includeRevenueInRoi,
      inputs: input.inputs,
      assumptions: input.assumptions,
      results: input.results,
      netMonthlyBenefit: input.netMonthlyBenefit,
      roiPercent: input.roiPercent,
    })

    return { ok: true, message: 'Saved. You can reopen this figure and defend it later.', id: saved.id }
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: err.issues[0]?.message ?? 'Check the details and try again' }
    }
    return { ok: false, message: err instanceof Error ? err.message : 'It could not be saved' }
  }
}

export async function listRoiCalculationsAction() {
  const ctx = await requireContext('roi.view')
  return listRoiCalculations(ctx)
}
