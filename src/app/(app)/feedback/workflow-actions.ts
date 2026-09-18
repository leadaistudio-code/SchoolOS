'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  actionItemSchema,
  actionUpdateSchema,
  createActionItem,
  concernUpdateSchema,
  moderateAnswer,
  moderationSchema,
  updateActionItem,
  updateConcern,
} from '@/server/modules/feedback/service'

/**
 * The three review workflows that follow a campaign: reading comments,
 * handling confidential concerns, and tracking what the school does next.
 *
 * Kept apart from `actions.ts` so a page under `/feedback/actions` can import
 * them without the module specifier colliding with its own route directory.
 */
export type Result = { ok: true; message: string } | { ok: false; message: string }

const failure = (error: unknown, fallback: string): Result => ({
  ok: false,
  message:
    error instanceof ZodError
      ? (error.issues[0]?.message ?? fallback)
      : error instanceof Error
        ? error.message
        : fallback,
})

export async function moderateAnswerAction(payload: unknown): Promise<Result> {
  try {
    const ctx = await requireContext('feedback.moderate')
    await moderateAnswer(ctx, moderationSchema.parse(payload))
    revalidatePath('/feedback/moderation')
    revalidatePath('/feedback')
    return { ok: true, message: 'Decision recorded.' }
  } catch (error) {
    return failure(error, 'The decision could not be saved')
  }
}

export async function updateConcernAction(payload: unknown): Promise<Result> {
  try {
    const ctx = await requireContext('feedback.concern_manage')
    await updateConcern(ctx, concernUpdateSchema.parse(payload))
    revalidatePath('/feedback/concerns')
    revalidatePath('/feedback')
    return { ok: true, message: 'Concern updated.' }
  } catch (error) {
    return failure(error, 'The concern could not be updated')
  }
}

export async function updateActionItemAction(payload: unknown): Promise<Result> {
  try {
    const ctx = await requireContext('feedback.action_manage')
    await updateActionItem(ctx, actionUpdateSchema.parse(payload))
    revalidatePath('/feedback/actions')
    revalidatePath('/feedback')
    return { ok: true, message: 'Action item updated.' }
  } catch (error) {
    return failure(error, 'The action item could not be updated')
  }
}

export async function bulkUpdateActionItemsAction(payload: {
  ids: string[]
  status?: 'IN_PROGRESS' | 'WAITING'
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
}): Promise<Result> {
  try {
    const ctx = await requireContext('feedback.action_manage')
    const ids = [...new Set(payload.ids)].slice(0, 100)
    if (ids.length === 0) return { ok: false, message: 'Select at least one action item.' }
    if (!payload.status && !payload.priority) {
      return { ok: false, message: 'Choose a status or priority to apply.' }
    }

    const items = await ctx.db.feedbackActionItem.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    })
    let updated = 0
    let failed = ids.length - items.length

    for (let offset = 0; offset < items.length; offset += 10) {
      const results = await Promise.allSettled(
        items.slice(offset, offset + 10).map((item) =>
          updateActionItem(ctx, actionUpdateSchema.parse({
            id: item.id,
            status: payload.status ?? item.status,
            priority: payload.priority,
          })),
        ),
      )
      for (const result of results) {
        if (result.status === 'fulfilled') updated += 1
        else failed += 1
      }
    }

    revalidatePath('/feedback/actions')
    revalidatePath('/feedback')
    return {
      ok: failed === 0,
      message: failed
        ? `${updated} updated; ${failed} could not be updated.`
        : `${updated} action item${updated === 1 ? '' : 's'} updated.`,
    }
  } catch (error) {
    return failure(error, 'The action items could not be updated')
  }
}

export async function createFeedbackActionAction(payload: unknown): Promise<Result> {
  try {
    const ctx = await requireContext('feedback.action_manage')
    await createActionItem(ctx, actionItemSchema.parse(payload))
    revalidatePath('/feedback/actions')
    revalidatePath('/feedback')
    return { ok: true, message: 'Action item created.' }
  } catch (error) {
    return failure(error, 'The action item could not be created')
  }
}
