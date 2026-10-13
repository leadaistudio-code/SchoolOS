import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { PlatformContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { audit } from '@/server/audit'
import { badRequest, notFound } from '@/server/api/response'
import { randomToken } from '@/server/crypto'
import { env } from '@/lib/env'
import { storageProvider } from '@/server/providers'
import { writeActivity } from '@/server/modules/platform/growth/service'
import {
  BATCH_SIZES,
  MAX_CAMPAIGN_RECIPIENTS,
  SEND_GAP_MS,
  fillBulkTemplate,
  isEmail,
  unknownBulkPlaceholders,
  type BulkRecipient,
  type BulkVars,
} from '@/lib/bulk-mail'
import { MAIL_LAYOUTS, MAX_ATTACHMENT_TOTAL_MB, formatBytes } from '@/lib/platform-mail'
import { mailHtmlToText, renderMail, sanitizeMailBody } from './render'
import { deliverMail, describeMailError, type OutgoingMail } from './transport'
import { assertMail, newMessageId, signatureFor } from './service'

const checkbox = z.preprocess((v) => v === true || v === 'on' || v === 'true' || v === '1', z.boolean())

const recipientSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  schoolName: z.string().trim().max(200).nullable().default(null),
  contactName: z.string().trim().max(120).nullable().default(null),
  area: z.string().trim().max(120).nullable().default(null),
})

export const campaignSchema = z.object({
  name: z.string().trim().min(1, 'Name this campaign').max(120),
  mailboxId: z.string().trim().min(1, 'Choose the mailbox to send from'),
  subject: z.string().trim().min(1, 'Enter a subject').max(200),
  bodyHtml: z.string().max(200_000),
  layout: z.enum(MAIL_LAYOUTS).default('BRANDED'),
  demoButton: checkbox,
  includeSignature: checkbox,
  documentIds: z.array(z.string().trim().min(1)).max(5).default([]),
  sourceFileName: z.string().trim().max(200).nullable().default(null),
  recipients: z.array(recipientSchema).max(MAX_CAMPAIGN_RECIPIENTS, `At most ${MAX_CAMPAIGN_RECIPIENTS} schools per campaign`),
})

export type CampaignInput = z.infer<typeof campaignSchema>

function actorLabel(ctx: PlatformContext) {
  return `${ctx.user.firstName} ${ctx.user.lastName}`.trim()
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/* ------------------------------------------------------------ public links */

function baseUrl() {
  return env().APP_URL.replace(/\/$/, '')
}

export function unsubscribePageUrl(token: string) {
  return `${baseUrl()}/unsubscribe?t=${encodeURIComponent(token)}`
}

/** RFC 8058 one-click target: mail clients POST here without opening a page. */
export function oneClickUrl(token: string) {
  return `${baseUrl()}/api/v1/site/unsubscribe?t=${encodeURIComponent(token)}`
}

/* ---------------------------------------------------------------- render */

type MailboxRow = NonNullable<Awaited<ReturnType<typeof prisma.platformMailbox.findUnique>>>

type RenderableCampaign = {
  subject: string
  bodyHtml: string
  layout: string
  demoButton: boolean
  includeSignature: boolean
}

function varsFor(box: MailboxRow, r: Partial<BulkRecipient>): BulkVars {
  return {
    schoolName: r.schoolName,
    contactName: r.contactName,
    area: r.area,
    senderName: box.signatureName || box.fromName,
    senderTitle: box.signatureTitle,
  }
}

function renderFor(box: MailboxRow, c: RenderableCampaign, r: Partial<BulkRecipient>, token: string | null) {
  const vars = varsFor(box, r)
  const subject = fillBulkTemplate(c.subject, vars)
  const bodyHtml = fillBulkTemplate(c.bodyHtml, vars, escapeHtml)
  const rendered = renderMail({
    subject,
    bodyHtml,
    layout: c.layout === 'PLAIN' ? 'PLAIN' : 'BRANDED',
    signature: c.includeSignature ? signatureFor(box) : null,
    demoButton: c.demoButton,
    unsubscribeUrl: token ? unsubscribePageUrl(token) : `${baseUrl()}/unsubscribe`,
  })
  return { subject, ...rendered }
}

async function loadMailbox(ctx: PlatformContext, id: string | null) {
  const box = id ? await ctx.db.platformMailbox.findUnique({ where: { id } }) : null
  if (!box) throw badRequest('Choose a connected mailbox to send from')
  return box
}

function checkContent(input: Pick<CampaignInput, 'subject' | 'bodyHtml'>) {
  const bodyHtml = sanitizeMailBody(input.bodyHtml)
  if (!mailHtmlToText(bodyHtml)) throw badRequest('Write a message before sending')
  const unknown = unknownBulkPlaceholders(`${input.subject} ${bodyHtml}`)
  if (unknown.length) {
    throw badRequest(`These placeholders cannot be filled for every school: ${unknown.map((u) => `{{${u}}}`).join(', ')}`)
  }
  return bodyHtml
}

async function loadAttachments(ctx: PlatformContext, documentIds: string[]) {
  if (!documentIds.length) return []
  const docs = await ctx.db.platformDocument.findMany({ where: { id: { in: documentIds }, deletedAt: null } })
  if (docs.length !== new Set(documentIds).size) throw badRequest('One of the chosen documents is no longer in the library')
  const files = await Promise.all(
    docs.map(async (d) => ({ filename: d.fileName, content: await storageProvider().get(d.storageKey), contentType: d.mimeType })),
  )
  const total = files.reduce((s, f) => s + f.content.length, 0)
  if (total > MAX_ATTACHMENT_TOTAL_MB * 1024 * 1024) {
    throw badRequest(`Attachments come to ${formatBytes(total)}; keep them under ${MAX_ATTACHMENT_TOTAL_MB} MB`)
  }
  return files
}

/** What one school will receive, before anything is saved. */
export async function previewCampaign(
  ctx: PlatformContext,
  input: Omit<CampaignInput, 'name' | 'recipients' | 'sourceFileName' | 'documentIds'>,
  sample: Partial<BulkRecipient>,
) {
  assertMail(ctx)
  const box = await loadMailbox(ctx, input.mailboxId)
  const bodyHtml = sanitizeMailBody(input.bodyHtml) || '<p></p>'
  return renderFor(box, { ...input, subject: input.subject || '(no subject)', bodyHtml }, sample, null)
}

/** One personalised copy to the sender, to check it in a real inbox. */
export async function sendCampaignTest(ctx: PlatformContext, input: CampaignInput, sample: Partial<BulkRecipient>) {
  assertMail(ctx)
  const box = await loadMailbox(ctx, input.mailboxId)
  const bodyHtml = checkContent(input)
  const attachments = await loadAttachments(ctx, input.documentIds)
  const mail = renderFor(box, { ...input, bodyHtml }, sample, null)
  try {
    await deliverMail(box, {
      from: { name: box.fromName, address: box.fromEmail },
      to: box.fromEmail,
      subject: `[Test] ${mail.subject}`,
      html: mail.html,
      text: mail.text,
      attachments,
      messageId: newMessageId(box.fromEmail),
      date: new Date(),
    })
  } catch (error) {
    throw badRequest(describeMailError(error))
  }
  return { to: box.fromEmail }
}

/* ------------------------------------------------------------ recipients */

/** Flags addresses that have opted out, are already CRM schools, or were mailed before. */
export async function checkRecipients(ctx: PlatformContext, emails: string[]) {
  assertMail(ctx)
  const list = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(isEmail))).slice(0, MAX_CAMPAIGN_RECIPIENTS)
  if (!list.length) return { unsubscribed: [], crm: {}, mailedBefore: {} }
  const [unsubs, schools, contacts, previous] = await Promise.all([
    ctx.db.platformUnsubscribe.findMany({ where: { email: { in: list } }, select: { email: true } }),
    ctx.db.crmSchool.findMany({ where: { deletedAt: null, email: { in: list, mode: 'insensitive' } }, select: { id: true, name: true, email: true } }),
    ctx.db.crmContact.findMany({
      where: { deletedAt: null, email: { in: list, mode: 'insensitive' }, school: { deletedAt: null } },
      select: { email: true, school: { select: { id: true, name: true } } },
    }),
    ctx.db.platformCampaignRecipient.groupBy({
      by: ['email'],
      where: { email: { in: list }, status: 'SENT' },
      _count: { _all: true },
    }),
  ])
  const crm: Record<string, { id: string; name: string }> = {}
  for (const s of schools) if (s.email) crm[s.email.toLowerCase()] = { id: s.id, name: s.name }
  for (const c of contacts) if (c.email && !crm[c.email.toLowerCase()]) crm[c.email.toLowerCase()] = c.school
  const mailedBefore: Record<string, number> = {}
  for (const p of previous) mailedBefore[p.email] = p._count._all
  return { unsubscribed: unsubs.map((u) => u.email), crm, mailedBefore }
}

export async function createCampaign(ctx: PlatformContext, input: CampaignInput) {
  assertMail(ctx)
  const box = await loadMailbox(ctx, input.mailboxId)
  const bodyHtml = checkContent(input)
  await loadAttachments(ctx, input.documentIds)

  const seen = new Set<string>()
  const recipients = input.recipients.filter((r) => {
    if (!isEmail(r.email) || seen.has(r.email)) return false
    seen.add(r.email)
    return true
  })
  if (!recipients.length) throw badRequest('Add at least one school with a valid email address')

  const { unsubscribed, crm } = await checkRecipients(
    ctx,
    recipients.map((r) => r.email),
  )
  const optedOut = new Set(unsubscribed)

  const campaign = await ctx.db.platformCampaign.create({
    data: {
      name: input.name,
      mailboxId: box.id,
      subject: input.subject,
      bodyHtml,
      layout: input.layout,
      demoButton: input.demoButton,
      includeSignature: input.includeSignature,
      documentIds: input.documentIds,
      sourceFileName: input.sourceFileName,
      actorId: ctx.user.userId,
      actorLabel: actorLabel(ctx),
      recipients: {
        create: recipients.map((r) => ({
          email: r.email,
          schoolName: r.schoolName,
          contactName: r.contactName,
          area: r.area,
          crmSchoolId: crm[r.email]?.id ?? null,
          token: randomToken(24),
          ...(optedOut.has(r.email) ? { status: 'SKIPPED', skipReason: 'Unsubscribed earlier' } : {}),
        })),
      },
    },
  })

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'platform.campaign.create',
    module: 'platform-mail',
    entityType: 'PlatformCampaign',
    entityId: campaign.id,
    summary: `Created bulk email “${campaign.name}” for ${recipients.length} school(s)${optedOut.size ? `, ${optedOut.size} skipped as unsubscribed` : ''}`,
  })
  return campaign
}

/* ------------------------------------------------------------------ send */

export type BatchResult = {
  sent: number
  failed: number
  skipped: number
  remaining: number
  status: string
  error: string | null
}

async function remainingCount(ctx: PlatformContext, campaignId: string) {
  return ctx.db.platformCampaignRecipient.count({ where: { campaignId, status: 'PENDING' } })
}

/**
 * Sends the next few pending recipients, one message each, with a pause
 * between them. Each row is claimed before sending, so two open tabs can never
 * mail the same school twice. Three failures in a row stop the batch: that is
 * a mailbox problem, not a bad address, and retrying would only burn the list.
 */
export async function sendCampaignBatch(ctx: PlatformContext, id: string, size: number): Promise<BatchResult> {
  assertMail(ctx)
  const batchSize = (BATCH_SIZES as readonly number[]).includes(size) ? size : BATCH_SIZES[0]
  const campaign = await ctx.db.platformCampaign.findUnique({ where: { id } })
  if (!campaign) throw notFound('Campaign')
  if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') {
    throw badRequest(`This campaign is ${campaign.status.toLowerCase()}`)
  }
  const box = await loadMailbox(ctx, campaign.mailboxId)
  const attachments = await loadAttachments(ctx, campaign.documentIds)

  await ctx.db.platformCampaign.update({
    where: { id },
    data: { status: 'SENDING', lastError: null, startedAt: campaign.startedAt ?? new Date() },
  })

  const batch = await ctx.db.platformCampaignRecipient.findMany({
    where: { campaignId: id, status: 'PENDING' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: batchSize,
  })

  let sent = 0
  let failed = 0
  let skipped = 0
  let streak = 0
  let stopError: string | null = null

  for (const [index, r] of batch.entries()) {
    const claim = await ctx.db.platformCampaignRecipient.updateMany({
      where: { id: r.id, status: 'PENDING' },
      data: { status: 'SENDING' },
    })
    if (claim.count === 0) continue

    // Someone may have unsubscribed since the list was imported.
    const optedOut = await ctx.db.platformUnsubscribe.findUnique({ where: { email: r.email }, select: { id: true } })
    if (optedOut) {
      await ctx.db.platformCampaignRecipient.update({
        where: { id: r.id },
        data: { status: 'SKIPPED', skipReason: 'Unsubscribed' },
      })
      skipped++
      continue
    }

    if (index > 0 && sent + failed > 0) await wait(SEND_GAP_MS)

    const mail = renderFor(box, campaign, r, r.token)
    const outgoing: OutgoingMail = {
      from: { name: box.fromName, address: box.fromEmail },
      to: r.email,
      replyTo: box.replyTo ?? undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments,
      // The one-click header is what tells Gmail a message is bulk mail, which
      // files it under Promotions. Personal (plain) mail relies on the opt-out
      // link in its postscript instead; Gmail only demands the header from
      // senders of 5,000+ messages a day.
      headers:
        campaign.layout === 'PLAIN'
          ? undefined
          : {
              'List-Unsubscribe': `<${oneClickUrl(r.token)}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
      messageId: newMessageId(box.fromEmail),
      date: new Date(),
    }

    try {
      const result = await deliverMail(box, outgoing)
      await ctx.db.platformCampaignRecipient.update({
        where: { id: r.id },
        data: { status: 'SENT', sentAt: new Date(), messageId: result.messageId, error: null },
      })
      sent++
      streak = 0
      if (r.crmSchoolId) {
        await writeActivity(ctx, {
          schoolId: r.crmSchoolId,
          type: 'EMAIL',
          summary: `Bulk email “${mail.subject}” to ${r.email}`,
          body: mail.text,
          meta: { campaignId: id, recipientId: r.id },
        }).catch(() => undefined)
      }
    } catch (error) {
      const message = describeMailError(error)
      await ctx.db.platformCampaignRecipient.update({
        where: { id: r.id },
        data: { status: 'FAILED', error: message },
      })
      failed++
      streak++
      if (streak >= 3) {
        stopError = `Stopped after three failures in a row: ${message}`
        break
      }
    }
  }

  const remaining = await remainingCount(ctx, id)
  const status = stopError ? 'PAUSED' : remaining === 0 ? 'COMPLETED' : 'PAUSED'
  await ctx.db.platformCampaign.update({
    where: { id },
    data: { status, lastError: stopError, ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}) },
  })
  if (sent || failed) {
    await ctx.db.platformMailbox.update({
      where: { id: box.id },
      data: failed && !sent ? { lastError: stopError ?? 'Bulk email could not be delivered' } : { lastError: null },
    })
  }

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'platform.campaign.batch',
    module: 'platform-mail',
    entityType: 'PlatformCampaign',
    entityId: id,
    summary: `Bulk email “${campaign.name}”: ${sent} sent, ${failed} failed, ${skipped} skipped from ${box.fromEmail}; ${remaining} left`,
  })

  return { sent, failed, skipped, remaining, status, error: stopError }
}

export async function retryFailed(ctx: PlatformContext, id: string) {
  assertMail(ctx)
  const campaign = await ctx.db.platformCampaign.findUnique({ where: { id }, select: { status: true, updatedAt: true } })
  if (!campaign) throw notFound('Campaign')
  if (campaign.status === 'CANCELLED') throw badRequest('This campaign was cancelled')
  // A batch that died mid-way leaves rows in SENDING; once no batch has touched
  // the campaign for ten minutes they are treated as not sent.
  const interrupted = campaign.status !== 'SENDING' || campaign.updatedAt < new Date(Date.now() - 10 * 60 * 1000)
  const { count } = await ctx.db.platformCampaignRecipient.updateMany({
    where: { campaignId: id, status: { in: interrupted ? ['FAILED', 'SENDING'] : ['FAILED'] } },
    data: { status: 'PENDING', error: null },
  })
  if (count) await ctx.db.platformCampaign.update({ where: { id }, data: { status: 'PAUSED', completedAt: null } })
  return count
}

export async function cancelCampaign(ctx: PlatformContext, id: string) {
  assertMail(ctx)
  const campaign = await ctx.db.platformCampaign.findUnique({ where: { id }, select: { name: true, status: true } })
  if (!campaign) throw notFound('Campaign')
  if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') return
  const { count } = await ctx.db.platformCampaignRecipient.updateMany({
    where: { campaignId: id, status: 'PENDING' },
    data: { status: 'SKIPPED', skipReason: 'Campaign cancelled' },
  })
  await ctx.db.platformCampaign.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() } })
  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'platform.campaign.cancel',
    module: 'platform-mail',
    entityType: 'PlatformCampaign',
    entityId: id,
    summary: `Cancelled bulk email “${campaign.name}”; ${count} school(s) not emailed`,
  })
}

/* ------------------------------------------------------------------ read */

export async function listCampaigns(ctx: PlatformContext) {
  assertMail(ctx)
  const campaigns = await ctx.db.platformCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      name: true,
      subject: true,
      status: true,
      sourceFileName: true,
      actorLabel: true,
      createdAt: true,
      mailbox: { select: { fromEmail: true } },
    },
  })
  const counts = await ctx.db.platformCampaignRecipient.groupBy({
    by: ['campaignId', 'status'],
    where: { campaignId: { in: campaigns.map((c) => c.id) } },
    _count: { _all: true },
  })
  const unsubscribed = await ctx.db.platformCampaignRecipient.groupBy({
    by: ['campaignId'],
    where: { campaignId: { in: campaigns.map((c) => c.id) }, unsubscribedAt: { not: null } },
    _count: { _all: true },
  })
  return campaigns.map((c) => {
    const tally: Record<string, number> = {}
    for (const row of counts) if (row.campaignId === c.id) tally[row.status] = row._count._all
    return {
      ...c,
      total: Object.values(tally).reduce((s, n) => s + n, 0),
      sent: tally.SENT ?? 0,
      failed: tally.FAILED ?? 0,
      pending: (tally.PENDING ?? 0) + (tally.SENDING ?? 0),
      skipped: tally.SKIPPED ?? 0,
      unsubscribed: unsubscribed.find((u) => u.campaignId === c.id)?._count._all ?? 0,
    }
  })
}

export type RecipientFilter = 'all' | 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'UNSUBSCRIBED'

export async function getCampaign(ctx: PlatformContext, id: string, filter: RecipientFilter = 'all') {
  assertMail(ctx)
  const campaign = await ctx.db.platformCampaign.findUnique({
    where: { id },
    include: { mailbox: { select: { id: true, fromName: true, fromEmail: true, verifiedAt: true } } },
  })
  if (!campaign) throw notFound('Campaign')
  const where: Prisma.PlatformCampaignRecipientWhereInput = {
    campaignId: id,
    ...(filter === 'UNSUBSCRIBED'
      ? { unsubscribedAt: { not: null } }
      : filter === 'PENDING'
        ? { status: { in: ['PENDING', 'SENDING'] } }
        : filter !== 'all'
          ? { status: filter }
          : {}),
  }
  const [recipients, grouped, unsubscribed, documents] = await Promise.all([
    ctx.db.platformCampaignRecipient.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        email: true,
        schoolName: true,
        contactName: true,
        area: true,
        crmSchoolId: true,
        status: true,
        skipReason: true,
        error: true,
        sentAt: true,
        unsubscribedAt: true,
      },
    }),
    ctx.db.platformCampaignRecipient.groupBy({ by: ['status'], where: { campaignId: id }, _count: { _all: true } }),
    ctx.db.platformCampaignRecipient.count({ where: { campaignId: id, unsubscribedAt: { not: null } } }),
    campaign.documentIds.length
      ? ctx.db.platformDocument.findMany({ where: { id: { in: campaign.documentIds } }, select: { id: true, title: true, sizeBytes: true } })
      : Promise.resolve([]),
  ])
  const tally: Record<string, number> = {}
  for (const g of grouped) tally[g.status] = g._count._all
  const counts = {
    total: Object.values(tally).reduce((s, n) => s + n, 0),
    sent: tally.SENT ?? 0,
    failed: tally.FAILED ?? 0,
    pending: (tally.PENDING ?? 0) + (tally.SENDING ?? 0),
    skipped: tally.SKIPPED ?? 0,
    unsubscribed,
  }
  return { campaign, recipients, counts, documents }
}

/** The email exactly as the first school on the list will receive it. */
export async function campaignPreviewHtml(ctx: PlatformContext, id: string) {
  assertMail(ctx)
  const campaign = await ctx.db.platformCampaign.findUnique({ where: { id } })
  if (!campaign) throw notFound('Campaign')
  const box = await loadMailbox(ctx, campaign.mailboxId).catch(() => null)
  if (!box) return null
  const first = await ctx.db.platformCampaignRecipient.findFirst({ where: { campaignId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  return renderFor(box, campaign, first ?? {}, first?.token ?? null)
}

/* ------------------------------------------------------------ unsubscribe */

export async function listUnsubscribes(ctx: PlatformContext) {
  assertMail(ctx)
  return ctx.db.platformUnsubscribe.findMany({ orderBy: { createdAt: 'desc' }, take: 500 })
}

export async function addUnsubscribe(ctx: PlatformContext, rawEmail: string, reason: string | null) {
  assertMail(ctx)
  const email = rawEmail.trim().toLowerCase()
  if (!isEmail(email)) throw badRequest('Enter a valid email address')
  await prisma.platformUnsubscribe.upsert({
    where: { email },
    update: {},
    create: { email, source: 'MANUAL', reason: reason?.trim().slice(0, 300) || null },
  })
  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'platform.unsubscribe.add',
    module: 'platform-mail',
    entityType: 'PlatformUnsubscribe',
    entityId: email,
    summary: `Added ${email} to the do-not-email list`,
  })
}

/** Public: who the unsubscribe page is about, without exposing anything else. */
export async function lookupUnsubscribe(token: string) {
  if (!token || token.length > 100) return null
  const r = await prisma.platformCampaignRecipient.findUnique({
    where: { token },
    select: { email: true, schoolName: true },
  })
  if (!r) return null
  const done = await prisma.platformUnsubscribe.findUnique({ where: { email: r.email }, select: { createdAt: true } })
  return { email: r.email, schoolName: r.schoolName, unsubscribedAt: done?.createdAt ?? null }
}

/** Public: records the opt-out. Idempotent, so a repeated click is harmless. */
export async function unsubscribeByToken(token: string, source: 'LINK' | 'ONE_CLICK', reason?: string | null) {
  if (!token || token.length > 100) return null
  const r = await prisma.platformCampaignRecipient.findUnique({
    where: { token },
    select: { id: true, email: true, campaignId: true, unsubscribedAt: true },
  })
  if (!r) return null
  await prisma.platformUnsubscribe.upsert({
    where: { email: r.email },
    update: reason ? { reason: reason.slice(0, 300) } : {},
    create: { email: r.email, source, campaignId: r.campaignId, reason: reason?.slice(0, 300) || null },
  })
  if (!r.unsubscribedAt) {
    await prisma.platformCampaignRecipient.update({ where: { id: r.id }, data: { unsubscribedAt: new Date() } })
    // Anything still queued for this address in any campaign is dropped.
    await prisma.platformCampaignRecipient.updateMany({
      where: { email: r.email, status: 'PENDING' },
      data: { status: 'SKIPPED', skipReason: 'Unsubscribed' },
    })
    await audit({
      tenantId: null,
      action: 'platform.unsubscribe',
      module: 'platform-mail',
      entityType: 'PlatformCampaign',
      entityId: r.campaignId,
      summary: `${r.email} unsubscribed (${source === 'ONE_CLICK' ? 'mail client button' : 'unsubscribe page'})`,
    })
  }
  return { email: r.email }
}
