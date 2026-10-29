import { z } from 'zod'
import type { PlatformContext } from '@/server/context'
import { ForbiddenError } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, notFound } from '@/server/api/response'
import { normalizePhone } from '@/server/auth/phone'
import { REMINDER_SCOPES } from '@/lib/growth-reminders'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null)

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === 'on' || v === 'true')

export const recipientSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  whatsapp: optionalText(20),
  email: optionalText(120).refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid email'),
  userId: optionalText(40),
  scope: z.enum(REMINDER_SCOPES).default('TEAM'),
  morning: checkbox,
  evening: checkbox,
  meetings: checkbox,
})

export type RecipientInput = z.infer<typeof recipientSchema>

function assertPerm(ctx: PlatformContext, key: string) {
  if (!ctx.user.permissions.has(key)) throw new ForbiddenError(`Missing permission: ${key}`)
}

async function log(ctx: PlatformContext, action: string, entityId: string, summary: string) {
  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    action,
    module: 'growth',
    entityType: 'CrmReminderRecipient',
    entityId,
    summary,
  })
}

export async function listRecipients(ctx: PlatformContext) {
  assertPerm(ctx, 'platform.crm')
  return ctx.db.crmReminderRecipient.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { user: { select: { firstName: true, lastName: true } } },
  })
}

async function clean(ctx: PlatformContext, input: RecipientInput) {
  const whatsapp = input.whatsapp ? normalizePhone(input.whatsapp) : null
  if (input.whatsapp && !whatsapp) throw badRequest('Enter a valid WhatsApp number, e.g. 98765 43210')
  if (!whatsapp && !input.email) throw badRequest('Add a WhatsApp number or an email')
  if (input.scope === 'MINE' && !input.userId) {
    throw badRequest('"Only their follow-ups" needs the CRM login this person uses')
  }
  if (input.userId) {
    const user = await ctx.db.user.findFirst({ where: { id: input.userId, tenantId: null, deletedAt: null } })
    if (!user) throw badRequest('That CRM login no longer exists')
  }
  return { ...input, whatsapp }
}

export async function createRecipient(ctx: PlatformContext, input: RecipientInput) {
  assertPerm(ctx, 'platform.crm_comms')
  const row = await ctx.db.crmReminderRecipient.create({ data: await clean(ctx, input) })
  await log(ctx, 'crm.reminder_recipient.create', row.id, `Added ${row.name} to sales reminders`)
  return row
}

export async function updateRecipient(ctx: PlatformContext, id: string, input: RecipientInput) {
  assertPerm(ctx, 'platform.crm_comms')
  const existing = await ctx.db.crmReminderRecipient.findUnique({ where: { id } })
  if (!existing) throw notFound('Recipient')
  const row = await ctx.db.crmReminderRecipient.update({ where: { id }, data: await clean(ctx, input) })
  await log(ctx, 'crm.reminder_recipient.update', id, `Updated sales reminders for ${row.name}`)
}

export async function setRecipientActive(ctx: PlatformContext, id: string, isActive: boolean) {
  assertPerm(ctx, 'platform.crm_comms')
  const row = await ctx.db.crmReminderRecipient.update({ where: { id }, data: { isActive } })
  await log(ctx, 'crm.reminder_recipient.update', id, `${isActive ? 'Resumed' : 'Paused'} sales reminders for ${row.name}`)
}

export async function deleteRecipient(ctx: PlatformContext, id: string) {
  assertPerm(ctx, 'platform.crm_comms')
  const row = await ctx.db.crmReminderRecipient.delete({ where: { id } })
  await log(ctx, 'crm.reminder_recipient.delete', id, `Removed ${row.name} from sales reminders`)
}
