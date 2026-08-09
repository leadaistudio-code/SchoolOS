import { z } from 'zod'
import { differenceInCalendarDays } from 'date-fns'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'
import { attendanceDate, attendancePercent, toDateInput } from '@/lib/dates'
import { evaluateGeofence, formatDistance } from '@/lib/geo'

export const checkInSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracyM: z.coerce.number().min(0).max(100_000).optional(),
  /** Reported by the client when the platform can detect a mock provider. */
  mockLocation: z.boolean().default(false),
  deviceInfo: z.string().trim().max(200).optional(),
})

export const manualMarkSchema = z.object({
  staffId: z.string().min(1),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE', 'HOLIDAY']),
  reason: z.string().trim().min(3, 'Give a reason for the correction').max(300),
})

export type GeofenceStatus = {
  configured: boolean
  schoolName: string
  radiusM: number
  school: { latitude: number; longitude: number } | null
  today: {
    onDate: string
    status: string | null
    checkInAt: Date | null
    checkOutAt: Date | null
    distanceM: number | null
  }
}

/**
 * What the "My attendance" screen needs before the browser asks for location:
 * whether a geofence is configured at all, and whether today is already marked.
 */
export async function geofenceStatus(ctx: AppContext): Promise<GeofenceStatus> {
  const school = await ctx.db.school.findFirst({
    select: { name: true, latitude: true, longitude: true, geofenceRadiusM: true },
  })

  const staff = await requireStaffRecord(ctx)
  const onDate = attendanceDate(new Date())

  const today = await ctx.db.staffAttendance.findFirst({
    where: { staffId: staff.id, onDate },
    select: { status: true, checkInAt: true, checkOutAt: true, distanceM: true },
  })

  const configured =
    school?.latitude !== null && school?.latitude !== undefined &&
    school?.longitude !== null && school?.longitude !== undefined

  return {
    configured,
    schoolName: school?.name ?? ctx.tenant.name,
    radiusM: school?.geofenceRadiusM ?? 150,
    school: configured ? { latitude: school!.latitude!, longitude: school!.longitude! } : null,
    today: {
      onDate: toDateInput(onDate),
      status: today?.status ?? null,
      checkInAt: today?.checkInAt ?? null,
      checkOutAt: today?.checkOutAt ?? null,
      distanceM: today?.distanceM ?? null,
    },
  }
}

async function requireStaffRecord(ctx: AppContext) {
  const staff = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!staff) {
    throw new ApiException(
      409,
      'NO_STAFF_RECORD',
      'Your login is not linked to a staff record, so attendance cannot be marked. Contact your administrator.',
    )
  }
  return staff
}

/** Late after this hour, school local time. */
const LATE_AFTER_HOUR = 9

export type CheckInResult = {
  ok: boolean
  status?: string
  distanceM: number
  message: string
}

/**
 * Geofenced check-in.
 *
 * The client sends where it believes it is; the SERVER decides whether that is
 * inside the fence, using coordinates and a radius held in the database. A
 * client that simply posts `inside: true` achieves nothing, because no such
 * field is read.
 *
 * A reported mock-location provider is recorded and refused. This is not
 * tamper-proof — GPS from a user-controlled device never is — so the evidence
 * (coordinates, accuracy, computed distance, device) is stored with every row
 * for a human to review.
 */
export async function checkIn(
  ctx: AppContext,
  input: z.infer<typeof checkInSchema>,
): Promise<CheckInResult> {
  ctx.require('staff_attendance.mark')

  const staff = await requireStaffRecord(ctx)
  const school = await ctx.db.school.findFirst({
    select: { latitude: true, longitude: true, geofenceRadiusM: true },
  })

  if (!school?.latitude || !school?.longitude) {
    throw new ApiException(
      409,
      'GEOFENCE_NOT_CONFIGURED',
      'The school location has not been set. An administrator must configure it in Settings.',
    )
  }

  const onDate = attendanceDate(new Date())
  const existing = await ctx.db.staffAttendance.findFirst({
    where: { staffId: staff.id, onDate },
  })
  if (existing?.checkInAt) {
    throw conflict(
      `You already checked in today at ${existing.checkInAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
    )
  }

  const verdict = evaluateGeofence({
    school: { latitude: school.latitude, longitude: school.longitude },
    reported: { latitude: input.latitude, longitude: input.longitude },
    radiusM: school.geofenceRadiusM,
    accuracyM: input.accuracyM,
  })

  if (input.mockLocation) {
    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${staff.firstName} ${staff.lastName}`,
      action: 'staff_attendance.mock_location_blocked',
      module: 'staff_attendance',
      entityType: 'Staff',
      entityId: staff.id,
      summary: `Check-in refused: device reported a mock location provider (${formatDistance(verdict.distanceM)} from school)`,
    })
    return {
      ok: false,
      distanceM: verdict.distanceM,
      message:
        'Your device is reporting a simulated location. Turn off mock location and try again.',
    }
  }

  if (!verdict.inside) {
    return { ok: false, distanceM: verdict.distanceM, message: verdict.reason! }
  }

  const now = new Date()
  const status = now.getHours() >= LATE_AFTER_HOUR ? 'LATE' : 'PRESENT'

  await ctx.db.staffAttendance.upsert({
    where: {
      tenantId_staffId_onDate: { tenantId: ctx.tenant.id, staffId: staff.id, onDate },
    },
    create: {
      tenantId: ctx.tenant.id,
      staffId: staff.id,
      onDate,
      status,
      source: 'GEOFENCE',
      checkInAt: now,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyM: input.accuracyM ?? null,
      distanceM: verdict.distanceM,
      insideGeofence: true,
      deviceInfo: input.deviceInfo ?? null,
      mockLocationFlag: false,
    },
    update: {
      status,
      source: 'GEOFENCE',
      checkInAt: now,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyM: input.accuracyM ?? null,
      distanceM: verdict.distanceM,
      insideGeofence: true,
      deviceInfo: input.deviceInfo ?? null,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${staff.firstName} ${staff.lastName}`,
    action: 'staff_attendance.check_in',
    module: 'staff_attendance',
    entityType: 'Staff',
    entityId: staff.id,
    summary: `Checked in ${formatDistance(verdict.distanceM)} from school (${status.toLowerCase()})`,
  })

  return {
    ok: true,
    status,
    distanceM: verdict.distanceM,
    message:
      status === 'LATE'
        ? 'Attendance marked. Recorded as late arrival.'
        : 'Attendance marked. Have a good day.',
  }
}

export async function checkOut(ctx: AppContext): Promise<CheckInResult> {
  ctx.require('staff_attendance.mark')
  const staff = await requireStaffRecord(ctx)
  const onDate = attendanceDate(new Date())

  const existing = await ctx.db.staffAttendance.findFirst({
    where: { staffId: staff.id, onDate },
  })
  if (!existing?.checkInAt) throw conflict('You have not checked in today')
  if (existing.checkOutAt) throw conflict('You have already checked out today')

  const now = new Date()
  await ctx.db.staffAttendance.update({
    where: { id: existing.id },
    data: { checkOutAt: now },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${staff.firstName} ${staff.lastName}`,
    action: 'staff_attendance.check_out',
    module: 'staff_attendance',
    entityType: 'Staff',
    entityId: staff.id,
    summary: 'Checked out',
  })

  return { ok: true, distanceM: existing.distanceM ?? 0, message: 'Checked out. See you tomorrow.' }
}

/**
 * Administrative correction. The original geofence evidence is preserved; the
 * override is stamped with who did it and why, and audited with before/after.
 */
export async function overrideAttendance(
  ctx: AppContext,
  input: z.infer<typeof manualMarkSchema>,
) {
  ctx.require('staff_attendance.manage')

  const onDate = attendanceDate(input.onDate)
  if (differenceInCalendarDays(onDate, attendanceDate(new Date())) > 0) {
    throw new ApiException(400, 'BAD_REQUEST', 'Attendance cannot be set for a future date')
  }

  const staff = await ctx.db.staff.findFirst({
    where: { id: input.staffId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!staff) throw notFound('Staff member')

  const before = await ctx.db.staffAttendance.findFirst({
    where: { staffId: staff.id, onDate },
  })

  const updated = await ctx.db.staffAttendance.upsert({
    where: {
      tenantId_staffId_onDate: { tenantId: ctx.tenant.id, staffId: staff.id, onDate },
    },
    create: {
      tenantId: ctx.tenant.id,
      staffId: staff.id,
      onDate,
      status: input.status,
      source: 'MANUAL',
      overriddenById: ctx.user.userId,
      overrideReason: input.reason,
    },
    update: {
      status: input.status,
      overriddenById: ctx.user.userId,
      overrideReason: input.reason,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'staff_attendance.override',
    module: 'staff_attendance',
    entityType: 'Staff',
    entityId: staff.id,
    summary: `Set ${staff.firstName} ${staff.lastName} to ${input.status} on ${input.onDate}: ${input.reason}`,
    before,
    after: updated,
  })

  return updated
}

export type StaffDayRow = {
  staffId: string
  employeeCode: string
  name: string
  designation: string | null
  status: string | null
  checkInAt: Date | null
  checkOutAt: Date | null
  source: string | null
  distanceM: number | null
  overridden: boolean
}

/** The whole staff roll for one day, including who has not marked yet. */
export async function staffDayRegister(
  ctx: AppContext,
  dateInput: string,
): Promise<StaffDayRow[]> {
  ctx.require('staff_attendance.view')
  const onDate = attendanceDate(dateInput)

  const [staff, records] = await Promise.all([
    ctx.db.staff.findMany({
      where: { deletedAt: null, leftOn: null },
      orderBy: [{ staffType: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        designation: true,
      },
    }),
    ctx.db.staffAttendance.findMany({ where: { onDate } }),
  ])

  const byStaff = new Map(records.map((r) => [r.staffId, r]))

  return staff.map((s) => {
    const r = byStaff.get(s.id)
    return {
      staffId: s.id,
      employeeCode: s.employeeCode,
      name: `${s.firstName} ${s.lastName}`,
      designation: s.designation,
      status: r?.status ?? null,
      checkInAt: r?.checkInAt ?? null,
      checkOutAt: r?.checkOutAt ?? null,
      source: r?.source ?? null,
      distanceM: r?.distanceM ?? null,
      overridden: !!r?.overriddenById,
    }
  })
}

/** Per-staff attendance percentage over a range. */
export async function staffAttendanceSummary(
  ctx: AppContext,
  from: string,
  to: string,
) {
  ctx.require('staff_attendance.view')

  const grouped = await ctx.db.staffAttendance.groupBy({
    by: ['staffId', 'status'],
    where: { onDate: { gte: attendanceDate(from), lte: attendanceDate(to) } },
    _count: { _all: true },
  })

  const byStaff = new Map<string, Record<string, number>>()
  for (const g of grouped) {
    const bucket = byStaff.get(g.staffId) ?? {}
    bucket[g.status] = g._count._all
    byStaff.set(g.staffId, bucket)
  }
  if (byStaff.size === 0) return []

  const staff = await ctx.db.staff.findMany({
    where: { id: { in: [...byStaff.keys()] } },
    select: { id: true, employeeCode: true, firstName: true, lastName: true, designation: true },
  })

  return staff
    .map((s) => {
      const counts = byStaff.get(s.id) ?? {}
      return {
        staffId: s.id,
        employeeCode: s.employeeCode,
        name: `${s.firstName} ${s.lastName}`,
        designation: s.designation,
        present: counts.PRESENT ?? 0,
        absent: counts.ABSENT ?? 0,
        late: counts.LATE ?? 0,
        leave: counts.LEAVE ?? 0,
        percent: attendancePercent(counts),
      }
    })
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101))
}
