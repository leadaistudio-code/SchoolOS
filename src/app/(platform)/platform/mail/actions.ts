'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ZodError } from 'zod'
import { requirePlatformContext } from '@/server/context'
import { ApiException } from '@/server/api/response'
import type { FormState } from '@/lib/form-state'
import { composeSchema, mailboxSchema } from '@/server/modules/platform/mail/schema'
import {
  deleteDocument,
  deleteMailbox,
  previewMail,
  saveMailbox,
  sendMail,
  sendTestMail,
  testMailbox,
  uploadDocument,
} from '@/server/modules/platform/mail/service'
import { logInboundToCrm, updateMessage, type MessageAction } from '@/server/modules/platform/mail/inbox'

function fail(error: unknown, fallback: string): FormState {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of error.issues) fieldErrors[issue.path.join('.') || 'form'] = issue.message
    return { error: Object.values(fieldErrors)[0] ?? 'Please correct the highlighted fields', fieldErrors }
  }
  if (error instanceof ApiException) return { error: error.message, fieldErrors: {} }
  return { error: error instanceof Error ? error.message : fallback, fieldErrors: {} }
}

function isRedirect(error: unknown) {
  return typeof error === 'object' && error !== null && 'digest' in error
}

function composeFrom(formData: FormData) {
  const input = composeSchema.parse({
    mailboxId: formData.get('mailboxId') ?? '',
    to: formData.get('to') ?? '',
    cc: formData.get('cc') ?? '',
    bcc: formData.get('bcc') ?? '',
    subject: formData.get('subject') ?? '',
    bodyHtml: formData.get('bodyHtml') ?? '',
    layout: formData.get('layout') ?? 'BRANDED',
    demoButton: formData.get('demoButton') ?? '',
    includeSignature: formData.get('includeSignature') ?? '',
    crmSchoolId: formData.get('crmSchoolId') ?? '',
    documentIds: formData.getAll('documentId').map(String).filter(Boolean),
    inReplyTo: formData.get('inReplyTo') ?? '',
    references: formData.get('references') ?? '',
    origin: formData.get('originUid')
      ? {
          mailboxId: formData.get('originMailboxId'),
          folder: formData.get('originFolder'),
          uid: formData.get('originUid'),
        }
      : null,
    forwardParts: formData.getAll('forwardPart').map(String).filter(Boolean),
  })
  const files = formData
    .getAll('files')
    .filter((f): f is File => typeof f === 'object' && f !== null && 'size' in f && f.size > 0)
  if (files.length > 10) throw new ApiException(400, 'BAD_REQUEST', 'Attach at most 10 files at once')
  return { input, files }
}

export async function saveMailboxAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformContext()
  try {
    const box = await saveMailbox(ctx, mailboxSchema.parse(Object.fromEntries(formData.entries())))
    revalidatePath('/platform/mail', 'layout')
    return {
      ok: true,
      error: null,
      fieldErrors: {},
      message: `${box.fromEmail} saved. Run “Test connection” to confirm it can send.`,
    }
  } catch (error) {
    return fail(error, 'Could not save the mailbox')
  }
}

export async function deleteMailboxAction(id: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await requirePlatformContext()
  try {
    await deleteMailbox(ctx, id)
    revalidatePath('/platform/mail', 'layout')
    return { ok: true, message: 'Mailbox disconnected' }
  } catch (error) {
    return { ok: false, message: fail(error, 'Could not remove the mailbox').error! }
  }
}

export async function testMailboxAction(
  id: string,
  sendTo: string | null,
): Promise<{ ok: boolean; message: string }> {
  const ctx = await requirePlatformContext()
  try {
    const result = await testMailbox(ctx, id, sendTo?.trim() || null)
    revalidatePath('/platform/mail/settings')
    return result
  } catch (error) {
    return { ok: false, message: fail(error, 'The test could not run').error! }
  }
}

export async function uploadDocumentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformContext()
  try {
    const file = formData.get('file')
    if (!(file && typeof file === 'object' && 'size' in file && file.size > 0)) {
      return { error: 'Choose a file to upload', fieldErrors: { file: 'Choose a file' } }
    }
    const doc = await uploadDocument(ctx, String(formData.get('title') ?? ''), file as File)
    revalidatePath('/platform/mail', 'layout')
    return { ok: true, error: null, fieldErrors: {}, message: `“${doc.title}” added to the library` }
  } catch (error) {
    return fail(error, 'Could not upload the document')
  }
}

export async function deleteDocumentAction(id: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await requirePlatformContext()
  try {
    await deleteDocument(ctx, id)
    revalidatePath('/platform/mail', 'layout')
    return { ok: true, message: 'Removed from the library' }
  } catch (error) {
    return { ok: false, message: fail(error, 'Could not remove the document').error! }
  }
}

export async function previewMailAction(formData: FormData): Promise<{ html?: string; error?: string }> {
  const ctx = await requirePlatformContext()
  try {
    const { input } = composeFrom(formData)
    return { html: await previewMail(ctx, input) }
  } catch (error) {
    return { error: fail(error, 'Could not build the preview').error! }
  }
}

export async function sendMailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requirePlatformContext()
  const intent = formData.get('intent')
  let sentId: string | null = null
  try {
    const { input, files } = composeFrom(formData)
    if (intent === 'test') {
      const { to } = await sendTestMail(ctx, input, files)
      return { ok: true, error: null, fieldErrors: {}, message: `Test sent to ${to}. Check your inbox to see it as recipients will.` }
    }
    const result = await sendMail(ctx, input, files)
    revalidatePath('/platform/mail')
    if (result.error) return { error: `Not sent: ${result.error}`, fieldErrors: {} }
    sentId = result.email.id
  } catch (error) {
    if (isRedirect(error)) throw error
    return fail(error, 'The email could not be sent')
  }
  redirect(`/platform/mail/${sentId}?sent=1`)
}

export async function updateMessageAction(
  mailboxId: string,
  folder: string,
  uid: number,
  action: MessageAction,
): Promise<{ ok: boolean; message: string }> {
  const ctx = await requirePlatformContext()
  try {
    const result = await updateMessage(ctx, mailboxId, folder, uid, action)
    revalidatePath('/platform/mail/inbox', 'layout')
    const messages: Record<MessageAction, string> = {
      read: 'Marked as read',
      unread: 'Marked as unread',
      flag: 'Starred',
      unflag: 'Star removed',
      trash: 'Moved to Trash',
      inbox: 'Moved to Inbox',
      archive: 'Archived',
    }
    return { ok: true, message: result.movedTo || !['trash', 'inbox', 'archive'].includes(action) ? messages[action] : 'Already there' }
  } catch (error) {
    return { ok: false, message: fail(error, 'The mail server did not accept that change').error! }
  }
}

export async function logInboundAction(
  mailboxId: string,
  folder: string,
  uid: number,
  schoolId: string,
): Promise<{ ok: boolean; message: string }> {
  const ctx = await requirePlatformContext()
  try {
    const { alreadyLogged } = await logInboundToCrm(ctx, mailboxId, folder, uid, schoolId)
    revalidatePath(`/platform/growth/schools/${schoolId}`)
    return { ok: true, message: alreadyLogged ? 'Already on the school’s timeline' : 'Added to the school’s timeline' }
  } catch (error) {
    return { ok: false, message: fail(error, 'Could not log the email').error! }
  }
}
