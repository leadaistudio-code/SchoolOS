import type { Prisma } from '@prisma/client'
import { ForbiddenError, type PlatformContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, notFound } from '@/server/api/response'
import { encryptSecret, randomToken } from '@/server/crypto'
import { env } from '@/lib/env'
import { validateUpload } from '@/server/files'
import { storageProvider } from '@/server/providers'
import { writeActivity } from '@/server/modules/platform/growth/service'
import {
  MAX_ATTACHMENT_TOTAL_MB,
  MAX_RECIPIENTS,
  formatBytes,
  parseAddressList,
  unresolvedPlaceholders,
} from '@/lib/platform-mail'
import type { ComposeInput, MailboxInput } from './schema'
import { mailHtmlToText, renderMail, sanitizeMailBody, type MailSignature } from './render'
import {
  describeMailError,
  saveToSentFolder,
  deliverMail,
  verifyMailbox,
  type OutgoingMail,
} from './transport'

/* ------------------------------------------------------------------ access */

/** Sending uses the existing Growth CRM comms right; the Super Admin always may. */
export function canUseMail(ctx: PlatformContext): boolean {
  return ctx.user.isSuperAdmin || ctx.user.permissions.has('platform.crm_comms')
}

/** Mailbox credentials are owner-level: only the Super Admin may add or change them. */
export function canManageMailboxes(ctx: PlatformContext): boolean {
  return ctx.user.isSuperAdmin
}

export function assertMail(ctx: PlatformContext) {
  if (!canUseMail(ctx)) throw new ForbiddenError('You cannot send email from the platform')
}

function assertManage(ctx: PlatformContext) {
  if (!canManageMailboxes(ctx)) throw new ForbiddenError('Only the Super Admin can change mailboxes')
}

function actorLabel(ctx: PlatformContext) {
  return `${ctx.user.firstName} ${ctx.user.lastName}`.trim()
}

/* --------------------------------------------------------------- mailboxes */

const SAFE_MAILBOX = {
  id: true,
  fromName: true,
  fromEmail: true,
  replyTo: true,
  username: true,
  smtpHost: true,
  smtpPort: true,
  smtpSecure: true,
  sendVia: true,
  imapEnabled: true,
  imapHost: true,
  imapPort: true,
  sentFolder: true,
  signatureName: true,
  signatureTitle: true,
  signaturePhone: true,
  signatureWebsite: true,
  isDefault: true,
  verifiedAt: true,
  lastError: true,
  updatedAt: true,
} satisfies Prisma.PlatformMailboxSelect

type MailboxRow = Prisma.PlatformMailboxGetPayload<{ select: typeof SAFE_MAILBOX }>
export type SafeMailbox = MailboxRow & { hasResendKey: boolean }

export async function listMailboxes(ctx: PlatformContext): Promise<SafeMailbox[]> {
  assertMail(ctx)
  const rows = await ctx.db.platformMailbox.findMany({
    select: { ...SAFE_MAILBOX, resendKeyEncrypted: true },
    orderBy: [{ isDefault: 'desc' }, { fromEmail: 'asc' }],
  })
  return rows.map(({ resendKeyEncrypted, ...row }) => ({ ...row, hasResendKey: !!resendKeyEncrypted }))
}

export async function saveMailbox(ctx: PlatformContext, input: MailboxInput): Promise<MailboxRow> {
  assertManage(ctx)
  const existing = input.id
    ? await ctx.db.platformMailbox.findUnique({ where: { id: input.id }, select: { id: true, resendKeyEncrypted: true } })
    : null
  if (input.id && !existing) throw notFound('Mailbox')
  if (!existing && !input.password) throw badRequest('Enter the mailbox password')
  if (input.sendVia === 'RESEND' && !input.resendKey && !existing?.resendKeyEncrypted && !env().RESEND_API_KEY) {
    throw badRequest('Enter the Resend API key to send through Resend')
  }

  const clash = await ctx.db.platformMailbox.findFirst({
    where: { fromEmail: input.fromEmail, ...(existing ? { id: { not: existing.id } } : {}) },
    select: { id: true },
  })
  if (clash) throw badRequest('That email address is already connected')

  const count = await ctx.db.platformMailbox.count()
  const makeDefault = input.isDefault || count === 0 || (count === 1 && !!existing)

  const data = {
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    replyTo: input.replyTo,
    username: input.username ?? input.fromEmail,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpSecure: input.smtpSecure,
    sendVia: input.sendVia,
    ...(input.resendKey ? { resendKeyEncrypted: encryptSecret(input.resendKey) } : {}),
    imapEnabled: input.imapEnabled,
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    signatureName: input.signatureName,
    signatureTitle: input.signatureTitle,
    signaturePhone: input.signaturePhone,
    signatureWebsite: input.signatureWebsite,
    isDefault: makeDefault,
    // Any change invalidates the previous proof that it works.
    verifiedAt: null,
    lastError: null,
    sentFolder: null,
    ...(input.password ? { passwordEncrypted: encryptSecret(input.password) } : {}),
  }

  const saved = await ctx.db.$transaction(async (tx) => {
    if (makeDefault) await tx.platformMailbox.updateMany({ data: { isDefault: false } })
    return existing
      ? tx.platformMailbox.update({ where: { id: existing.id }, data, select: SAFE_MAILBOX })
      : tx.platformMailbox.create({
          data: { ...data, passwordEncrypted: encryptSecret(input.password!) },
          select: SAFE_MAILBOX,
        })
  })

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: existing ? 'platform.mailbox.update' : 'platform.mailbox.create',
    module: 'platform-mail',
    entityType: 'PlatformMailbox',
    entityId: saved.id,
    summary: `${existing ? 'Updated' : 'Connected'} mailbox ${saved.fromEmail} · sends via ${saved.sendVia === 'RESEND' ? 'Resend' : 'SMTP'}${input.password ? ' (password changed)' : ''}${input.resendKey ? ' (Resend key changed)' : ''}`,
  })
  return saved
}

export async function deleteMailbox(ctx: PlatformContext, id: string) {
  assertManage(ctx)
  const box = await ctx.db.platformMailbox.findUnique({ where: { id }, select: { id: true, fromEmail: true, isDefault: true } })
  if (!box) throw notFound('Mailbox')
  await ctx.db.platformMailbox.delete({ where: { id } })
  if (box.isDefault) {
    const next = await ctx.db.platformMailbox.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
    if (next) await ctx.db.platformMailbox.update({ where: { id: next.id }, data: { isDefault: true } })
  }
  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'platform.mailbox.delete',
    module: 'platform-mail',
    entityType: 'PlatformMailbox',
    entityId: id,
    summary: `Disconnected mailbox ${box.fromEmail}`,
  })
}

/** Signs in over SMTP (and IMAP), then optionally sends a real test message. */
export async function testMailbox(
  ctx: PlatformContext,
  id: string,
  sendTo: string | null,
): Promise<{ ok: boolean; message: string }> {
  assertManage(ctx)
  const box = await ctx.db.platformMailbox.findUnique({ where: { id } })
  if (!box) throw notFound('Mailbox')

  const verified = await verifyMailbox(box)
  if (!verified.ok) {
    await ctx.db.platformMailbox.update({ where: { id }, data: { verifiedAt: null, lastError: verified.error } })
    return { ok: false, message: verified.error }
  }

  if (sendTo) {
    const { valid } = parseAddressList(sendTo)
    if (valid.length !== 1) return { ok: false, message: 'Enter one valid address for the test message.' }
    const signature = signatureFor(box)
    const bodyHtml =
      '<p>Your mailbox is connected to the MyCampusView platform console.</p><p>Proposals and emails sent from the console will go out from this address and appear in its Sent folder.</p>'
    const rendered = renderMail({ subject: 'MyCampusView mailbox test', bodyHtml, layout: 'BRANDED', signature, demoButton: false })
    try {
      await deliverMail(box, {
        from: { name: box.fromName, address: box.fromEmail },
        to: valid[0],
        replyTo: box.replyTo ?? undefined,
        subject: 'MyCampusView mailbox test',
        html: rendered.html,
        text: rendered.text,
        messageId: newMessageId(box.fromEmail),
        date: new Date(),
      })
    } catch (error) {
      const message = describeMailError(error)
      await ctx.db.platformMailbox.update({ where: { id }, data: { verifiedAt: null, lastError: message } })
      return { ok: false, message }
    }
  }

  await ctx.db.platformMailbox.update({
    where: { id },
    data: { verifiedAt: new Date(), lastError: null, sentFolder: verified.sentFolder },
  })
  const parts = ['Signed in successfully.']
  if (verified.sentFolder) parts.push(`Copies will be saved to “${verified.sentFolder}”.`)
  if (sendTo) parts.push(`A test message was sent to ${sendTo.trim()}.`)
  return { ok: true, message: parts.join(' ') }
}

export function signatureFor(box: {
  fromEmail: string
  signatureName: string | null
  signatureTitle: string | null
  signaturePhone: string | null
  signatureWebsite: string | null
}): MailSignature {
  return {
    name: box.signatureName,
    title: box.signatureTitle,
    phone: box.signaturePhone,
    email: box.fromEmail,
    website: box.signatureWebsite,
  }
}

export function newMessageId(fromEmail: string): string {
  const domain = fromEmail.split('@')[1] || 'mycampusview.com'
  return `<${Date.now().toString(36)}.${randomToken(12)}@${domain}>`
}

/* --------------------------------------------------------------- documents */

export async function listDocuments(ctx: PlatformContext) {
  assertMail(ctx)
  return ctx.db.platformDocument.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, fileName: true, mimeType: true, sizeBytes: true, uploadedByLabel: true, createdAt: true },
  })
}

export async function uploadDocument(ctx: PlatformContext, title: string, file: File) {
  assertMail(ctx)
  const upload = await validateUpload(file)
  const storageKey = `platform/library/${randomToken(12)}.${upload.extension}`
  await storageProvider().put(storageKey, upload.buffer, upload.mimeType)
  const doc = await ctx.db.platformDocument.create({
    data: {
      title: title.trim() || upload.safeName.replace(/\.[^.]+$/, ''),
      fileName: upload.safeName,
      mimeType: upload.mimeType,
      sizeBytes: upload.buffer.length,
      storageKey,
      uploadedById: ctx.user.userId,
      uploadedByLabel: actorLabel(ctx),
    },
  })
  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'platform.document.upload',
    module: 'platform-mail',
    entityType: 'PlatformDocument',
    entityId: doc.id,
    summary: `Added ${doc.fileName} to the document library`,
  })
  return doc
}

/** Soft delete: emails that already carried the file keep a downloadable record. */
export async function deleteDocument(ctx: PlatformContext, id: string) {
  assertMail(ctx)
  const doc = await ctx.db.platformDocument.findFirst({ where: { id, deletedAt: null } })
  if (!doc) throw notFound('Document')
  await ctx.db.platformDocument.update({ where: { id }, data: { deletedAt: new Date() } })
  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'platform.document.delete',
    module: 'platform-mail',
    entityType: 'PlatformDocument',
    entityId: id,
    summary: `Removed ${doc.fileName} from the document library`,
  })
}

export async function readDocument(ctx: PlatformContext, id: string) {
  assertMail(ctx)
  const doc = await ctx.db.platformDocument.findUnique({ where: { id } })
  if (!doc) throw notFound('Document')
  return { body: await storageProvider().get(doc.storageKey), mimeType: doc.mimeType, fileName: doc.fileName }
}

export async function readAttachment(ctx: PlatformContext, id: string) {
  assertMail(ctx)
  const att = await ctx.db.platformEmailAttachment.findUnique({ where: { id } })
  if (!att) throw notFound('Attachment')
  return { body: await storageProvider().get(att.storageKey), mimeType: att.mimeType, fileName: att.fileName }
}

/* ----------------------------------------------------------------- compose */

export async function composeOptions(ctx: PlatformContext) {
  assertMail(ctx)
  const [mailboxes, documents, schools] = await Promise.all([
    listMailboxes(ctx),
    listDocuments(ctx),
    ctx.db.crmSchool.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      take: 500,
      select: {
        id: true,
        name: true,
        email: true,
        contacts: {
          where: { deletedAt: null },
          orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }],
          select: { id: true, fullName: true, designation: true, email: true },
        },
      },
    }),
  ])
  return { mailboxes, documents, schools }
}

type PreparedMail = {
  box: NonNullable<Awaited<ReturnType<PlatformContext['db']['platformMailbox']['findUnique']>>>
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  bodyHtml: string
  html: string
  text: string
}

async function prepare(ctx: PlatformContext, input: ComposeInput, test: boolean): Promise<PreparedMail> {
  const box = await ctx.db.platformMailbox.findUnique({ where: { id: input.mailboxId } })
  if (!box) throw badRequest('Choose a connected mailbox to send from')

  const lists = test
    ? { to: [box.fromEmail], cc: [], bcc: [] }
    : (() => {
        const to = parseAddressList(input.to)
        const cc = parseAddressList(input.cc)
        const bcc = parseAddressList(input.bcc)
        const invalid = [...to.invalid, ...cc.invalid, ...bcc.invalid]
        if (invalid.length) throw badRequest(`Check these addresses: ${invalid.slice(0, 5).join(', ')}`)
        if (to.valid.length === 0) throw badRequest('Add at least one recipient in To')
        return { to: to.valid, cc: cc.valid, bcc: bcc.valid }
      })()
  if (lists.to.length + lists.cc.length + lists.bcc.length > MAX_RECIPIENTS) {
    throw badRequest(`Send to at most ${MAX_RECIPIENTS} people at once`)
  }

  const bodyHtml = sanitizeMailBody(input.bodyHtml)
  if (!mailHtmlToText(bodyHtml)) throw badRequest('Write a message before sending')

  const missing = unresolvedPlaceholders(`${input.subject} ${bodyHtml}`)
  if (missing.length) {
    throw badRequest(`Replace the placeholders before sending: ${missing.map((m) => `{{${m}}}`).join(', ')}`)
  }

  const subject = test ? `[Test] ${input.subject}` : input.subject
  const { html, text } = renderMail({
    subject,
    bodyHtml,
    layout: input.layout,
    signature: input.includeSignature ? signatureFor(box) : null,
    demoButton: input.demoButton,
  })
  return { box, ...lists, subject, bodyHtml, html, text }
}

/** Server-rendered preview, byte-for-byte what will be sent. */
export async function previewMail(ctx: PlatformContext, input: ComposeInput): Promise<string> {
  assertMail(ctx)
  const box = await ctx.db.platformMailbox.findUnique({ where: { id: input.mailboxId } })
  if (!box) throw badRequest('Choose a connected mailbox to preview with')
  const { html } = renderMail({
    subject: input.subject || '(no subject)',
    bodyHtml: sanitizeMailBody(input.bodyHtml) || '<p></p>',
    layout: input.layout,
    signature: input.includeSignature ? signatureFor(box) : null,
    demoButton: input.demoButton,
  })
  return html
}

type Attachable = { fileName: string; mimeType: string; buffer: Buffer; documentId: string | null; storageKey: string | null }

async function gatherAttachments(ctx: PlatformContext, input: ComposeInput, files: File[]): Promise<Attachable[]> {
  const out: Attachable[] = []
  for (const file of files) {
    const upload = await validateUpload(file)
    out.push({ fileName: upload.safeName, mimeType: upload.mimeType, buffer: upload.buffer, documentId: null, storageKey: null })
  }
  if (input.origin && input.forwardParts.length) {
    const { messageAttachments } = await import('./inbox')
    const forwarded = await messageAttachments(ctx, input.origin.mailboxId, input.origin.folder, input.origin.uid, input.forwardParts)
    for (const f of forwarded) {
      out.push({ fileName: f.fileName, mimeType: f.mimeType, buffer: f.body, documentId: null, storageKey: null })
    }
  }
  if (input.documentIds.length) {
    const docs = await ctx.db.platformDocument.findMany({ where: { id: { in: input.documentIds }, deletedAt: null } })
    if (docs.length !== new Set(input.documentIds).size) throw badRequest('One of the chosen documents is no longer in the library')
    for (const doc of docs) {
      out.push({
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        buffer: await storageProvider().get(doc.storageKey),
        documentId: doc.id,
        storageKey: doc.storageKey,
      })
    }
  }
  const total = out.reduce((sum, a) => sum + a.buffer.length, 0)
  if (total > MAX_ATTACHMENT_TOTAL_MB * 1024 * 1024) {
    throw badRequest(`Attachments come to ${formatBytes(total)}; keep them under ${MAX_ATTACHMENT_TOTAL_MB} MB in total`)
  }
  return out
}

/** Sends one copy to the sender's own address, unlogged, to check how it looks in a real inbox. */
export async function sendTestMail(ctx: PlatformContext, input: ComposeInput, files: File[]) {
  assertMail(ctx)
  const mail = await prepare(ctx, input, true)
  const attachments = await gatherAttachments(ctx, input, files)
  try {
    await deliverMail(mail.box, {
      from: { name: mail.box.fromName, address: mail.box.fromEmail },
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: attachments.map((a) => ({ filename: a.fileName, content: a.buffer, contentType: a.mimeType })),
      messageId: newMessageId(mail.box.fromEmail),
      date: new Date(),
    })
  } catch (error) {
    throw badRequest(describeMailError(error))
  }
  return { to: mail.box.fromEmail }
}

export async function sendMail(ctx: PlatformContext, input: ComposeInput, files: File[]) {
  assertMail(ctx)
  const mail = await prepare(ctx, input, false)

  const school = input.crmSchoolId
    ? await ctx.db.crmSchool.findFirst({ where: { id: input.crmSchoolId, deletedAt: null }, select: { id: true, name: true } })
    : null
  if (input.crmSchoolId && !school) throw notFound('CRM school')

  const attachments = await gatherAttachments(ctx, input, files)
  // New uploads are kept so the sent log can show exactly what went out.
  for (const a of attachments) {
    if (a.storageKey) continue
    const ext = a.fileName.split('.').pop() || 'bin'
    a.storageKey = `platform/mail/${randomToken(12)}.${ext}`
    await storageProvider().put(a.storageKey, a.buffer, a.mimeType)
  }

  const outgoing: OutgoingMail = {
    from: { name: mail.box.fromName, address: mail.box.fromEmail },
    to: mail.to,
    cc: mail.cc.length ? mail.cc : undefined,
    bcc: mail.bcc.length ? mail.bcc : undefined,
    replyTo: mail.box.replyTo ?? undefined,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: attachments.map((a) => ({ filename: a.fileName, content: a.buffer, contentType: a.mimeType })),
    inReplyTo: input.inReplyTo ?? undefined,
    references: input.references ?? undefined,
    messageId: newMessageId(mail.box.fromEmail),
    date: new Date(),
  }

  let status: 'SENT' | 'FAILED' = 'SENT'
  let error: string | null = null
  let messageId: string | null = null
  try {
    messageId = (await deliverMail(mail.box, outgoing)).messageId
  } catch (err) {
    status = 'FAILED'
    error = describeMailError(err)
  }

  let savedToSent = false
  let sentCopyError: string | null = null
  if (status === 'SENT' && mail.box.imapEnabled) {
    const copy = await saveToSentFolder(mail.box, outgoing)
    if (copy.ok) {
      savedToSent = true
      if (copy.folder !== mail.box.sentFolder) {
        await ctx.db.platformMailbox.update({ where: { id: mail.box.id }, data: { sentFolder: copy.folder } })
      }
    } else {
      sentCopyError = copy.error
    }
  }
  await ctx.db.platformMailbox.update({
    where: { id: mail.box.id },
    data: status === 'SENT' ? { lastError: null } : { lastError: error },
  })
  if (status === 'SENT' && input.inReplyTo && input.origin) {
    const { markAnswered } = await import('./inbox')
    await markAnswered(ctx, input.origin.mailboxId, input.origin.folder, input.origin.uid).catch(() => undefined)
  }

  const email = await ctx.db.platformEmail.create({
    data: {
      mailboxId: mail.box.id,
      fromName: mail.box.fromName,
      fromEmail: mail.box.fromEmail,
      to: mail.to,
      cc: mail.cc,
      bcc: mail.bcc,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      bodyHtml: mail.bodyHtml,
      layout: input.layout,
      status,
      messageId,
      error,
      savedToSent,
      sentCopyError,
      crmSchoolId: school?.id ?? null,
      actorId: ctx.user.userId,
      actorLabel: actorLabel(ctx),
      attachments: {
        create: attachments.map((a) => ({
          documentId: a.documentId,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.buffer.length,
          storageKey: a.storageKey!,
        })),
      },
    },
  })

  if (school) {
    const recipients = [...mail.to, ...mail.cc].join(', ')
    const communication = await ctx.db.crmCommunication.create({
      data: {
        schoolId: school.id,
        channel: 'EMAIL',
        to: recipients,
        subject: mail.subject,
        body: mail.text,
        status,
        provider: `mailbox:${mail.box.fromEmail}`,
        providerMessageId: messageId,
        error,
        actorId: ctx.user.userId,
        actorLabel: actorLabel(ctx),
      },
    })
    await writeActivity(ctx, {
      schoolId: school.id,
      type: 'EMAIL',
      summary:
        status === 'SENT'
          ? `Email “${mail.subject}” to ${recipients}${attachments.length ? ` with ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}` : ''}`
          : `Email failed to ${recipients}`,
      body: mail.text,
      meta: { communicationId: communication.id, platformEmailId: email.id, status },
    })
  }

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: status === 'SENT' ? 'platform.mail.send' : 'platform.mail.fail',
    module: 'platform-mail',
    entityType: 'PlatformEmail',
    entityId: email.id,
    summary: `Email “${mail.subject}” ${status === 'SENT' ? 'sent' : 'failed'} from ${mail.box.fromEmail} to ${mail.to.length + mail.cc.length + mail.bcc.length} recipient(s)`,
  })

  return { email, error, savedToSent, sentCopyError }
}

/**
 * Lets the Growth CRM's quick-send use the connected mailbox instead of the
 * system mailer. Returns null when no mailbox is connected.
 */
export async function sendViaDefaultMailbox(
  ctx: PlatformContext,
  message: { to: string; subject: string; text: string; bodyHtml: string },
): Promise<{ ok: boolean; provider: string; providerMessageId?: string; error?: string } | null> {
  const box = await ctx.db.platformMailbox.findFirst({ where: { isDefault: true } })
  if (!box) return null
  const bodyHtml = sanitizeMailBody(message.bodyHtml)
  const { html, text } = renderMail({
    subject: message.subject,
    bodyHtml,
    layout: 'BRANDED',
    signature: signatureFor(box),
    demoButton: false,
  })
  const outgoing: OutgoingMail = {
    from: { name: box.fromName, address: box.fromEmail },
    to: message.to,
    replyTo: box.replyTo ?? undefined,
    subject: message.subject,
    html,
    text,
    messageId: newMessageId(box.fromEmail),
    date: new Date(),
  }
  const provider = `mailbox:${box.fromEmail}`
  try {
    const sent = await deliverMail(box, outgoing)
    if (box.imapEnabled) await saveToSentFolder(box, outgoing)
    return { ok: true, provider, providerMessageId: sent.messageId }
  } catch (error) {
    return { ok: false, provider, error: describeMailError(error) }
  }
}

/* ---------------------------------------------------------------- sent log */

export type EmailListFilter = { q?: string; status?: string; page?: number }

export async function listEmails(ctx: PlatformContext, filter: EmailListFilter) {
  assertMail(ctx)
  const pageSize = 25
  const page = Math.max(1, filter.page ?? 1)
  const q = filter.q?.trim()
  const where: Prisma.PlatformEmailWhereInput = {
    ...(filter.status === 'SENT' || filter.status === 'FAILED' ? { status: filter.status } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: 'insensitive' } },
            { to: { has: q.toLowerCase() } },
            { cc: { has: q.toLowerCase() } },
            { crmSchool: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
  const [rows, total, sent, failed] = await Promise.all([
    ctx.db.platformEmail.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fromEmail: true,
        to: true,
        cc: true,
        subject: true,
        status: true,
        savedToSent: true,
        actorLabel: true,
        createdAt: true,
        crmSchool: { select: { id: true, name: true } },
        _count: { select: { attachments: true } },
      },
    }),
    ctx.db.platformEmail.count({ where }),
    ctx.db.platformEmail.count({ where: { status: 'SENT' } }),
    ctx.db.platformEmail.count({ where: { status: 'FAILED' } }),
  ])
  return { rows, total, page, pageSize, counts: { sent, failed } }
}

export async function getEmail(ctx: PlatformContext, id: string) {
  assertMail(ctx)
  const email = await ctx.db.platformEmail.findUnique({
    where: { id },
    include: {
      attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
      crmSchool: { select: { id: true, name: true } },
    },
  })
  if (!email) throw notFound('Email')
  return email
}
