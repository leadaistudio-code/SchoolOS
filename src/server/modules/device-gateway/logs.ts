import type { AppContext } from '@/server/context'
import type { DeviceRawEventStatus } from '@prisma/client'
import { reprocessEvent } from './process-attendance'

export async function listRawEvents(
  ctx: AppContext,
  query: {
    from?: string
    to?: string
    deviceId?: string
    status?: DeviceRawEventStatus
    externalUserId?: string
    q?: string
    page?: number
    pageSize?: number
  },
) {
  ctx.require('biometric.view')
  const page = query.page ?? 1
  const pageSize = Math.min(query.pageSize ?? 50, 200)

  const where = {
    ...(query.deviceId ? { deviceId: query.deviceId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.externalUserId ? { externalUserId: query.externalUserId } : {}),
    ...(query.q
      ? {
          OR: [
            { externalUserId: { contains: query.q, mode: 'insensitive' as const } },
            { dedupeKey: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(query.from || query.to
      ? {
          deviceLocalAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    ctx.db.deviceRawEvent.count({ where }),
    ctx.db.deviceRawEvent.findMany({
      where,
      orderBy: { deviceLocalAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        externalUserId: true,
        deviceLocalAt: true,
        receivedAt: true,
        verificationMethod: true,
        direction: true,
        status: true,
        processError: true,
        studentId: true,
        staffId: true,
        processedAt: true,
        device: { select: { id: true, name: true, brand: true, model: true } },
      },
    }),
  ])

  const studentIds = rows.map((r) => r.studentId).filter(Boolean) as string[]
  const staffIds = rows.map((r) => r.staffId).filter(Boolean) as string[]
  const [students, staff] = await Promise.all([
    studentIds.length
      ? ctx.db.student.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, firstName: true, lastName: true, admissionNo: true },
        })
      : [],
    staffIds.length
      ? ctx.db.staff.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        })
      : [],
  ])
  const studentById = new Map(students.map((s) => [s.id, s]))
  const staffById = new Map(staff.map((s) => [s.id, s]))

  return {
    total,
    page,
    pageSize,
    rows: rows.map((r) => {
      const student = r.studentId ? studentById.get(r.studentId) : null
      const staffRow = r.staffId ? staffById.get(r.staffId) : null
      return {
        ...r,
        mappedPerson: student
          ? `${student.firstName} ${student.lastName} (${student.admissionNo})`
          : staffRow
            ? `${staffRow.firstName} ${staffRow.lastName} (${staffRow.employeeCode})`
            : null,
      }
    }),
  }
}

export async function adminReprocessEvent(ctx: AppContext, eventId: string) {
  ctx.require('biometric.manage')
  await reprocessEvent(ctx.tenant.id, eventId)
  return { ok: true as const }
}
