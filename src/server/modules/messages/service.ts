import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { skipTake, type ListQuery } from '@/lib/query'
import { notify } from '@/server/notifications'
import { isSelfScoped } from '@/lib/rbac/roles'

/**
 * The school mailbox.
 *
 * Internal mail between people at one school, built on the conversation model
 * rather than on a second copy of it: a thread is a conversation, a mail is a
 * message in it, and the mailbox state a person sees — read, starred, archived
 * — hangs off their own participant row. Archiving something clears it from
 * your inbox and leaves everyone else's alone, which is what a mailbox has to
 * do and what a shared per-thread flag could never express.
 *
 * Nothing here leaves the building. Connecting the school's own mail server
 * (see server/mail/smtp.ts) governs outbound notification email; internal mail
 * stays internal, so a note about tomorrow's cover arrangements is not sitting
 * in a third-party inbox.
 */

export const composeSchema = z.object({
  recipientIds: z.array(z.string().min(1)).min(1, 'Choose at least one recipient').max(50),
  subject: z.string().trim().min(1, 'Enter a subject').max(160),
  body: z.string().trim().min(1, 'Write a message').max(20_000),
})

export const replySchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().trim().min(1, 'Write a reply').max(20_000),
})

export type ComposeInput = z.infer<typeof composeSchema>
export type ReplyInput = z.infer<typeof replySchema>

export const FOLDERS = ['inbox', 'unread', 'starred', 'sent', 'archived'] as const
export type Folder = (typeof FOLDERS)[number]

export function parseFolder(value: string | undefined): Folder {
  return FOLDERS.includes(value as Folder) ? (value as Folder) : 'inbox'
}

function actor(ctx: AppContext) {
  return {
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    module: 'messages',
  }
}

// ---------------------------------------------------------------------------
// Who may write to whom
// ---------------------------------------------------------------------------

/**
 * Parents and students may only address staff.
 *
 * They hold `messages.send` so a parent can reach their child's teacher — not
 * so the school directory becomes a way for families to contact each other.
 * The restriction is enforced on the send path as well as in the picker,
 * because a picker is a convenience and a check is a rule.
 */
async function staffUserIds(ctx: AppContext): Promise<Set<string>> {
  const staff = await ctx.db.staff.findMany({
    where: { deletedAt: null, userId: { not: null } },
    select: { userId: true },
  })
  return new Set(staff.map((s) => s.userId).filter((id): id is string => !!id))
}

async function assertMayAddress(ctx: AppContext, recipientIds: string[]): Promise<void> {
  if (!isSelfScoped(ctx.user.roleKeys)) return

  const allowed = await staffUserIds(ctx)
  const blocked = recipientIds.filter((id) => !allowed.has(id))
  if (blocked.length > 0) {
    throw conflict('You can only send messages to school staff.')
  }
}

export type RecipientOption = {
  id: string
  name: string
  role: string
  email: string | null
  avatarUrl: string | null
}

/** The address book, narrowed to who this user is allowed to write to. */
export async function recipientDirectory(
  ctx: AppContext,
  search?: string,
): Promise<RecipientOption[]> {
  ctx.require('messages.send')

  const selfScoped = isSelfScoped(ctx.user.roleKeys)
  const allowed = selfScoped ? await staffUserIds(ctx) : null

  const users = await ctx.db.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      id: { not: ctx.user.userId },
      ...(allowed ? { id: { in: [...allowed] } } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ firstName: 'asc' }],
    take: 40,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarUrl: true,
      staff: { select: { designation: true } },
      parent: { select: { id: true } },
      student: { select: { id: true } },
    },
  })

  return users.map((user) => ({
    id: user.id,
    name: `${user.firstName} ${user.lastName}`,
    role: user.staff
      ? (user.staff.designation ?? 'Staff')
      : user.parent
        ? 'Parent'
        : user.student
          ? 'Student'
          : 'Member',
    email: user.email,
    avatarUrl: user.avatarUrl,
  }))
}

// ---------------------------------------------------------------------------
// Reading the mailbox
// ---------------------------------------------------------------------------

export type ThreadSummary = {
  id: string
  subject: string
  kind: string
  lastMessageAt: Date
  unread: boolean
  starred: boolean
  archived: boolean
  messageCount: number
  preview: string
  participants: { id: string; name: string; avatarUrl: string | null }[]
  lastSenderName: string
}

export async function listThreads(
  ctx: AppContext,
  folder: Folder,
  query: ListQuery,
): Promise<{ rows: ThreadSummary[]; total: number }> {
  ctx.require('messages.view')

  const me = ctx.user.userId

  // Sent is the one folder defined by the messages rather than by the
  // participant row: it is "threads I have written in", not a flag.
  const where = {
    participants: { some: { userId: me } },
    ...(folder === 'archived'
      ? { participants: { some: { userId: me, archivedAt: { not: null } } } }
      : {}),
    ...(folder === 'inbox' || folder === 'unread'
      ? { participants: { some: { userId: me, archivedAt: null } } }
      : {}),
    ...(folder === 'starred'
      ? { participants: { some: { userId: me, starredAt: { not: null } } } }
      : {}),
    ...(folder === 'sent' ? { messages: { some: { senderId: me, deletedAt: null } } } : {}),
    ...(query.q
      ? {
          OR: [
            { subject: { contains: query.q, mode: 'insensitive' as const } },
            { messages: { some: { body: { contains: query.q, mode: 'insensitive' as const } } } },
          ],
        }
      : {}),
  }

  // Unread cannot be expressed as a filter: it compares two columns
  // (lastReadAt against lastMessageAt) and Prisma has no way to say that. So
  // that folder reads a bounded window of recent threads and narrows it here,
  // rather than paginating a filter the database cannot apply.
  const window = folder === 'unread' ? { take: 200 } : skipTake(query)

  const [conversations, total] = await Promise.all([
    ctx.db.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      ...window,
      select: {
        id: true,
        subject: true,
        kind: true,
        lastMessageAt: true,
        participants: {
          select: {
            userId: true,
            lastReadAt: true,
            archivedAt: true,
            starredAt: true,
          },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            body: true,
            createdAt: true,
            sender: { select: { firstName: true, lastName: true } },
          },
        },
        _count: { select: { messages: { where: { deletedAt: null } } } },
      },
    }),
    ctx.db.conversation.count({ where }),
  ])

  const names = await participantNames(ctx, conversations.flatMap((c) => c.participants.map((p) => p.userId)))

  const rows = conversations.map((conversation) => {
    const mine = conversation.participants.find((p) => p.userId === me)
    const last = conversation.messages[0]

    return {
      id: conversation.id,
      subject: conversation.subject ?? '(no subject)',
      kind: conversation.kind,
      lastMessageAt: conversation.lastMessageAt,
      unread: !mine?.lastReadAt || mine.lastReadAt < conversation.lastMessageAt,
      starred: !!mine?.starredAt,
      archived: !!mine?.archivedAt,
      messageCount: conversation._count.messages,
      preview: last?.body.replace(/\s+/g, ' ').slice(0, 140) ?? '',
      participants: conversation.participants
        .filter((p) => p.userId !== me)
        .map((p) => names.get(p.userId) ?? { id: p.userId, name: 'Unknown', avatarUrl: null }),
      lastSenderName: last ? `${last.sender.firstName} ${last.sender.lastName}` : '',
    }
  })

  if (folder !== 'unread') return { rows, total }

  const unread = rows.filter((row) => row.unread)
  const { skip, take } = skipTake(query)
  return { rows: unread.slice(skip, skip + take), total: unread.length }
}

async function participantNames(ctx: AppContext, userIds: string[]) {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return new Map<string, { id: string; name: string; avatarUrl: string | null }>()

  const users = await ctx.db.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  })

  return new Map(
    users.map((user) => [
      user.id,
      { id: user.id, name: `${user.firstName} ${user.lastName}`, avatarUrl: user.avatarUrl },
    ]),
  )
}

export type ThreadDetail = {
  id: string
  subject: string
  kind: string
  starred: boolean
  archived: boolean
  participants: { id: string; name: string; avatarUrl: string | null; isMe: boolean }[]
  messages: {
    id: string
    body: string
    createdAt: Date
    senderId: string
    senderName: string
    senderAvatarUrl: string | null
    isMe: boolean
    attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[]
  }[]
}

/**
 * One thread, and marking it read.
 *
 * Opening a thread is what "read" means, so the read stamp is written here
 * rather than being left to a separate call the client might not make.
 */
export async function readThread(ctx: AppContext, conversationId: string): Promise<ThreadDetail> {
  ctx.require('messages.view')
  const me = ctx.user.userId

  const conversation = await ctx.db.conversation.findFirst({
    where: { id: conversationId, participants: { some: { userId: me } } },
    select: {
      id: true,
      subject: true,
      kind: true,
      participants: { select: { userId: true, starredAt: true, archivedAt: true } },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: {
          id: true,
          body: true,
          createdAt: true,
          senderId: true,
          sender: { select: { firstName: true, lastName: true, avatarUrl: true } },
          attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
        },
      },
    },
  })
  // A thread you are not part of is not "forbidden", it does not exist: the
  // participant filter is in the query, so a guessed id reveals nothing.
  if (!conversation) throw notFound('Conversation')

  await ctx.db.conversationParticipant.updateMany({
    where: { conversationId, userId: me },
    data: { lastReadAt: new Date() },
  })

  const mine = conversation.participants.find((p) => p.userId === me)
  const names = await participantNames(ctx, conversation.participants.map((p) => p.userId))

  return {
    id: conversation.id,
    subject: conversation.subject ?? '(no subject)',
    kind: conversation.kind,
    starred: !!mine?.starredAt,
    archived: !!mine?.archivedAt,
    participants: conversation.participants.map((p) => ({
      ...(names.get(p.userId) ?? { id: p.userId, name: 'Unknown', avatarUrl: null }),
      isMe: p.userId === me,
    })),
    messages: conversation.messages.map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      senderId: message.senderId,
      senderName: `${message.sender.firstName} ${message.sender.lastName}`,
      senderAvatarUrl: message.sender.avatarUrl,
      isMe: message.senderId === me,
      attachments: message.attachments,
    })),
  }
}

export async function unreadThreadCount(ctx: AppContext): Promise<number> {
  if (!ctx.can('messages.view')) return 0

  const rows = await ctx.db.conversationParticipant.findMany({
    where: { userId: ctx.user.userId, archivedAt: null },
    select: { lastReadAt: true, conversation: { select: { lastMessageAt: true } } },
  })

  return rows.filter((row) => !row.lastReadAt || row.lastReadAt < row.conversation.lastMessageAt)
    .length
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export async function compose(ctx: AppContext, input: ComposeInput) {
  ctx.require('messages.send')

  const recipients = [...new Set(input.recipientIds)].filter((id) => id !== ctx.user.userId)
  if (recipients.length === 0) throw conflict('Choose at least one recipient other than yourself.')

  await assertMayAddress(ctx, recipients)

  // Recipients are re-read through the tenant client, so an id belonging to
  // another school cannot be added to a thread by hand-editing the form.
  const valid = await ctx.db.user.findMany({
    where: { id: { in: recipients }, deletedAt: null, status: 'ACTIVE' },
    select: { id: true },
  })
  if (valid.length !== recipients.length) throw conflict('One of those recipients is no longer active.')

  const now = new Date()
  const everyone = [ctx.user.userId, ...recipients]

  const conversation = await ctx.db.$transaction(async (tx) => {
    const created = await tx.conversation.create({
      data: {
        tenantId: ctx.tenant.id,
        subject: input.subject,
        kind: recipients.length > 1 ? 'GROUP' : 'DIRECT',
        createdById: ctx.user.userId,
        lastMessageAt: now,
        participants: {
          create: everyone.map((userId) => ({
            tenantId: ctx.tenant.id,
            userId,
            // The sender has read what they just wrote.
            lastReadAt: userId === ctx.user.userId ? now : null,
          })),
        },
      },
    })

    await tx.message.create({
      data: {
        tenantId: ctx.tenant.id,
        conversationId: created.id,
        senderId: ctx.user.userId,
        body: input.body,
      },
    })

    return created
  })

  await notifyRecipients(ctx, recipients, input.subject, input.body, conversation.id)

  await audit({
    ...actor(ctx),
    action: 'message.send',
    entityType: 'Conversation',
    entityId: conversation.id,
    summary: `Sent "${input.subject}" to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`,
  })

  return conversation
}

export async function reply(ctx: AppContext, input: ReplyInput) {
  ctx.require('messages.send')
  const me = ctx.user.userId

  const conversation = await ctx.db.conversation.findFirst({
    where: { id: input.conversationId, participants: { some: { userId: me } } },
    select: { id: true, subject: true, participants: { select: { userId: true } } },
  })
  if (!conversation) throw notFound('Conversation')

  const now = new Date()

  await ctx.db.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        tenantId: ctx.tenant.id,
        conversationId: conversation.id,
        senderId: me,
        body: input.body,
      },
    })
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now },
    })
    await tx.conversationParticipant.updateMany({
      where: { conversationId: conversation.id, userId: me },
      data: { lastReadAt: now },
    })
    // A reply pulls the thread back out of everyone's archive: it is new mail
    // again, and leaving it filed away is how a request goes unanswered.
    await tx.conversationParticipant.updateMany({
      where: { conversationId: conversation.id, userId: { not: me } },
      data: { archivedAt: null },
    })
  })

  const others = conversation.participants.map((p) => p.userId).filter((id) => id !== me)
  await notifyRecipients(ctx, others, conversation.subject ?? 'New message', input.body, conversation.id)

  return { ok: true }
}

async function notifyRecipients(
  ctx: AppContext,
  userIds: string[],
  subject: string,
  body: string,
  conversationId: string,
) {
  if (userIds.length === 0) return

  await notify(ctx, {
    userIds,
    eventKey: `messages.received.${conversationId}`,
    title: `${ctx.user.firstName} ${ctx.user.lastName}: ${subject}`,
    body: body.replace(/\s+/g, ' ').slice(0, 180),
    linkUrl: `/communication/messages?thread=${conversationId}`,
  })
}

// ---------------------------------------------------------------------------
// Mailbox state
// ---------------------------------------------------------------------------

export async function setStarred(ctx: AppContext, conversationId: string, starred: boolean) {
  ctx.require('messages.view')
  await ctx.db.conversationParticipant.updateMany({
    where: { conversationId, userId: ctx.user.userId },
    data: { starredAt: starred ? new Date() : null },
  })
  return { starred }
}

export async function setArchived(ctx: AppContext, conversationId: string, archived: boolean) {
  ctx.require('messages.view')
  await ctx.db.conversationParticipant.updateMany({
    where: { conversationId, userId: ctx.user.userId },
    data: { archivedAt: archived ? new Date() : null },
  })
  return { archived }
}

export async function markRead(ctx: AppContext, conversationId: string, read: boolean) {
  ctx.require('messages.view')
  await ctx.db.conversationParticipant.updateMany({
    where: { conversationId, userId: ctx.user.userId },
    // Clearing the stamp is what "mark unread" means; there is no separate
    // flag to fall out of step with it.
    data: { lastReadAt: read ? new Date() : null },
  })
  return { read }
}

/** Folder counts for the rail. */
export async function folderCounts(ctx: AppContext) {
  const me = ctx.user.userId

  const [participantRows, sent] = await Promise.all([
    ctx.db.conversationParticipant.findMany({
      where: { userId: me },
      select: {
        lastReadAt: true,
        archivedAt: true,
        starredAt: true,
        conversation: { select: { lastMessageAt: true } },
      },
    }),
    ctx.db.conversation.count({
      where: { messages: { some: { senderId: me, deletedAt: null } } },
    }),
  ])

  const active = participantRows.filter((row) => !row.archivedAt)

  return {
    inbox: active.length,
    unread: active.filter(
      (row) => !row.lastReadAt || row.lastReadAt < row.conversation.lastMessageAt,
    ).length,
    starred: participantRows.filter((row) => row.starredAt).length,
    sent,
    archived: participantRows.filter((row) => row.archivedAt).length,
  }
}
