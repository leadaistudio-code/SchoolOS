import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { ensureDefaultReportCardTemplate as upsertDefaultReportCardTemplate } from './defaults'
import { parseReportCardConfig } from '@/lib/exams/report-card-config'

export const reportCardTemplateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  isDefault: z.coerce.boolean().default(false),
  showAttendance: z.coerce.boolean().default(true),
  showRank: z.coerce.boolean().default(true),
  showRemarks: z.coerce.boolean().default(true),
  headerHtml: z.string().trim().max(4000).nullable().optional(),
  footerHtml: z.string().trim().max(4000).nullable().optional(),
  config: z.unknown().optional().transform((raw) => parseReportCardConfig(raw)),
})

export async function listReportCardTemplates(ctx: AppContext) {
  ctx.require('exams.manage')
  return ctx.db.reportCardTemplate.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
}

export async function getDefaultReportCardTemplate(ctx: AppContext) {
  return ctx.db.reportCardTemplate.findFirst({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
}

export async function createReportCardTemplate(
  ctx: AppContext,
  input: z.infer<typeof reportCardTemplateSchema>,
) {
  ctx.require('exams.manage')
  const existing = await ctx.db.reportCardTemplate.findFirst({ where: { name: input.name } })
  if (existing) throw conflict(`A report card template named ${input.name} already exists`)

  const template = await ctx.db.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.reportCardTemplate.updateMany({ data: { isDefault: false } })
    }
    return tx.reportCardTemplate.create({
      data: {
        tenantId: ctx.tenant.id,
        name: input.name,
        isDefault: input.isDefault,
        showAttendance: input.showAttendance,
        showRank: input.showRank,
        showRemarks: input.showRemarks,
        headerHtml: input.headerHtml ?? null,
        footerHtml: input.footerHtml ?? null,
        config: input.config,
      },
    })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'report_card.template.create',
    module: 'exams',
    entityType: 'ReportCardTemplate',
    entityId: template.id,
    summary: `Created report card template ${template.name}`,
  })

  return template
}

export async function updateReportCardTemplate(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof reportCardTemplateSchema>,
) {
  ctx.require('exams.manage')
  const existing = await ctx.db.reportCardTemplate.findFirst({ where: { id } })
  if (!existing) throw notFound('Report card template')

  const dup = await ctx.db.reportCardTemplate.findFirst({
    where: { name: input.name, id: { not: id } },
  })
  if (dup) throw conflict(`A report card template named ${input.name} already exists`)

  const template = await ctx.db.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.reportCardTemplate.updateMany({ data: { isDefault: false } })
    }
    return tx.reportCardTemplate.update({
      where: { id },
      data: {
        name: input.name,
        isDefault: input.isDefault,
        showAttendance: input.showAttendance,
        showRank: input.showRank,
        showRemarks: input.showRemarks,
        headerHtml: input.headerHtml ?? null,
        footerHtml: input.footerHtml ?? null,
        config: input.config,
      },
    })
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'report_card.template.update',
    module: 'exams',
    entityType: 'ReportCardTemplate',
    entityId: template.id,
    summary: `Updated report card template ${template.name}`,
  })

  return template
}

/** Changes only the theme colour of the default template. */
export async function setDefaultTemplateAccent(ctx: AppContext, accent: string) {
  ctx.require('exams.manage')
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) throw conflict('Choose a valid colour')
  const template = await upsertDefaultReportCardTemplate(ctx.db, ctx.tenant.id)
  const current = await getDefaultReportCardTemplate(ctx)
  const target = current ?? template
  const config = { ...parseReportCardConfig(target.config), accent: accent.toLowerCase() }
  await ctx.db.reportCardTemplate.update({ where: { id: target.id }, data: { config } })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'report_card.template.update',
    module: 'exams',
    entityType: 'ReportCardTemplate',
    entityId: target.id,
    summary: `Changed report card theme colour of ${target.name} to ${config.accent}`,
  })
  return { name: target.name as string, accent: config.accent }
}

export const reportCardDesignSchema = z.object({
  showAttendance: z.boolean(),
  showRank: z.boolean(),
  showRemarks: z.boolean(),
  config: z.unknown().transform((raw) => parseReportCardConfig(raw)),
})

/** Saves the design studio's look and sections onto one template, keeping its name and default flag. */
export async function saveReportCardDesign(
  ctx: AppContext,
  id: string,
  input: z.infer<typeof reportCardDesignSchema>,
) {
  ctx.require('exams.manage')
  const existing = await ctx.db.reportCardTemplate.findFirst({ where: { id } })
  if (!existing) throw notFound('Report card template')
  const before = parseReportCardConfig(existing.config)
  const template = await ctx.db.reportCardTemplate.update({
    where: { id },
    data: {
      showAttendance: input.showAttendance,
      showRank: input.showRank,
      showRemarks: input.showRemarks,
      config: input.config,
    },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'report_card.template.update',
    module: 'exams',
    entityType: 'ReportCardTemplate',
    entityId: template.id,
    summary: `Saved report card design “${input.config.design}” on ${template.name}`,
    before: { design: before.design, accent: before.accent, signatureImages: before.signatureImages },
    after: { design: input.config.design, accent: input.config.accent, signatureImages: input.config.signatureImages },
  })
  return template
}

export async function ensureDefaultReportCardTemplate(ctx: AppContext) {
  ctx.require('exams.manage')
  return upsertDefaultReportCardTemplate(ctx.db, ctx.tenant.id)
}
