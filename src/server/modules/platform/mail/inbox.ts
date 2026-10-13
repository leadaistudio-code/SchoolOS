import type { FetchMessageObject, ImapFlow, ListResponse, MessageAddressObject, MessageStructureObject } from 'imapflow'
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser'
import { badRequest, notFound } from '@/server/api/response'
import { audit } from '@/server/audit'
import type { PlatformContext } from '@/server/context'
import { writeActivity } from '@/server/modules/platform/growth/service'
import { canUseMail } from './service'
import { prepareIncomingHtml } from './render'
import { describeMailError, imapClient } from './transport'
import { ForbiddenError } from '@/server/context'

/* ------------------------------------------------------------------ types */

export type FolderRole = 'inbox' | 'sent' | 'drafts' | 'junk' | 'archive' | 'trash' | 'other'

export type InboxFolder = { path: string; label: string; role: FolderRole; unseen: number; total: number }

export type MailAddress = { name: string; address: string }

export type InboxRow = {
  uid: number
  from: MailAddress | null
  to: MailAddress[]
  subject: string
  date: Date
  seen: boolean
  flagged: boolean
  answered: boolean
  hasAttachments: boolean
  size: number
}

export type InboxAttachment = { index: number; filename: string; contentType: string; size: number }

export type InboxMessage = {
  uid: number
  folder: string
  subject: string
  from: MailAddress | null
  replyTo: MailAddress[]
  to: MailAddress[]
  cc: MailAddress[]
  date: Date
  messageId: string | null
  references: string[]
  flagged: boolean
  html: string
  hasRemoteImages: boolean
  text: string
  attachments: InboxAttachment[]
}

export type CrmMatch = { schoolId: string; schoolName: string; contactName: string | null }

const PAGE_SIZE = 30
/** Messages larger than this are not downloaded into the console. */
const MAX_MESSAGE_BYTES = 40 * 1024 * 1024

const ROLE_ORDER: FolderRole[] = ['inbox', 'sent', 'drafts', 'archive', 'junk', 'trash', 'other']
const ROLE_LABEL: Record<Exclude<FolderRole, 'other'>, string> = {
  inbox: 'Inbox',
  sent: 'Sent',
  drafts: 'Drafts',
  junk: 'Spam',
  archive: 'Archive',
  trash: 'Trash',
}

/* ----------------------------------------------------------------- access */

function assertMail(ctx: PlatformContext) {
  if (!canUseMail(ctx)) throw new ForbiddenError('You cannot read the company mailbox')
}

async function loadBox(ctx: PlatformContext, mailboxId?: string | null) {
  const box = mailboxId
    ? await ctx.db.platformMailbox.findUnique({ where: { id: mailboxId } })
    : await ctx.db.platformMailbox.findFirst({ orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
  if (!box) throw notFound('Mailbox')
  if (!box.imapEnabled) throw badRequest('Reading mail needs IMAP. Turn it on for this mailbox under Mail → Mailbox.')
  return box
}

type Box = Awaited<ReturnType<typeof loadBox>>

/** Opens one IMAP session for the duration of `fn`, always logging out. */
async function withImap<T>(box: Box, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = imapClient(box)
  try {
    await client.connect()
  } catch (error) {
    throw badRequest(`Could not open the mailbox: ${describeMailError(error)}`)
  }
  try {
    return await fn(client)
  } finally {
    await client.logout().catch(() => undefined)
  }
}

/* ---------------------------------------------------------------- helpers */

function roleOf(f: Pick<ListResponse, 'path' | 'specialUse'>): FolderRole {
  if (f.path.toUpperCase() === 'INBOX' || f.specialUse === '\\Inbox') return 'inbox'
  switch (f.specialUse) {
    case '\\Sent':
      return 'sent'
    case '\\Drafts':
      return 'drafts'
    case '\\Junk':
      return 'junk'
    case '\\Archive':
      return 'archive'
    case '\\Trash':
      return 'trash'
    default:
      return 'other'
  }
}

function envAddress(a?: MessageAddressObject): MailAddress | null {
  if (!a?.address) return null
  return { name: a.name?.trim() || '', address: a.address.toLowerCase() }
}

function parsedAddresses(field: AddressObject | AddressObject[] | undefined): MailAddress[] {
  if (!field) return []
  const groups = Array.isArray(field) ? field : [field]
  const out: MailAddress[] = []
  for (const g of groups) {
    for (const v of g.value) {
      if (v.address) out.push({ name: v.name?.trim() || '', address: v.address.toLowerCase() })
      for (const member of v.group ?? []) {
        if (member.address) out.push({ name: member.name?.trim() || '', address: member.address.toLowerCase() })
      }
    }
  }
  return out
}

function hasAttachment(node?: MessageStructureObject): boolean {
  if (!node) return false
  if (node.childNodes?.length) return node.childNodes.some(hasAttachment)
  if (node.disposition?.toLowerCase() === 'attachment') return true
  const name = node.dispositionParameters?.filename || node.parameters?.name
  return !!name && !node.type.startsWith('text/')
}

function toRow(m: FetchMessageObject): InboxRow {
  const env = m.envelope
  const date = env?.date ? new Date(env.date) : m.internalDate ? new Date(m.internalDate) : new Date(0)
  return {
    uid: m.uid,
    from: envAddress(env?.from?.[0]),
    to: (env?.to ?? []).map(envAddress).filter((a): a is MailAddress => !!a),
    subject: env?.subject?.trim() || '(no subject)',
    date: Number.isNaN(date.getTime()) ? new Date(0) : date,
    seen: m.flags?.has('\\Seen') ?? false,
    flagged: m.flags?.has('\\Flagged') ?? false,
    answered: m.flags?.has('\\Answered') ?? false,
    hasAttachments: hasAttachment(m.bodyStructure),
    size: m.size ?? 0,
  }
}

/** Real attachments only: inline images referenced from the HTML are shown in place. */
function listedAttachments(parsed: ParsedMail) {
  return parsed.attachments
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => !(a.related && a.contentDisposition === 'inline' && a.contentType.startsWith('image/')))
}

async function fetchParsed(client: ImapFlow, uid: number): Promise<{ parsed: ParsedMail; flags: Set<string> }> {
  const head = await client.fetchOne(String(uid), { uid: true, size: true }, { uid: true })
  if (!head) throw notFound('Message')
  if ((head.size ?? 0) > MAX_MESSAGE_BYTES) {
    throw badRequest('This message is too large to open in the console. Open it in Hostinger webmail.')
  }
  const msg = await client.fetchOne(String(uid), { uid: true, flags: true, source: true }, { uid: true })
  if (!msg || !msg.source) throw notFound('Message')
  const parsed = await simpleParser(msg.source, { skipTextToHtml: false })
  return { parsed, flags: msg.flags ?? new Set() }
}

/* ---------------------------------------------------------------- folders */

export async function listFolders(ctx: PlatformContext, mailboxId?: string | null) {
  assertMail(ctx)
  const box = await loadBox(ctx, mailboxId)
  const folders = await withImap(box, async (client) => {
    const all = await client.list({ statusQuery: { messages: true, unseen: true } })
    return all
      .filter((f) => !f.flags.has('\\Noselect') && !f.flags.has('\\NonExistent'))
      .map<InboxFolder>((f) => {
        const role = roleOf(f)
        return {
          path: f.path,
          label: role === 'other' ? f.name : ROLE_LABEL[role],
          role,
          unseen: f.status?.unseen ?? 0,
          total: f.status?.messages ?? 0,
        }
      })
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.label.localeCompare(b.label))
  })
  return { box: { id: box.id, fromEmail: box.fromEmail, fromName: box.fromName }, folders }
}

/* --------------------------------------------------------------- messages */

export type InboxListFilter = { folder?: string; page?: number; q?: string; unread?: boolean }

export async function listMessages(ctx: PlatformContext, mailboxId: string | null | undefined, filter: InboxListFilter) {
  assertMail(ctx)
  const box = await loadBox(ctx, mailboxId)
  const folder = filter.folder || 'INBOX'
  const page = Math.max(1, filter.page ?? 1)
  const q = filter.q?.trim().slice(0, 200)

  return withImap(box, async (client) => {
    const lock = await client.getMailboxLock(folder, { readOnly: true }).catch(() => {
      throw notFound('Folder')
    })
    try {
      const mailbox = client.mailbox
      const exists = mailbox ? mailbox.exists : 0
      let total: number
      let rows: InboxRow[] = []

      if (q || filter.unread) {
        const criteria: Parameters<ImapFlow['search']>[0] = {}
        if (filter.unread) criteria.seen = false
        if (q) criteria.or = [{ subject: q }, { from: q }, { to: q }]
        const uids = ((await client.search(criteria, { uid: true })) || []).sort((a, b) => b - a)
        total = uids.length
        const slice = uids.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        if (slice.length) {
          const fetched = await client.fetchAll(
            slice.join(','),
            { uid: true, envelope: true, flags: true, internalDate: true, size: true, bodyStructure: true },
            { uid: true },
          )
          rows = fetched.map(toRow)
        }
      } else {
        total = exists
        const end = exists - (page - 1) * PAGE_SIZE
        if (end >= 1) {
          const start = Math.max(1, end - PAGE_SIZE + 1)
          const fetched = await client.fetchAll(`${start}:${end}`, {
            uid: true,
            envelope: true,
            flags: true,
            internalDate: true,
            size: true,
            bodyStructure: true,
          })
          rows = fetched.map(toRow)
        }
      }
      rows.sort((a, b) => b.uid - a.uid)
      return { folder, page, pageSize: PAGE_SIZE, total, rows }
    } finally {
      lock.release()
    }
  })
}

/** Opening a message marks it read, as any mail client would. */
export async function readMessage(
  ctx: PlatformContext,
  mailboxId: string | null | undefined,
  folder: string,
  uid: number,
  opts: { allowRemoteImages?: boolean; markSeen?: boolean } = {},
): Promise<InboxMessage> {
  assertMail(ctx)
  const box = await loadBox(ctx, mailboxId)
  return withImap(box, async (client) => {
    const lock = await client.getMailboxLock(folder).catch(() => {
      throw notFound('Folder')
    })
    try {
      const { parsed, flags } = await fetchParsed(client, uid)
      if (opts.markSeen !== false && !flags.has('\\Seen')) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => undefined)
      }
      const { html, hasRemoteImages } = prepareIncomingHtml(
        typeof parsed.html === 'string' && parsed.html ? parsed.html : parsed.textAsHtml || '',
        {
          allowRemoteImages: !!opts.allowRemoteImages,
          inlineImages: parsed.attachments
            .filter((a) => a.contentId && a.contentType.startsWith('image/') && a.size <= 2 * 1024 * 1024)
            .map((a) => ({ contentId: a.contentId!.replace(/^<|>$/g, ''), contentType: a.contentType, content: a.content })),
        },
      )
      const references = Array.isArray(parsed.references)
        ? parsed.references
        : parsed.references
          ? parsed.references.split(/\s+/).filter(Boolean)
          : []
      return {
        uid,
        folder,
        subject: parsed.subject?.trim() || '(no subject)',
        from: parsedAddresses(parsed.from)[0] ?? null,
        replyTo: parsedAddresses(parsed.replyTo),
        to: parsedAddresses(parsed.to),
        cc: parsedAddresses(parsed.cc),
        date: parsed.date ?? new Date(0),
        messageId: parsed.messageId ?? null,
        references,
        flagged: flags.has('\\Flagged'),
        html,
        hasRemoteImages,
        text: parsed.text ?? '',
        attachments: listedAttachments(parsed).map(({ a, index }) => ({
          index,
          filename: a.filename || `attachment-${index + 1}`,
          contentType: a.contentType || 'application/octet-stream',
          size: a.size,
        })),
      }
    } finally {
      lock.release()
    }
  })
}

/** Attachments of a received message, decoded. `indexes` limits which ones. */
export async function messageAttachments(
  ctx: PlatformContext,
  mailboxId: string,
  folder: string,
  uid: number,
  indexes?: number[],
) {
  assertMail(ctx)
  const box = await loadBox(ctx, mailboxId)
  return withImap(box, async (client) => {
    const lock = await client.getMailboxLock(folder, { readOnly: true }).catch(() => {
      throw notFound('Folder')
    })
    try {
      const { parsed } = await fetchParsed(client, uid)
      return listedAttachments(parsed)
        .filter(({ index }) => !indexes || indexes.includes(index))
        .map(({ a, index }) => ({
          index,
          fileName: (a.filename || `attachment-${index + 1}`).replace(/[\\/]/g, '_'),
          mimeType: a.contentType || 'application/octet-stream',
          body: a.content,
        }))
    } finally {
      lock.release()
    }
  })
}

export async function readInboxAttachment(ctx: PlatformContext, mailboxId: string, folder: string, uid: number, index: number) {
  const [file] = await messageAttachments(ctx, mailboxId, folder, uid, [index])
  if (!file) throw notFound('Attachment')
  return file
}

/* ---------------------------------------------------------------- actions */

export type MessageAction = 'read' | 'unread' | 'flag' | 'unflag' | 'trash' | 'inbox' | 'archive'

export async function updateMessage(
  ctx: PlatformContext,
  mailboxId: string,
  folder: string,
  uid: number,
  action: MessageAction,
): Promise<{ movedTo?: string }> {
  assertMail(ctx)
  const box = await loadBox(ctx, mailboxId)
  const result = await withImap(box, async (client) => {
    const lock = await client.getMailboxLock(folder).catch(() => {
      throw notFound('Folder')
    })
    try {
      const range = String(uid)
      switch (action) {
        case 'read':
          await client.messageFlagsAdd(range, ['\\Seen'], { uid: true })
          return {}
        case 'unread':
          await client.messageFlagsRemove(range, ['\\Seen'], { uid: true })
          return {}
        case 'flag':
          await client.messageFlagsAdd(range, ['\\Flagged'], { uid: true })
          return {}
        case 'unflag':
          await client.messageFlagsRemove(range, ['\\Flagged'], { uid: true })
          return {}
        default: {
          const role: FolderRole = action
          const target =
            role === 'inbox' ? 'INBOX' : (await client.list()).find((f) => roleOf(f) === role)?.path
          if (!target) throw badRequest(`This mailbox has no ${ROLE_LABEL[role as 'trash' | 'archive']} folder`)
          if (target === folder) return {}
          const moved = await client.messageMove(range, target, { uid: true })
          if (!moved) throw badRequest('The mail server did not move the message')
          return { movedTo: target }
        }
      }
    } finally {
      lock.release()
    }
  })
  if (result.movedTo) {
    await audit({
      tenantId: null,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`.trim(),
      action: `platform.mail.move`,
      module: 'platform-mail',
      entityType: 'PlatformMailbox',
      entityId: box.id,
      summary: `Moved a message in ${box.fromEmail} from ${folder} to ${result.movedTo}`,
    })
  }
  return result
}

/** Flags the original as answered after a reply goes out, like webmail does. */
export async function markAnswered(ctx: PlatformContext, mailboxId: string, folder: string, uid: number) {
  assertMail(ctx)
  const box = await loadBox(ctx, mailboxId)
  await withImap(box, async (client) => {
    const lock = await client.getMailboxLock(folder)
    try {
      await client.messageFlagsAdd(String(uid), ['\\Answered'], { uid: true })
    } finally {
      lock.release()
    }
  })
}

/* -------------------------------------------------------------------- CRM */

/** Which CRM schools the given addresses belong to — a contact's email wins over the school's. */
export async function matchCrmSenders(ctx: PlatformContext, addresses: string[]): Promise<Map<string, CrmMatch>> {
  const wanted = [...new Set(addresses.map((a) => a.toLowerCase()).filter(Boolean))]
  const out = new Map<string, CrmMatch>()
  if (!wanted.length || !ctx.user.permissions.has('platform.crm')) return out
  const ci = wanted.map((email) => ({ email: { equals: email, mode: 'insensitive' as const } }))
  const [schools, contacts] = await Promise.all([
    ctx.db.crmSchool.findMany({ where: { deletedAt: null, OR: ci }, select: { id: true, name: true, email: true } }),
    ctx.db.crmContact.findMany({
      where: { deletedAt: null, OR: ci, school: { deletedAt: null } },
      select: { fullName: true, email: true, school: { select: { id: true, name: true } } },
    }),
  ])
  for (const s of schools) {
    if (s.email) out.set(s.email.toLowerCase(), { schoolId: s.id, schoolName: s.name, contactName: null })
  }
  for (const c of contacts) {
    if (c.email) out.set(c.email.toLowerCase(), { schoolId: c.school.id, schoolName: c.school.name, contactName: c.fullName })
  }
  return out
}

/** Records a received email on the school's CRM timeline, once per message. */
export async function logInboundToCrm(
  ctx: PlatformContext,
  mailboxId: string,
  folder: string,
  uid: number,
  schoolId: string,
): Promise<{ alreadyLogged: boolean }> {
  assertMail(ctx)
  if (!ctx.user.permissions.has('platform.crm')) throw new ForbiddenError('You cannot update the Growth CRM')
  const school = await ctx.db.crmSchool.findFirst({ where: { id: schoolId, deletedAt: null }, select: { id: true } })
  if (!school) throw notFound('CRM school')
  const message = await readMessage(ctx, mailboxId, folder, uid, { markSeen: false })
  const key = message.messageId ?? `${mailboxId}:${folder}:${uid}`
  const existing = await ctx.db.crmActivity.findFirst({
    where: { schoolId, meta: { path: ['inboundMessageId'], equals: key } },
    select: { id: true },
  })
  if (existing) return { alreadyLogged: true }
  const sender = message.from ? message.from.name || message.from.address : 'unknown sender'
  await writeActivity(ctx, {
    schoolId,
    type: 'EMAIL',
    summary: `Received “${message.subject}” from ${sender}`,
    body: message.text.slice(0, 4000),
    meta: { inboundMessageId: key, direction: 'INBOUND', from: message.from?.address ?? null },
  })
  return { alreadyLogged: false }
}
