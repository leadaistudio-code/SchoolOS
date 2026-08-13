import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import {
  eventSchema,
  registerParticipantSchema,
  type EventInput,
} from './schema'

export async function listEvents(ctx: AppContext) {
  ctx.require('events.view')
  return ctx.db.schoolEvent.findMany({
    where: { deletedAt: null },
    orderBy: { startsAt: 'desc' },
    include: { _count: { select: { participants: true } } },
    take: 100,
  })
}

export async function getEvent(ctx: AppContext, id: string) {
  ctx.require('events.view')
  const event = await ctx.db.schoolEvent.findFirst({
    where: { id, deletedAt: null },
    include: {
      participants: {
        orderBy: { registeredAt: 'desc' },
        take: 200,
      },
    },
  })
  if (!event) throw notFound('Event not found')

  const studentIds = event.participants.map((p) => p.studentId).filter(Boolean) as string[]
  const students =
    studentIds.length > 0
      ? await ctx.db.student.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, firstName: true, lastName: true, admissionNo: true },
        })
      : []
  const byId = new Map(students.map((s) => [s.id, s]))

  return {
    ...event,
    participants: event.participants.map((p) => ({
      ...p,
      student: p.studentId ? byId.get(p.studentId) ?? null : null,
    })),
  }
}

export async function createEvent(ctx: AppContext, raw: EventInput) {
  ctx.require('events.manage')
  const input = eventSchema.parse(raw)
  const event = await ctx.db.schoolEvent.create({
    data: {
      tenantId: ctx.tenant.id,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      venue: input.venue ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      registrationOpen: input.registrationOpen,
      maxParticipants: input.maxParticipants ?? null,
      createdById: ctx.user.userId,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'events.create',
    module: 'events',
    entityType: 'SchoolEvent',
    entityId: event.id,
    summary: `Created event ${event.title}`,
  })

  return event
}

export async function registerParticipant(ctx: AppContext, eventId: string, studentId: string) {
  ctx.require('events.manage')
  const input = registerParticipantSchema.parse({ studentId })
  const event = await ctx.db.schoolEvent.findFirst({ where: { id: eventId, deletedAt: null } })
  if (!event) throw notFound('Event not found')

  if (event.maxParticipants) {
    const count = await ctx.db.eventParticipant.count({ where: { eventId } })
    if (count >= event.maxParticipants) throw conflict('Event is full')
  }

  const existing = await ctx.db.eventParticipant.findFirst({
    where: { eventId, studentId: input.studentId },
  })
  if (existing) throw conflict('Student already registered')

  return ctx.db.eventParticipant.create({
    data: {
      tenantId: ctx.tenant.id,
      eventId,
      studentId: input.studentId,
      role: input.role,
    },
  })
}

export async function unregisterParticipant(ctx: AppContext, participantId: string) {
  ctx.require('events.manage')
  const row = await ctx.db.eventParticipant.findFirst({ where: { id: participantId } })
  if (!row) throw notFound('Participant not found')
  await ctx.db.eventParticipant.delete({ where: { id: participantId } })
  return row
}
