'use server'

import { revalidatePath } from 'next/cache'
import { ZodError, z } from 'zod'
import { requireContext } from '@/server/context'
import { captureSnapshot } from '@/server/modules/score/snapshots'
import { resetWeights, saveWeights } from '@/server/modules/score/weights'
import type { WeightSetting } from '@/lib/score'

type Result<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; message: string }

function message(err: unknown, fallback: string): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? fallback
  return err instanceof Error ? err.message : fallback
}

const weightsSchema = z.object({
  population: z.enum(['STUDENT', 'STAFF']),
  weights: z
    .array(
      z.object({
        metric: z.string().min(1).max(60),
        // Capped rather than unbounded: weights are relative, so a value in the
        // thousands changes nothing except how hard the editor is to read.
        weight: z.coerce.number().int().min(0).max(100),
        isEnabled: z.boolean(),
      }),
    )
    .min(1)
    .max(40),
})

export async function saveWeightsAction(payload: unknown): Promise<Result<WeightSetting[]>> {
  const ctx = await requireContext('score.manage')

  try {
    const input = weightsSchema.parse(payload)
    const saved = await saveWeights(ctx, input.population, input.weights)

    // Every score on every screen is computed from these, so the whole
    // section is stale the moment they change.
    revalidatePath('/score', 'layout')

    return { ok: true, message: 'Weighting saved. Scores now use it.', data: saved }
  } catch (err) {
    return { ok: false, message: message(err, 'The weighting could not be saved') }
  }
}

export async function resetWeightsAction(
  population: 'STUDENT' | 'STAFF',
): Promise<Result<WeightSetting[]>> {
  const ctx = await requireContext('score.manage')

  try {
    const restored = await resetWeights(ctx, population)
    revalidatePath('/score', 'layout')
    return { ok: true, message: 'Back to the standard weighting.', data: restored }
  } catch (err) {
    return { ok: false, message: message(err, 'The weighting could not be reset') }
  }
}

export async function captureSnapshotAction(): Promise<Result> {
  const ctx = await requireContext('score.manage')

  try {
    const result = await captureSnapshot(ctx)
    revalidatePath('/score')
    return {
      ok: true,
      message: `Recorded ${result.score.toFixed(1)} for today across ${result.captured} entries.`,
    }
  } catch (err) {
    return { ok: false, message: message(err, 'Today could not be recorded') }
  }
}
