import type { AppContext } from '@/server/context'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { uploadFile } from '@/server/files'
import { notify } from '@/server/notifications'
import { ROLE } from '@/lib/rbac/roles'
import { labelOf, INCIDENT_TYPES } from '@/lib/labs/types'
import { actorLabel, assertLabs, auditLab, dateOnly } from './access'
import { getLab, templateOf } from './service'
import { closeIncidentSchema, incidentSchema, inspectionSchema, wasteSchema } from './schema'

const DAY = 86_400_000
const MAX_PHOTOS = 6

async function uploadPhotos(ctx: AppContext, files: File[], folder: string) {
  const real = files.filter((f) => f && f.size > 0).slice(0, MAX_PHOTOS)
  const keys: string[] = []
  for (const file of real) {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      throw badRequest('Attach photos (JPG, PNG, WebP) or a PDF')
    }
    keys.push((await uploadFile(ctx, file, `labs/${folder}`)).storageKey)
  }
  return keys
}

/* ---------------------------------------------------------- inspections */

export async function recordInspection(ctx: AppContext, raw: unknown, photos: File[] = []) {
  ctx.require('labs.safety')
  const input = inspectionSchema.parse(raw)
  const lab = await getLab(ctx, input.labId)
  const template = templateOf(lab)
  const spec = template?.inspections.find((i) => i.type === input.type)
  const codes = spec ? spec.items.map((i) => i.code) : Object.keys(input.checklist)
  const checklist = Object.fromEntries(codes.map((c) => [c, input.checklist[c] === true]))
  const passed = Object.values(checklist).filter(Boolean).length
  const failed = codes.length - passed
  if (failed > 0 && !input.issues?.trim()) {
    throw badRequest('Note what failed and what will be done about it')
  }
  const photoKeys = await uploadPhotos(ctx, photos, 'inspections')
  const inspectedOn = dateOnly(input.inspectedOn)

  const inspection = await ctx.db.labInspection.create({
    data: {
      tenantId: ctx.tenant.id,
      labId: lab.id,
      type: input.type,
      inspectedOn,
      checklist,
      passed,
      failed,
      issues: input.issues?.trim() || null,
      inspectorName: input.inspectorName?.trim() || actorLabel(ctx),
      photoKeys,
      nextDueOn: spec ? new Date(inspectedOn.getTime() + spec.everyDays * DAY) : null,
      createdById: ctx.user.userId,
    },
  })
  await auditLab(ctx, 'labs.inspection', 'LabInspection', inspection.id, `${spec?.label ?? input.type} of ${lab.name}: ${passed}/${codes.length} passed`)

  if (failed > 0 && input.type !== 'DAILY') {
    await notify(ctx, {
      userIds: await safetyRecipients(ctx, lab),
      eventKey: 'labs.inspection_failed',
      title: `${lab.name}: ${failed} safety check(s) failed`,
      body: input.issues?.slice(0, 280) ?? '',
      linkUrl: `/labs/${lab.id}/safety#inspections`,
    })
  }
  return inspection
}

export async function listInspections(ctx: AppContext, labId: string, take = 100) {
  ctx.require('labs.view')
  await getLab(ctx, labId)
  return ctx.db.labInspection.findMany({ where: { labId }, orderBy: [{ inspectedOn: 'desc' }, { createdAt: 'desc' }], take })
}

/* ------------------------------------------------------------ incidents */

/** Principal, school admins and the lab's in-charge: who must hear about a lab incident. */
async function safetyRecipients(ctx: AppContext, lab: { inChargeStaffId: string | null }) {
  const leaders = await ctx.db.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      roles: { some: { role: { key: { in: [ROLE.PRINCIPAL, ROLE.SCHOOL_ADMIN] } } } },
    },
    select: { id: true },
  })
  const ids = leaders.map((u) => u.id)
  if (lab.inChargeStaffId) {
    const staff = await ctx.db.staff.findFirst({ where: { id: lab.inChargeStaffId }, select: { userId: true } })
    if (staff?.userId) ids.push(staff.userId)
  }
  return ids.filter((id) => id !== ctx.user.userId)
}

export async function reportIncident(ctx: AppContext, raw: unknown, photos: File[] = []) {
  ctx.require('labs.safety')
  const input = incidentSchema.parse(raw)
  const lab = await getLab(ctx, input.labId)
  const occurredAt = new Date(input.occurredAt)
  if (Number.isNaN(occurredAt.getTime())) throw badRequest('Enter when it happened')
  if (occurredAt.getTime() > Date.now() + 5 * 60_000) throw badRequest('The incident time cannot be in the future')

  if (input.studentIds.length) {
    const found = await ctx.db.student.count({ where: { id: { in: input.studentIds } } })
    if (found !== new Set(input.studentIds).size) throw notFound('Student')
  }
  const photoKeys = await uploadPhotos(ctx, photos, 'incidents')

  const incident = await ctx.db.labIncident.create({
    data: {
      tenantId: ctx.tenant.id,
      labId: lab.id,
      occurredAt,
      type: input.type,
      severity: input.severity,
      description: input.description,
      studentIds: input.studentIds,
      firstAidGiven: input.firstAidGiven,
      parentInformed: input.parentInformed,
      actionTaken: input.actionTaken ?? null,
      photoKeys,
      reportedById: ctx.user.userId,
      reportedByLabel: actorLabel(ctx),
    },
  })
  await auditLab(ctx, 'labs.incident.report', 'LabIncident', incident.id, `Reported a ${input.severity.toLowerCase()} ${labelOf(INCIDENT_TYPES, input.type).toLowerCase()} in ${lab.name}`)

  await notify(ctx, {
    userIds: await safetyRecipients(ctx, lab),
    eventKey: 'labs.incident',
    title: `Lab incident (${input.severity.toLowerCase()}): ${labelOf(INCIDENT_TYPES, input.type)} in ${lab.name}`,
    body: input.description.slice(0, 280),
    linkUrl: `/labs/${lab.id}/safety#incidents`,
    channels: input.severity === 'SERIOUS' ? ['IN_APP', 'EMAIL'] : undefined,
  })
  return incident
}

export async function closeIncident(ctx: AppContext, raw: unknown) {
  ctx.require('labs.safety')
  await assertLabs(ctx)
  const input = closeIncidentSchema.parse(raw)
  const incident = await ctx.db.labIncident.findFirst({ where: { id: input.incidentId } })
  if (!incident) throw notFound('Incident')
  if (incident.status === 'CLOSED') throw conflict('This incident is already closed')
  await ctx.db.labIncident.update({
    where: { id: incident.id },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      actionTaken: input.actionTaken,
      parentInformed: incident.parentInformed || input.parentInformed,
    },
  })
  await auditLab(ctx, 'labs.incident.close', 'LabIncident', incident.id, 'Closed a lab incident')
}

export async function listIncidents(ctx: AppContext, labId: string, take = 100) {
  ctx.require('labs.view')
  await getLab(ctx, labId)
  return ctx.db.labIncident.findMany({ where: { labId }, orderBy: { occurredAt: 'desc' }, take })
}

/* ---------------------------------------------------------------- waste */

export async function logWaste(ctx: AppContext, raw: unknown) {
  ctx.require('labs.safety')
  const input = wasteSchema.parse(raw)
  const lab = await getLab(ctx, input.labId)
  const row = await ctx.db.labWasteLog.create({
    data: {
      tenantId: ctx.tenant.id,
      labId: lab.id,
      disposedOn: dateOnly(input.disposedOn),
      category: input.category,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      handedTo: input.handedTo ?? null,
      notes: input.notes ?? null,
      createdById: ctx.user.userId,
    },
  })
  await auditLab(ctx, 'labs.waste', 'LabWasteLog', row.id, `Logged ${input.category.toLowerCase().replace(/_/g, ' ')} waste disposal for ${lab.name}`)
  return row
}

export async function listWaste(ctx: AppContext, labId: string, take = 100) {
  ctx.require('labs.view')
  await getLab(ctx, labId)
  return ctx.db.labWasteLog.findMany({ where: { labId }, orderBy: { disposedOn: 'desc' }, take })
}
