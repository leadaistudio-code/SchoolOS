'use server'

import { revalidatePath } from 'next/cache'
import { ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  compose,
  composeSchema,
  markRead,
  reply,
  replySchema,
  setArchived,
  setStarred,
} from '@/server/modules/messages/service'
import type { FormState } from '@/lib/form-state'

const MAILBOX = '/communication/messages'

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export async function composeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const ctx = await requireContext('messages.send')
    await compose(
      ctx,
      composeSchema.parse({
        recipientIds: formData.getAll('recipientIds'),
        subject: formData.get('subject'),
        body: formData.get('body'),
      }),
    )
    revalidatePath(MAILBOX)
    return { ok: true, error: null, fieldErrors: {} }
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        error: 'Please complete the message',
        fieldErrors: Object.fromEntries(
          error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      }
    }
    return { error: message(error, 'The message could not be sent'), fieldErrors: {} }
  }
}

export async function replyAction(
  conversationId: string,
  body: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const ctx = await requireContext('messages.send')
    await reply(ctx, replySchema.parse({ conversationId, body }))
    revalidatePath(MAILBOX)
    return { ok: true, message: 'Reply sent.' }
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? 'Write a reply first' }
    }
    return { ok: false, message: message(error, 'The reply could not be sent') }
  }
}

export async function toggleStarAction(
  conversationId: string,
  starred: boolean,
): Promise<{ ok: boolean; message: string }> {
  try {
    await setStarred(await requireContext('messages.view'), conversationId, starred)
    revalidatePath(MAILBOX)
    return { ok: true, message: starred ? 'Starred.' : 'Star removed.' }
  } catch (error) {
    return { ok: false, message: message(error, 'That could not be changed') }
  }
}

export async function toggleArchiveAction(
  conversationId: string,
  archived: boolean,
): Promise<{ ok: boolean; message: string }> {
  try {
    await setArchived(await requireContext('messages.view'), conversationId, archived)
    revalidatePath(MAILBOX)
    return {
      ok: true,
      message: archived ? 'Moved to archive.' : 'Moved back to the inbox.',
    }
  } catch (error) {
    return { ok: false, message: message(error, 'That could not be changed') }
  }
}

export async function markReadAction(
  conversationId: string,
  read: boolean,
): Promise<{ ok: boolean; message: string }> {
  try {
    await markRead(await requireContext('messages.view'), conversationId, read)
    revalidatePath(MAILBOX)
    return { ok: true, message: read ? 'Marked as read.' : 'Marked as unread.' }
  } catch (error) {
    return { ok: false, message: message(error, 'That could not be changed') }
  }
}
