'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requirePlatformContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import type { FormState } from '@/lib/form-state'
import type { BulkRecipient } from '@/lib/bulk-mail'
import {
  addUnsubscribe,
  campaignSchema,
  cancelCampaign,
  checkRecipients,
  createCampaign,
  previewCampaign,
  retryFailed,
  sendCampaignBatch,
  sendCampaignTest,
  type BatchResult,
} from '@/server/modules/platform/mail/campaigns'

function message(error: unknown, fallback: string): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? fallback
  if (error instanceof ApiException) return error.message
  return error instanceof Error ? error.message : fallback
}

export async function checkRecipientsAction(emails: string[]) {
  const ctx = await requirePlatformContext()
  try {
    return { ok: true as const, ...(await checkRecipients(ctx, emails)) }
  } catch (error) {
    return { ok: false as const, error: message(error, 'Could not check the list') }
  }
}

export async function previewCampaignAction(
  payload: unknown,
  sample: Partial<BulkRecipient>,
): Promise<{ html?: string; error?: string }> {
  const ctx = await requirePlatformContext()
  try {
    const input = campaignSchema.pick({ mailboxId: true, subject: true, bodyHtml: true, layout: true, demoButton: true, includeSignature: true }).parse(payload)
    const { html } = await previewCampaign(ctx, { ...input, subject: input.subject }, sample)
    return { html }
  } catch (error) {
    return { error: message(error, 'Could not build the preview') }
  }
}

export async function sendCampaignTestAction(
  payload: unknown,
  sample: Partial<BulkRecipient>,
): Promise<{ ok: boolean; message: string }> {
  const ctx = await requirePlatformContext()
  try {
    const input = campaignSchema.parse(payload)
    const { to } = await sendCampaignTest(ctx, input, sample)
    return { ok: true, message: `Test sent to ${to}, personalised for the first school on the list.` }
  } catch (error) {
    return { ok: false, message: message(error, 'The test could not be sent') }
  }
}

export async function createCampaignAction(payload: unknown): Promise<{ id?: string; error?: string }> {
  const ctx = await requirePlatformContext()
  try {
    const campaign = await createCampaign(ctx, campaignSchema.parse(payload))
    revalidatePath('/platform/mail/campaigns')
    return { id: campaign.id }
  } catch (error) {
    return { error: message(error, 'Could not create the campaign') }
  }
}

export async function sendBatchAction(id: string, size: number): Promise<{ result?: BatchResult; error?: string }> {
  const ctx = await requirePlatformContext()
  try {
    const result = await sendCampaignBatch(ctx, id, size)
    revalidatePath(`/platform/mail/campaigns/${id}`)
    revalidatePath('/platform/mail/campaigns')
    return { result }
  } catch (error) {
    return { error: message(error, 'The batch could not be sent') }
  }
}

export async function retryFailedAction(id: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await requirePlatformContext()
  try {
    const count = await retryFailed(ctx, id)
    revalidatePath(`/platform/mail/campaigns/${id}`)
    return { ok: true, message: count ? `${count} school${count === 1 ? '' : 's'} queued again` : 'Nothing to retry' }
  } catch (error) {
    return { ok: false, message: message(error, 'Could not queue the retries') }
  }
}

export async function cancelCampaignAction(id: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await requirePlatformContext()
  try {
    await cancelCampaign(ctx, id)
    revalidatePath(`/platform/mail/campaigns/${id}`)
    revalidatePath('/platform/mail/campaigns')
    return { ok: true, message: 'Campaign cancelled. No more emails will go out from it.' }
  } catch (error) {
    return { ok: false, message: message(error, 'Could not cancel the campaign') }
  }
}

export async function addUnsubscribeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformContext()
  try {
    const email = String(formData.get('email') ?? '')
    await addUnsubscribe(ctx, email, String(formData.get('reason') ?? '') || null)
    revalidatePath('/platform/mail/campaigns/unsubscribes')
    return { ok: true, error: null, fieldErrors: {}, message: `${email.trim().toLowerCase()} will not be emailed again` }
  } catch (error) {
    return { error: message(error, 'Could not add the address'), fieldErrors: {} }
  }
}
