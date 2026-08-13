import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import {
  TEMPLATE_EVENTS,
  notificationTemplateSchema,
  type NotificationTemplateInput,
} from './schema'
import { renderTemplate } from '@/lib/notification-templates'

export { renderTemplate }

export async function listNotificationTemplates(ctx: AppContext) {
  ctx.require('settings.manage')
  return ctx.db.notificationTemplate.findMany({
    where: { OR: [{ tenantId: ctx.tenant.id }, { tenantId: null }] },
    orderBy: [{ eventKey: 'asc' }, { channel: 'asc' }],
  })
}

export async function upsertNotificationTemplate(ctx: AppContext, raw: NotificationTemplateInput) {
  ctx.require('settings.manage')
  const input = notificationTemplateSchema.parse(raw)

  const existing = await ctx.db.notificationTemplate.findFirst({
    where: { tenantId: ctx.tenant.id, eventKey: input.eventKey, channel: input.channel },
  })

  const template = existing
    ? await ctx.db.notificationTemplate.update({
        where: { id: existing.id },
        data: {
          subject: input.subject ?? null,
          body: input.body,
          isActive: input.isActive,
        },
      })
    : await ctx.db.notificationTemplate.create({
        data: {
          tenantId: ctx.tenant.id,
          eventKey: input.eventKey,
          channel: input.channel,
          subject: input.subject ?? null,
          body: input.body,
          isActive: input.isActive,
        },
      })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'settings.template.upsert',
    module: 'settings',
    entityType: 'NotificationTemplate',
    entityId: template.id,
    summary: `Saved ${input.channel} template for ${input.eventKey}`,
  })

  return template
}

export async function deleteNotificationTemplate(ctx: AppContext, id: string) {
  ctx.require('settings.manage')
  const row = await ctx.db.notificationTemplate.findFirst({
    where: { id, tenantId: ctx.tenant.id },
  })
  if (!row) throw notFound('Template not found')
  if (!row.tenantId) throw conflict('Built-in templates cannot be deleted')
  await ctx.db.notificationTemplate.delete({ where: { id } })
}

export async function ensureDefaultTemplates(ctx: AppContext) {
  ctx.require('settings.manage')
  for (const event of TEMPLATE_EVENTS) {
    for (const channel of ['EMAIL', 'SMS'] as const) {
      const existing = await ctx.db.notificationTemplate.findFirst({
        where: { tenantId: ctx.tenant.id, eventKey: event.key, channel },
      })
      if (existing) continue
      await ctx.db.notificationTemplate.create({
        data: {
          tenantId: ctx.tenant.id,
          eventKey: event.key,
          channel,
          subject: channel === 'EMAIL' ? event.label : null,
          body:
            channel === 'SMS'
              ? `{{school_name}}: ${event.label} for {{student_name}}. {{detail}}`
              : `Dear {{parent_name}},\n\n${event.label} regarding {{student_name}}.\n\n{{detail}}\n\nRegards,\n{{school_name}}`,
          isActive: true,
        },
      })
    }
  }
}

