import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound, badRequest } from '@/server/api/response'
import { mappingSchema } from './schema'
import { reprocessUnmappedForExternalUser } from './process-attendance'

export async function listMappings(
  ctx: AppContext,
  query: { q?: string; status?: 'mapped' | 'unmapped' | 'all'; page?: number; pageSize?: number },
) {
  ctx.require('biometric.view')
  const page = query.page ?? 1
  const pageSize = Math.min(query.pageSize ?? 50, 200)

  // Unmapped = distinct external ids from events with no mapping
  if (query.status === 'unmapped') {
    const mappedIds = await ctx.db.deviceUserMapping.findMany({
      select: { externalUserId: true },
    })
    const mappedSet = new Set(mappedIds.map((m) => m.externalUserId))
    const events = await ctx.db.deviceRawEvent.groupBy({
      by: ['externalUserId'],
      _max: { deviceLocalAt: true },
      _count: { _all: true },
      orderBy: { _max: { deviceLocalAt: 'desc' } },
      take: 500,
    })

    const filtered = events
      .filter((e) => !mappedSet.has(e.externalUserId))
      .filter((e) =>
        query.q ? e.externalUserId.toLowerCase().includes(query.q.toLowerCase()) : true,
      )

    const slice = filtered.slice((page - 1) * pageSize, page * pageSize)
    return {
      rows: slice.map((e) => ({
        externalUserId: e.externalUserId,
        displayName: null as string | null,
        subjectType: null,
        studentId: null,
        staffId: null,
        active: false,
        lastPunchAt: e._max.deviceLocalAt,
        eventCount: e._count._all,
        mappingStatus: 'Unmapped' as const,
      })),
      total: filtered.length,
      page,
      pageSize,
    }
  }

  const where = {
    ...(query.q
      ? {
          OR: [
            { externalUserId: { contains: query.q, mode: 'insensitive' as const } },
            { displayName: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    ctx.db.deviceUserMapping.count({ where }),
    ctx.db.deviceUserMapping.findMany({
      where,
      orderBy: [{ lastPunchAt: 'desc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const studentIds = rows.map((r) => r.studentId).filter(Boolean) as string[]
  const staffIds = rows.map((r) => r.staffId).filter(Boolean) as string[]
  const [students, staff] = await Promise.all([
    studentIds.length
      ? ctx.db.student.findMany({
          where: { id: { in: studentIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
            enrollments: {
              where: { isCurrent: true },
              take: 1,
              select: {
                classLevel: { select: { name: true } },
                section: { select: { name: true } },
              },
            },
          },
        })
      : [],
    staffIds.length
      ? ctx.db.staff.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, firstName: true, lastName: true, employeeCode: true, department: true },
        })
      : [],
  ])
  const studentById = new Map(students.map((s) => [s.id, s]))
  const staffById = new Map(staff.map((s) => [s.id, s]))

  return {
    rows: rows.map((r) => {
      const student = r.studentId ? studentById.get(r.studentId) : null
      const staffRow = r.staffId ? staffById.get(r.staffId) : null
      const enr = student?.enrollments[0]
      return {
        id: r.id,
        externalUserId: r.externalUserId,
        displayName: r.displayName,
        subjectType: r.subjectType,
        studentId: r.studentId,
        staffId: r.staffId,
        active: r.active,
        lastPunchAt: r.lastPunchAt,
        mappedName: student
          ? `${student.firstName} ${student.lastName}`
          : staffRow
            ? `${staffRow.firstName} ${staffRow.lastName}`
            : null,
        detail: student
          ? `${student.admissionNo}${enr ? ` · ${enr.classLevel.name}-${enr.section.name}` : ''}`
          : staffRow
            ? `${staffRow.employeeCode}${staffRow.department ? ` · ${staffRow.department}` : ''}`
            : null,
        mappingStatus: r.active ? ('Mapped' as const) : ('Inactive' as const),
      }
    }),
    total,
    page,
    pageSize,
  }
}

export async function upsertMapping(ctx: AppContext, input: unknown) {
  ctx.require('biometric.mapping')
  const data = mappingSchema.parse(input)

  if (data.subjectType === 'STUDENT' && !data.studentId) {
    throw badRequest('studentId is required for student mappings')
  }
  if (data.subjectType === 'STAFF' && !data.staffId) {
    throw badRequest('staffId is required for staff mappings')
  }

  if (data.studentId) {
    const student = await ctx.db.student.findFirst({
      where: { id: data.studentId, deletedAt: null },
      select: { id: true },
    })
    if (!student) throw notFound('Student not found')
  }
  if (data.staffId) {
    const staff = await ctx.db.staff.findFirst({
      where: { id: data.staffId, deletedAt: null },
      select: { id: true },
    })
    if (!staff) throw notFound('Staff not found')
  }

  const row = await ctx.db.deviceUserMapping.upsert({
    where: {
      tenantId_externalUserId: {
        tenantId: ctx.tenant.id,
        externalUserId: data.externalUserId.trim(),
      },
    },
    create: {
      tenantId: ctx.tenant.id,
      externalUserId: data.externalUserId.trim(),
      displayName: data.displayName ?? null,
      subjectType: data.subjectType,
      studentId: data.subjectType === 'STUDENT' ? data.studentId! : null,
      staffId: data.subjectType === 'STAFF' ? data.staffId! : null,
      deviceId: data.deviceId ?? null,
      connectorId: data.connectorId ?? null,
      active: data.active ?? true,
      createdById: ctx.user.userId,
    },
    update: {
      displayName: data.displayName ?? null,
      subjectType: data.subjectType,
      studentId: data.subjectType === 'STUDENT' ? data.studentId! : null,
      staffId: data.subjectType === 'STAFF' ? data.staffId! : null,
      deviceId: data.deviceId ?? null,
      connectorId: data.connectorId ?? null,
      active: data.active ?? true,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'biometric.mapping.upsert',
    module: 'biometric',
    entityType: 'DeviceUserMapping',
    entityId: row.id,
    summary: `Mapped device user ${row.externalUserId} to ${row.subjectType.toLowerCase()}`,
  })

  const reprocessed = await reprocessUnmappedForExternalUser(ctx.tenant.id, row.externalUserId)
  return { mapping: row, reprocessed: reprocessed.reprocessed }
}

export async function suggestMatches(ctx: AppContext, externalUserId: string) {
  ctx.require('biometric.view')
  const code = externalUserId.trim()
  if (!code) return { students: [], staff: [] }

  const [students, staff] = await Promise.all([
    ctx.db.student.findMany({
      where: {
        deletedAt: null,
        OR: [
          { admissionNo: { equals: code, mode: 'insensitive' } },
          { admissionNo: { contains: code, mode: 'insensitive' } },
        ],
      },
      take: 10,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
      },
    }),
    ctx.db.staff.findMany({
      where: {
        deletedAt: null,
        OR: [
          { employeeCode: { equals: code, mode: 'insensitive' } },
          { employeeCode: { contains: code, mode: 'insensitive' } },
        ],
      },
      take: 10,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
      },
    }),
  ])

  return { students, staff }
}
