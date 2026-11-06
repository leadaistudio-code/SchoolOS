import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { notFound } from '@/server/api/response'
import { schoolToday } from '@/lib/periods'
import { labTemplate, templateForType } from '@/lib/labs/templates'
import { computeReadiness, type InfraAnswers, type Readiness } from '@/lib/labs/readiness'
import type { InspectionTypeValue, LabTemplate } from '@/lib/labs/types'
import { assertLabs, auditLab, dateOnly } from './access'
import { createLabSchema, infrastructureSchema, updateLabSchema } from './schema'

const DAY = 86_400_000

export type LabRow = Prisma.LabGetPayload<object>

export async function labFormOptions(ctx: AppContext) {
  const [staff, sections] = await Promise.all([
    ctx.db.staff.findMany({
      where: { deletedAt: null, leftOn: null },
      select: { id: true, firstName: true, lastName: true, designation: true, userId: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    ctx.db.section.findMany({
      where: { deletedAt: null, classLevel: { deletedAt: null, session: { isCurrent: true } } },
      select: { id: true, name: true, classLevel: { select: { name: true, numeric: true } } },
      orderBy: [{ classLevel: { numeric: 'asc' } }, { name: 'asc' }],
    }),
  ])
  return {
    staff: staff.map((s) => ({
      id: s.id,
      userId: s.userId,
      label: `${s.firstName} ${s.lastName}${s.designation ? ` · ${s.designation}` : ''}`,
    })),
    sections: sections.map((s) => ({
      id: s.id,
      classNumber: s.classLevel.numeric,
      label: `${s.classLevel.name} ${s.name}`,
    })),
  }
}

export async function listLabs(ctx: AppContext) {
  ctx.require('labs.view')
  await assertLabs(ctx)
  return ctx.db.lab.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } })
}

export async function getLab(ctx: AppContext, id: string) {
  ctx.require('labs.view')
  await assertLabs(ctx)
  const lab = await ctx.db.lab.findFirst({ where: { id, deletedAt: null } })
  if (!lab) throw notFound('Lab')
  return lab
}

export function templateOf(lab: { templateCode: string | null }): LabTemplate | null {
  return labTemplate(lab.templateCode)
}

export async function createLab(ctx: AppContext, raw: unknown) {
  ctx.require('labs.manage')
  await assertLabs(ctx)
  const input = createLabSchema.parse(raw)
  const template = templateForType(input.type)
  const tenantId = ctx.tenant.id

  const lab = await ctx.db.$transaction(async (raw) => {
    const tx = raw as unknown as Prisma.TransactionClient
    const lab = await tx.lab.create({
      data: {
        tenantId,
        name: input.name,
        type: input.type,
        templateCode: template?.code ?? null,
        room: input.room ?? null,
        inChargeStaffId: input.inChargeStaffId ?? null,
        assistantStaffId: input.assistantStaffId ?? null,
      },
    })

    if (template && input.loadItems) {
      await tx.labItem.createMany({
        data: template.items.map((t) => ({
          tenantId,
          labId: lab.id,
          templateCode: t.code,
          name: t.name,
          category: t.category,
          kind: t.kind,
          unit: t.unit,
          requiredQty: t.required,
          quantity: 0,
          // Consumables flag at a quarter of the template's batch requirement.
          reorderLevel: t.kind === 'CONSUMABLE' ? Math.ceil(t.required / 4) : 0,
          hazards: t.hazards ?? [],
          notes: t.note ?? null,
        })),
      })
    }

    if (template && input.loadPracticals) {
      const existing = await tx.labExperiment.count({ where: { tenantId, labType: input.type, deletedAt: null } })
      if (existing === 0) {
        await tx.labExperiment.createMany({
          data: template.practicals.map((p) => ({
            tenantId,
            labType: input.type,
            templateCode: p.code,
            classNumber: p.classNumber,
            subject: p.subject,
            title: p.title,
            aim: p.aim,
            apparatus: p.apparatus,
            safetyNotes: p.safety ?? null,
          })),
        })
      }
    }
    return lab
  })

  await auditLab(ctx, 'labs.create', 'Lab', lab.id, `Set up ${lab.name}`)
  return lab
}

export async function updateLab(ctx: AppContext, id: string, raw: unknown) {
  ctx.require('labs.manage')
  await getLab(ctx, id)
  const input = updateLabSchema.parse(raw)
  const lab = await ctx.db.lab.update({
    where: { id },
    data: {
      name: input.name,
      room: input.room ?? null,
      inChargeStaffId: input.inChargeStaffId ?? null,
      assistantStaffId: input.assistantStaffId ?? null,
      notes: input.notes ?? null,
      emergencyContacts: input.emergencyContacts,
    },
  })
  await auditLab(ctx, 'labs.update', 'Lab', id, `Updated ${lab.name}`)
  return lab
}

export async function deleteLab(ctx: AppContext, id: string) {
  ctx.require('labs.manage')
  const lab = await getLab(ctx, id)
  await ctx.db.lab.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
  await auditLab(ctx, 'labs.delete', 'Lab', id, `Removed ${lab.name}`)
}

export async function saveInfrastructure(ctx: AppContext, id: string, raw: unknown) {
  ctx.require('labs.manage')
  const lab = await getLab(ctx, id)
  const answers = infrastructureSchema.parse(raw)
  const template = templateOf(lab)
  // Numeric checks pass on the number, not the tick box.
  if (template) {
    for (const check of template.infrastructure) {
      const a = answers[check.code]
      if (a && check.min !== undefined) a.ok = (a.value ?? 0) >= check.min
    }
  }
  await ctx.db.lab.update({ where: { id }, data: { infrastructure: answers } })
  await auditLab(ctx, 'labs.infrastructure', 'Lab', id, `Updated the infrastructure checklist for ${lab.name}`)
}

export function infraAnswers(lab: { infrastructure: Prisma.JsonValue }): InfraAnswers {
  const value = lab.infrastructure
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as InfraAnswers) : {}
}

export function emergencyContacts(lab: { emergencyContacts: Prisma.JsonValue }): { label: string; phone: string }[] {
  const value = lab.emergencyContacts
  return Array.isArray(value) ? (value as { label: string; phone: string }[]) : []
}

/** Latest inspection date per type for each lab. */
async function lastInspections(ctx: Pick<AppContext, 'db'>, labIds: string[]) {
  const rows = await ctx.db.labInspection.groupBy({
    by: ['labId', 'type'],
    where: { labId: { in: labIds } },
    _max: { inspectedOn: true },
  })
  const map = new Map<string, Partial<Record<InspectionTypeValue, Date>>>()
  for (const r of rows) {
    const entry = map.get(r.labId) ?? {}
    if (r._max.inspectedOn) entry[r.type] = r._max.inspectedOn
    map.set(r.labId, entry)
  }
  return map
}

export async function readinessFor(
  ctx: AppContext,
  labs: LabRow[],
): Promise<Map<string, Readiness | null>> {
  const ids = labs.map((l) => l.id)
  const [items, inspections, incidents] = await Promise.all([
    ctx.db.labItem.findMany({
      where: { labId: { in: ids }, deletedAt: null },
      select: { labId: true, templateCode: true, name: true, kind: true, quantity: true, requiredQty: true, expiresOn: true },
    }),
    lastInspections(ctx, ids),
    ctx.db.labIncident.groupBy({
      by: ['labId'],
      where: { labId: { in: ids }, status: 'OPEN', severity: 'SERIOUS' },
      _count: { _all: true },
    }),
  ])
  const today = dateOnly(schoolToday())
  const out = new Map<string, Readiness | null>()
  for (const lab of labs) {
    const template = templateOf(lab)
    if (!template) {
      out.set(lab.id, null)
      continue
    }
    out.set(
      lab.id,
      computeReadiness({
        template,
        infrastructure: infraAnswers(lab),
        items: items.filter((i) => i.labId === lab.id),
        lastInspection: inspections.get(lab.id) ?? {},
        openSeriousIncidents: incidents.find((i) => i.labId === lab.id)?._count._all ?? 0,
        today,
      }),
    )
  }
  return out
}

export type LabAlert = {
  tone: 'danger' | 'warning' | 'info'
  kind: 'expired' | 'expiring' | 'low-stock' | 'inspection-due' | 'incident'
  labId: string
  text: string
  href: string
}

/** Everything that needs someone's attention, across the given labs. */
export async function labAlerts(ctx: Pick<AppContext, 'db'>, labs: LabRow[]): Promise<LabAlert[]> {
  const ids = labs.map((l) => l.id)
  if (ids.length === 0) return []
  const today = dateOnly(schoolToday())
  const soon = new Date(today.getTime() + 30 * DAY)
  const [items, inspections, incidents] = await Promise.all([
    ctx.db.labItem.findMany({
      where: { labId: { in: ids }, deletedAt: null, isActive: true },
      select: { id: true, labId: true, name: true, unit: true, quantity: true, reorderLevel: true, expiresOn: true, kind: true },
    }),
    lastInspections(ctx, ids),
    ctx.db.labIncident.findMany({
      where: { labId: { in: ids }, status: 'OPEN' },
      select: { id: true, labId: true, type: true, severity: true, occurredAt: true },
      orderBy: { occurredAt: 'desc' },
    }),
  ])

  const alerts: LabAlert[] = []
  const labName = new Map(labs.map((l) => [l.id, l.name]))
  const multi = labs.length > 1
  const prefix = (labId: string) => (multi ? `${labName.get(labId)}: ` : '')

  for (const inc of incidents) {
    alerts.push({
      tone: inc.severity === 'SERIOUS' ? 'danger' : 'warning',
      kind: 'incident',
      labId: inc.labId,
      text: `${prefix(inc.labId)}open ${inc.severity.toLowerCase()} incident (${inc.type.toLowerCase().replace(/_/g, ' ')})`,
      href: `/labs/${inc.labId}/safety#incidents`,
    })
  }
  for (const item of items) {
    if (item.expiresOn && item.expiresOn < today) {
      alerts.push({ tone: 'danger', kind: 'expired', labId: item.labId, text: `${prefix(item.labId)}${item.name} expired on ${item.expiresOn.toISOString().slice(0, 10)}`, href: `/labs/${item.labId}/register?filter=expiry` })
    } else if (item.expiresOn && item.expiresOn <= soon) {
      alerts.push({ tone: 'warning', kind: 'expiring', labId: item.labId, text: `${prefix(item.labId)}${item.name} expires on ${item.expiresOn.toISOString().slice(0, 10)}`, href: `/labs/${item.labId}/register?filter=expiry` })
    }
    if (item.reorderLevel > 0 && item.quantity <= item.reorderLevel) {
      alerts.push({ tone: 'warning', kind: 'low-stock', labId: item.labId, text: `${prefix(item.labId)}${item.name} is low: ${item.quantity} ${item.unit} left`, href: `/labs/${item.labId}/register?filter=low` })
    }
  }
  for (const lab of labs) {
    const template = templateOf(lab)
    if (!template) continue
    const last = inspections.get(lab.id) ?? {}
    for (const spec of template.inspections) {
      if (spec.type === 'DAILY') continue
      const at = last[spec.type]
      const due = at ? new Date(at.getTime() + spec.everyDays * DAY) : null
      if (!due || due <= today) {
        alerts.push({
          tone: due && today.getTime() - due.getTime() < 7 * DAY ? 'info' : 'warning',
          kind: 'inspection-due',
          labId: lab.id,
          text: `${prefix(lab.id)}${spec.label} ${due ? `due since ${due.toISOString().slice(0, 10)}` : 'never recorded'}`,
          href: `/labs/${lab.id}/safety#inspections`,
        })
      }
    }
  }
  const order = { danger: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => order[a.tone] - order[b.tone])
}
