import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { tenantDb } from '@/server/db/tenant-client'
import { audit } from '@/server/audit'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { notifyTenant } from '@/server/notifications'
import { whatsappProvider } from '@/server/providers'
import { sendParentMessage } from '@/server/messaging/send'
import { tenantUrl } from '@/server/tenant'
import { attendanceDate } from '@/lib/dates'
import { istClock } from '@/lib/ist-clock'
import { phoneKey } from '@/lib/phone'
import { crmInboundReply } from '@/server/modules/platform/growth/whatsapp-sales'
import {
  NOT_REGISTERED,
  OFFICE_PROMPT,
  attendanceText,
  examsText,
  feesText,
  homeworkText,
  interpret,
  menuText,
  pickListText,
  receiptText,
  type InboundMessage,
} from '@/lib/whatsapp-bot'

const NAMESPACE = 'whatsapp_assistant'
const KEY = 'config'

export type AssistantConfig = { enabled: boolean; greeting: string }
export const DEFAULT_ASSISTANT: AssistantConfig = { enabled: false, greeting: '' }

const configSchema = z.object({
  enabled: z.boolean().default(false),
  greeting: z.string().max(300).default(''),
})

export function parseAssistantConfig(raw: unknown): AssistantConfig {
  const r = configSchema.safeParse(raw ?? {})
  return r.success ? r.data : DEFAULT_ASSISTANT
}

export async function getAssistantSettings(ctx: AppContext) {
  ctx.require('settings.manage')
  const row = await ctx.db.setting.findFirst({ where: { namespace: NAMESPACE, key: KEY }, select: { value: true } })
  const [open, total] = await Promise.all([
    ctx.db.parentQuery.count({ where: { status: 'OPEN' } }),
    ctx.db.parentQuery.count(),
  ])
  return { config: parseAssistantConfig(row?.value), open, total }
}

export async function saveAssistantSettings(ctx: AppContext, raw: AssistantConfig) {
  ctx.require('settings.manage')
  const config = configSchema.parse(raw)
  await prisma.setting.upsert({
    where: { tenantId_namespace_key: { tenantId: ctx.tenant.id, namespace: NAMESPACE, key: KEY } },
    create: { tenantId: ctx.tenant.id, namespace: NAMESPACE, key: KEY, value: config as never },
    update: { value: config as never },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'settings.whatsapp_assistant',
    module: 'settings',
    entityType: 'Setting',
    entityId: `${NAMESPACE}:${KEY}`,
    summary: config.enabled ? 'Turned on the WhatsApp parent assistant' : 'Turned off the WhatsApp parent assistant',
  })
  return config
}

type Child = {
  tenantId: string
  tenantSlug: string
  schoolName: string
  greeting: string
  studentId: string
  parentId: string | null
  name: string
  firstName: string
  classLevelId: string | null
  sectionId: string | null
}

/**
 * Every current student this phone belongs to, in schools that have switched
 * the assistant on. Runs across tenants on purpose: the sender is identified
 * only by their number, and one parent can have children in two schools.
 */
export async function linkedChildren(key: string): Promise<Child[]> {
  const rows = await prisma.$queryRaw<{ tenantId: string; studentId: string; parentId: string | null }[]>`
    SELECT sg."tenantId", sg."studentId", p.id AS "parentId"
      FROM "Parent" p
      JOIN "StudentGuardian" sg ON sg."parentId" = p.id
     WHERE p."deletedAt" IS NULL
       AND right(regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g'), 10) = ${key}
    UNION
    SELECT s."tenantId", s.id AS "studentId", NULL AS "parentId"
      FROM "Student" s
     WHERE s."deletedAt" IS NULL
       AND right(regexp_replace(coalesce(s."whatsappPhone", ''), '\\D', '', 'g'), 10) = ${key}
  `
  if (rows.length === 0) return []

  const tenantIds = [...new Set(rows.map((r) => r.tenantId))]
  const [tenants, settings, students] = await Promise.all([
    prisma.tenant.findMany({
      where: { id: { in: tenantIds }, archivedAt: null, status: { in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } },
      select: { id: true, slug: true, name: true },
    }),
    prisma.setting.findMany({ where: { tenantId: { in: tenantIds }, namespace: NAMESPACE, key: KEY }, select: { tenantId: true, value: true } }),
    prisma.student.findMany({
      where: { id: { in: rows.map((r) => r.studentId) }, deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true,
        tenantId: true,
        firstName: true,
        lastName: true,
        enrollments: { where: { isCurrent: true }, take: 1, select: { classLevelId: true, sectionId: true } },
      },
      orderBy: { firstName: 'asc' },
    }),
  ])
  const enabled = new Map(
    settings
      .map((s) => [s.tenantId, parseAssistantConfig(s.value)] as const)
      .filter(([, c]) => c.enabled),
  )
  const tenantById = new Map(tenants.map((t) => [t.id, t]))

  const out: Child[] = []
  for (const s of students) {
    const t = tenantById.get(s.tenantId)
    const cfg = enabled.get(s.tenantId)
    if (!t || !cfg) continue
    const parentId = rows.find((r) => r.studentId === s.id && r.parentId)?.parentId ?? null
    out.push({
      tenantId: t.id,
      tenantSlug: t.slug,
      schoolName: t.name,
      greeting: cfg.greeting,
      studentId: s.id,
      parentId,
      name: `${s.firstName} ${s.lastName}`.trim(),
      firstName: s.firstName,
      classLevelId: s.enrollments[0]?.classLevelId ?? null,
      sectionId: s.enrollments[0]?.sectionId ?? null,
    })
  }
  return out
}

const dd = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

async function feesReply(c: Child) {
  const db = tenantDb(c.tenantId)
  const today = attendanceDate(istClock().iso)
  const invoices = await db.feeInvoice.findMany({
    where: { studentId: c.studentId, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] }, balanceMinor: { gt: 0 }, issuedOn: { lte: today } },
    orderBy: { dueOn: 'asc' },
    select: { title: true, dueOn: true, balanceMinor: true },
  })
  return feesText(c.firstName, {
    invoices: invoices.map((i) => ({ title: i.title, dueOn: dd(i.dueOn), balanceMinor: i.balanceMinor, overdue: i.dueOn < today })),
    payLink: invoices.length ? tenantUrl(c.tenantSlug, '/') : null,
  })
}

async function receiptReply(c: Child) {
  const db = tenantDb(c.tenantId)
  const p = await db.feePayment.findFirst({
    where: { studentId: c.studentId, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] } },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    select: { amountMinor: true, paidAt: true, createdAt: true, mode: true, receipt: { select: { number: true } } },
  })
  return receiptText(
    c.firstName,
    p
      ? {
          number: p.receipt?.number ?? '—',
          amountMinor: p.amountMinor,
          paidOn: (p.paidAt ?? p.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
          mode: p.mode,
          link: null,
        }
      : null,
  )
}

async function attendanceReply(c: Child) {
  const db = tenantDb(c.tenantId)
  const { iso } = istClock()
  const from = attendanceDate(`${iso.slice(0, 7)}-01`)
  const rows = await db.studentAttendance.findMany({
    where: { studentId: c.studentId, onDate: { gte: from, lte: attendanceDate(iso) } },
    orderBy: { onDate: 'asc' },
    select: { onDate: true, status: true },
  })
  const count = (s: string[]) => rows.filter((r) => s.includes(r.status)).length
  const todayRow = rows.find((r) => r.onDate.toISOString().slice(0, 10) === iso)
  return attendanceText(c.firstName, {
    monthLabel: from.toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' }),
    present: count(['PRESENT', 'HALF_DAY']),
    absent: count(['ABSENT']),
    late: count(['LATE']),
    leave: count(['LEAVE']),
    absentDates: rows.filter((r) => r.status === 'ABSENT').map((r) => dd(r.onDate)),
    today: todayRow ? todayRow.status.replace('_', ' ').toLowerCase() : null,
  })
}

async function examsReply(c: Child) {
  const db = tenantDb(c.tenantId)
  const today = attendanceDate(istClock().iso)
  const [upcoming, latest] = await Promise.all([
    c.classLevelId
      ? db.examSubject.findMany({
          where: {
            examDate: { gte: today },
            classSubject: { classLevelId: c.classLevelId },
            exam: { status: { in: ['SCHEDULED', 'ONGOING'] } },
          },
          orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
          take: 8,
          select: {
            examDate: true,
            startTime: true,
            exam: { select: { name: true } },
            classSubject: { select: { subject: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    db.result.findFirst({
      where: { studentId: c.studentId, publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
      select: { percentage: true, grade: true, rankInClass: true, exam: { select: { name: true } } },
    }),
  ])
  return examsText(c.firstName, {
    upcoming: upcoming.map((u) => ({ date: dd(u.examDate!), subject: u.classSubject.subject.name, exam: u.exam.name, time: u.startTime })),
    latest: latest ? { exam: latest.exam.name, percentage: latest.percentage, grade: latest.grade, rank: latest.rankInClass } : null,
  })
}

async function homeworkReply(c: Child) {
  if (!c.classLevelId) return homeworkText(c.firstName, { items: [] })
  const db = tenantDb(c.tenantId)
  const today = attendanceDate(istClock().iso)
  const items = await db.homework.findMany({
    where: {
      deletedAt: null,
      isPublished: true,
      classLevelId: c.classLevelId,
      OR: [{ sectionId: null }, { sectionId: c.sectionId }],
      dueOn: { gte: today },
    },
    orderBy: { dueOn: 'asc' },
    take: 10,
    select: { title: true, dueOn: true, classSubject: { select: { subject: { select: { name: true } } } } },
  })
  return homeworkText(c.firstName, { items: items.map((h) => ({ subject: h.classSubject.subject.name, title: h.title, dueOn: dd(h.dueOn) })) })
}

async function logQuery(c: Child, msg: InboundMessage, text: string) {
  const db = tenantDb(c.tenantId)
  const q = await db.parentQuery.create({
    data: {
      tenantId: c.tenantId,
      parentId: c.parentId,
      studentId: c.studentId,
      phone: phoneKey(msg.from)!,
      senderName: msg.name?.slice(0, 80) ?? null,
      message: text,
    },
  })
  const staff = await db.user.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      roles: { some: { role: { permissions: { some: { permission: { key: 'messages.parent_queries' } } } } } },
    },
    select: { id: true },
    take: 25,
  })
  if (staff.length) {
    await notifyTenant(c.tenantId, {
      userIds: staff.map((s) => s.id),
      eventKey: 'parent_query.new',
      title: `WhatsApp message about ${c.name}`,
      body: text.length > 140 ? `${text.slice(0, 140)}…` : text,
      linkUrl: '/front-office/parent-queries',
      channels: ['IN_APP'],
    })
  }
  return q
}

/**
 * One inbound message in, one reply out. Returns the reply (also sent) so the
 * conversation can be exercised without a provider.
 */
export async function handleInbound(msg: InboundMessage): Promise<string | null> {
  const key = phoneKey(msg.from)
  if (!key || !msg.text) return null

  const salesReply = await crmInboundReply(msg.from, msg.text)
  if (salesReply) {
    const r = await whatsappProvider().send({ to: msg.from.replace(/^whatsapp:/, ''), body: salesReply })
    if (!r.ok) console.warn('[whatsapp-bot] sales reply failed', r.error)
    return salesReply
  }

  const [children, session] = await Promise.all([
    linkedChildren(key),
    prisma.whatsAppBotSession.findUnique({ where: { phone: key } }),
  ])

  let reply: string | null
  let next: { schoolTenant?: string | null; studentId?: string | null; awaiting?: string | null } = {}

  if (children.length === 0) {
    // Only answer an unknown number once a day, so a mistyped number or a bot
    // on the other end cannot turn this into a loop.
    const recently = session && Date.now() - session.lastInboundAt.getTime() < 24 * 3600_000
    reply = recently ? null : NOT_REGISTERED
  } else {
    const intent = interpret(msg.text, session?.awaiting ?? null)
    let current = children.find((c) => c.studentId === session?.studentId) ?? (children.length === 1 ? children[0] : null)

    if (intent.kind === 'pick' && session?.awaiting === 'CHILD') {
      current = children[intent.index] ?? null
      if (current) {
        next = { schoolTenant: current.tenantId, studentId: current.studentId, awaiting: null }
        reply = menuText(current.schoolName, current.name, children.length > 1)
      } else {
        reply = pickListText('Please choose a child:', children.map((c) => `${c.name} (${c.schoolName})`))
      }
    } else if (!current || (intent.kind === 'switch' && children.length > 1)) {
      next = { awaiting: 'CHILD' }
      reply = pickListText('Which child is this about?', children.map((c) => `${c.name} (${c.schoolName})`))
    } else {
      next = { schoolTenant: current.tenantId, studentId: current.studentId, awaiting: null }
      const menu = () => menuText(current!.schoolName, current!.name, children.length > 1)
      switch (intent.kind) {
        case 'fees':
          reply = await feesReply(current)
          break
        case 'receipt':
          reply = await receiptReply(current)
          break
        case 'attendance':
          reply = await attendanceReply(current)
          break
        case 'exams':
          reply = await examsReply(current)
          break
        case 'homework':
          reply = await homeworkReply(current)
          break
        case 'office':
          next.awaiting = 'QUERY'
          reply = OFFICE_PROMPT
          break
        case 'message':
          await logQuery(current, msg, intent.text)
          reply = `✅ Sent to the ${current.schoolName} office. They will reply on this number.\n\nSend *menu* for more options.`
          break
        case 'menu':
          reply = `${current.greeting ? `${current.greeting}\n\n` : ''}${menu()}`
          break
        case 'stop':
        case 'switch':
          reply = menu()
          break
        default:
          reply = `Sorry, I didn’t understand that.\n\n${menu()}`
      }
      if (['fees', 'receipt', 'attendance', 'exams', 'homework'].includes(intent.kind)) {
        reply += '\n\nSend *menu* for more options.'
      }
    }
  }

  await prisma.whatsAppBotSession.upsert({
    where: { phone: key },
    create: { phone: key, lastInboundAt: new Date(), ...next },
    update: { lastInboundAt: new Date(), ...next },
  })

  if (reply) {
    const r = await whatsappProvider().send({ to: msg.from.replace(/^whatsapp:/, ''), body: reply })
    if (!r.ok) console.warn('[whatsapp-bot] reply failed', r.error)
  }
  return reply
}

export async function listParentQueries(ctx: AppContext, status: 'OPEN' | 'RESOLVED' | 'ALL') {
  ctx.require('messages.parent_queries')
  return ctx.db.parentQuery.findMany({
    where: status === 'ALL' ? {} : { status },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      phone: true,
      senderName: true,
      message: true,
      status: true,
      reply: true,
      repliedAt: true,
      createdAt: true,
      parent: { select: { firstName: true, lastName: true } },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          enrollments: { where: { isCurrent: true }, take: 1, select: { classLevel: { select: { name: true } }, section: { select: { name: true } } } },
        },
      },
    },
  })
}

export async function replyToParentQuery(ctx: AppContext, id: string, text: string, resolve: boolean) {
  ctx.require('messages.parent_queries')
  const body = text.trim()
  if (body.length < 2) throw badRequest('Write a reply first.')
  const q = await ctx.db.parentQuery.findFirst({ where: { id } })
  if (!q) throw notFound('Message')
  if (q.status === 'RESOLVED' && q.reply) throw conflict('This message has already been answered.')

  const r = await sendParentMessage({ to: q.phone, body: `${ctx.tenant.name}: ${body}` })
  if (!r.ok) throw badRequest(`Could not send: ${r.error ?? 'messaging failed'}`)

  await ctx.db.parentQuery.update({
    where: { id },
    data: { reply: body, repliedAt: new Date(), repliedById: ctx.user.userId, status: resolve ? 'RESOLVED' : 'OPEN' },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'messages.parent_query.reply',
    module: 'messages',
    entityType: 'ParentQuery',
    entityId: id,
    summary: 'Replied to a parent WhatsApp message',
  })
  return { channel: r.channel }
}

export async function resolveParentQuery(ctx: AppContext, id: string) {
  ctx.require('messages.parent_queries')
  const res = await ctx.db.parentQuery.updateMany({ where: { id }, data: { status: 'RESOLVED' } })
  if (res.count === 0) throw notFound('Message')
}
