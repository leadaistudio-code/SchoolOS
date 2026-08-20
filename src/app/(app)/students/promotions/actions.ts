'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import { applyPromotion, planPromotion, type PromotionPlan, type PromotionResult } from '@/server/modules/students/promotion'
import { promotionApplySchema, promotionPlanSchema } from '@/server/modules/students/schema'

type PlanState =
  | { ok: true; plan: PromotionPlan }
  | { ok: false; message: string }

type ApplyState =
  | { ok: true; result: PromotionResult; message: string }
  | { ok: false; message: string }

function message(err: unknown, fallback: string): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? fallback
  return err instanceof Error ? err.message : fallback
}

/**
 * Builds the review list.
 *
 * Deliberately a read: the planner is re-run every time the class or the
 * target session changes, and running it must never leave a trace or move a
 * child.
 */
export async function planPromotionAction(payload: unknown): Promise<PlanState> {
  const ctx = await requireContext('students.promote')

  try {
    const input = promotionPlanSchema.parse(payload)
    return { ok: true, plan: await planPromotion(ctx, input) }
  } catch (err) {
    return { ok: false, message: message(err, 'Could not build the promotion list') }
  }
}

export async function applyPromotionAction(payload: unknown): Promise<ApplyState> {
  const ctx = await requireContext('students.promote')

  try {
    const input = promotionApplySchema.parse(payload)
    const result = await applyPromotion(ctx, input)

    const parts = [
      result.promoted ? `${result.promoted} promoted` : null,
      result.repeated ? `${result.repeated} repeated` : null,
      result.graduated ? `${result.graduated} graduated` : null,
      result.transferred ? `${result.transferred} transferred out` : null,
    ].filter(Boolean)

    // Placement, class lists, dashboards and the roll all read from
    // Enrollment, so the whole app layout is stale after a promotion.
    revalidatePath('/', 'layout')

    return {
      ok: true,
      result,
      message: parts.length ? parts.join(', ') : 'Nothing changed',
    }
  } catch (err) {
    return { ok: false, message: message(err, 'The promotion could not be applied') }
  }
}
