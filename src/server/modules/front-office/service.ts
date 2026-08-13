import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { createLead } from '@/server/modules/admissions/service'
import {
  appointmentSchema,
  appointmentStatusSchema,
  visitorCheckInSchema,
  type AppointmentInput,
  type VisitorCheckInInput,
} from './schema'

function startOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export async function listTodayVisitors(ctx: AppContext) {
  ctx.require('frontoffice.view')
  return ctx.db.visitor.findMany({
    where: { checkInAt: { gte: startOfDay(), lte: endOfDay() } },
    orderBy: { checkInAt: 'desc' },
  })
}

export async function listAppointments(ctx: AppContext) {
  ctx.require('frontoffice.view')
  return ctx.db.appointment.findMany({
    where: { scheduledAt: { gte: startOfDay(new Date(Date.now() - 86_400_000)) } },
    orderBy: { scheduledAt: 'asc' },
    take: 100,
  })
}

export async function checkInVisitor(ctx: AppContext, raw: VisitorCheckInInput) {
  ctx.require('frontoffice.manage')
  const input = visitorCheckInSchema.parse(raw)
  const count = await ctx.db.visitor.count({
    where: { checkInAt: { gte: startOfDay() } },
  })
  const passNumber = `V-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(count + 1).padStart(3, '0')}`

  const visitor = await ctx.db.visitor.create({
    data: {
      tenantId: ctx.tenant.id,
      name: input.name,
      phone: input.phone ?? null,
      purpose: input.purpose,
      toMeet: input.toMeet ?? null,
      idProofNo: input.idProofNo ?? null,
      personCount: input.personCount,
      passNumber,
      recordedById: ctx.user.userId,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'frontoffice.visitor.checkin',
    module: 'front_office',
    entityType: 'Visitor',
    entityId: visitor.id,
    summary: `Checked in ${visitor.name} (${passNumber})`,
  })

  return visitor
}

export async function checkOutVisitor(ctx: AppContext, id: string) {
  ctx.require('frontoffice.manage')
  const visitor = await ctx.db.visitor.findFirst({ where: { id } })
  if (!visitor) throw notFound('Visitor not found')
  if (visitor.checkOutAt) throw conflict('Already checked out')

  return ctx.db.visitor.update({
    where: { id },
    data: { checkOutAt: new Date() },
  })
}

export async function createAppointment(ctx: AppContext, raw: AppointmentInput) {
  ctx.require('frontoffice.manage')
  const input = appointmentSchema.parse(raw)
  const appointment = await ctx.db.appointment.create({
    data: {
      tenantId: ctx.tenant.id,
      title: input.title,
      visitorName: input.visitorName,
      phone: input.phone ?? null,
      scheduledAt: input.scheduledAt,
      notes: input.notes ?? null,
      withStaffId: input.withStaffId ?? null,
      status: 'SCHEDULED',
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'frontoffice.appointment.create',
    module: 'front_office',
    entityType: 'Appointment',
    entityId: appointment.id,
    summary: `Scheduled ${appointment.title} with ${appointment.visitorName}`,
  })

  return appointment
}

export async function setAppointmentStatus(ctx: AppContext, id: string, status: string) {
  ctx.require('frontoffice.manage')
  const input = appointmentStatusSchema.parse({ status })
  const existing = await ctx.db.appointment.findFirst({ where: { id } })
  if (!existing) throw notFound('Appointment not found')
  return ctx.db.appointment.update({ where: { id }, data: { status: input.status } })
}

/** Create an admission lead from a walk-in visitor. */
export async function convertVisitorToLead(ctx: AppContext, visitorId: string) {
  ctx.require('frontoffice.manage')
  if (!ctx.can('admissions.manage')) {
    throw badRequest('Admissions manage permission is required')
  }
  const visitor = await ctx.db.visitor.findFirst({ where: { id: visitorId } })
  if (!visitor) throw notFound('Visitor not found')
  if (!visitor.phone) throw badRequest('Add a phone number on the visitor before converting')

  const lead = await createLead(ctx, {
    studentName: visitor.name,
    parentName: visitor.name,
    phone: visitor.phone,
    source: 'WALK_IN',
    notes: `Converted from visitor pass ${visitor.passNumber ?? visitor.id}. Purpose: ${visitor.purpose}`,
  })

  return lead
}
