'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import { replyToParentQuery, resolveParentQuery } from '@/server/modules/whatsapp-bot/service'

export async function replyAction(id: string, text: string, resolve: boolean): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireContext('messages.parent_queries')
  try {
    const r = await replyToParentQuery(ctx, id, text, resolve)
    revalidatePath('/front-office/parent-queries')
    return { ok: true, message: r.channel === 'sms' ? 'Sent by SMS (WhatsApp did not go through)' : 'Reply sent on WhatsApp' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not send' }
  }
}

export async function resolveAction(id: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireContext('messages.parent_queries')
  try {
    await resolveParentQuery(ctx, id)
    revalidatePath('/front-office/parent-queries')
    return { ok: true, message: 'Marked as resolved' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not update' }
  }
}
