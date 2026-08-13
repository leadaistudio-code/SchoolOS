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
