'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireSupportContext } from '@/server/context'
import {
  createTenantTicket,
  replyTenantTicket,
} from '@/server/modules/platform/support'
import { supportMessageSchema, supportTicketCreateSchema } from '@/server/modules/platform/schema'
import { redirectWithFormError } from '@/server/modules/platform/action-errors'

export async function createTicketAction(formData: FormData) {
  const ctx = await requireSupportContext('support.create')
  const parsed = supportTicketCreateSchema.safeParse({
    subject: formData.get('subject'),
    body: formData.get('body'),
    category: formData.get('category') || undefined,
    priority: formData.get('priority') ?? 'NORMAL',
  })
  if (!parsed.success) redirectWithFormError('/help/tickets', parsed.error)

  const ticket = await createTenantTicket(ctx, parsed.data)
  revalidatePath('/help/tickets')
  redirect(`/help/tickets/${ticket.id}`)
}

export async function replyTicketAction(id: string, formData: FormData) {
  const ctx = await requireSupportContext('support.create')
  const parsed = supportMessageSchema.safeParse({ body: formData.get('body') })
  if (!parsed.success) redirectWithFormError(`/help/tickets/${id}`, parsed.error)

  await replyTenantTicket(ctx, id, parsed.data)
  revalidatePath(`/help/tickets/${id}`)
}
