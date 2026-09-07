import type { AttendanceStatus, BiometricEventDirection } from '@prisma/client'
import { prisma } from '@/server/db/prisma'
import { tenantDb } from '@/server/db/tenant-client'
import { attendanceDate, toDateInput } from '@/lib/dates'
import { loadBiometricSettings } from './settings'

function minutesFromMidnight(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

function formatTime(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

async function notifyParents(
  tenantId: string,
  studentId: string,
  title: string,
  body: string,
  eventKey: string,
) {
  const guardians = await prisma.studentGuardian.findMany({
    where: { tenantId, studentId },
    select: { parent: { select: { userId: true } } },
  })
  const userIds = [
    ...new Set(guardians.map((g) => g.parent.userId).filter((id): id is string => Boolean(id))),
  ]
  if (userIds.length === 0) return

  await prisma.$transaction(
    userIds.map((userId) =>
      prisma.notification.create({
        data: {
          tenantId,
          userId,
          eventKey,
          title,
          body,
          linkUrl: '/attendance',
        },
      }),
    ),
  )
}

/**
 * Apply one raw biometric event to existing StudentAttendance / StaffAttendance.
 * Raw events stay immutable; this only updates attendance + event status.
 */
export async function processRawEvent(tenantId: string, eventId: string): Promise<void> {
  const db = tenantDb(tenantId)
  const settings = await loadBiometricSettings(tenantId)

  if (!settings.enabled) {
    await db.deviceRawEvent.update({
      where: { id: eventId },
      data: { status: 'SKIPPED', processError: 'Biometric attendance disabled', processedAt: new Date() },
    })
    return
  }

  const event = await db.deviceRawEvent.findFirst({
    where: { id: eventId },
    include: {
      device: { select: { id: true, purpose: true, name: true } },
    },
  })
  if (!event) return
  if (event.status === 'PROCESSED' || event.status === 'SKIPPED') return

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId },
    select: { timezone: true },
  })
  const timeZone = tenant?.timezone || 'Asia/Kolkata'

  const mapping = await db.deviceUserMapping.findFirst({
    where: {
      externalUserId: event.externalUserId,
      active: true,
    },
    select: {
      id: true,
      subjectType: true,
      studentId: true,
      staffId: true,
    },
  })

  if (!mapping) {
    await db.deviceRawEvent.update({
      where: { id: eventId },
      data: { status: 'UNMAPPED', processedAt: new Date(), processError: null },
    })
    return
  }

  await db.deviceUserMapping.update({
    where: { id: mapping.id },
    data: { lastPunchAt: event.deviceLocalAt },
  })

  // Duplicate-punch window for attendance interpretation (raw row already stored).
  if (settings.duplicatePunchWindowSec > 0) {
    const windowStart = new Date(
      event.deviceLocalAt.getTime() - settings.duplicatePunchWindowSec * 1000,
    )
    const prior = await db.deviceRawEvent.findFirst({
      where: {
        id: { not: event.id },
        externalUserId: event.externalUserId,
        deviceLocalAt: { gte: windowStart, lte: event.deviceLocalAt },
        status: { in: ['PROCESSED', 'PENDING', 'CONFLICT'] },
      },
      select: { id: true },
    })
    if (prior) {
      await db.deviceRawEvent.update({
        where: { id: eventId },
        data: {
          status: 'SKIPPED',
          mappingId: mapping.id,
          studentId: mapping.studentId,
          staffId: mapping.staffId,
          processError: 'Within duplicate punch window',
          processedAt: new Date(),
        },
      })
      return
    }
  }

  try {
    if (mapping.subjectType === 'STUDENT' && mapping.studentId) {
      if (!settings.studentAttendance || event.device.purpose === 'STAFF') {
        await db.deviceRawEvent.update({
          where: { id: eventId },
          data: {
            status: 'SKIPPED',
            mappingId: mapping.id,
            studentId: mapping.studentId,
            processError: 'Student biometric attendance not enabled for this device/settings',
            processedAt: new Date(),
          },
        })
        return
      }
      await applyStudentPunch({
        tenantId,
        eventId: event.id,
        studentId: mapping.studentId,
        mappingId: mapping.id,
        deviceLocalAt: event.deviceLocalAt,
        direction: event.direction,
        settings,
        timeZone,
        deviceName: event.device.name,
      })
      return
    }

    if (mapping.subjectType === 'STAFF' && mapping.staffId) {
      if (!settings.staffAttendance || event.device.purpose === 'STUDENT') {
        await db.deviceRawEvent.update({
          where: { id: eventId },
          data: {
            status: 'SKIPPED',
            mappingId: mapping.id,
            staffId: mapping.staffId,
            processError: 'Staff biometric attendance not enabled for this device/settings',
            processedAt: new Date(),
          },
        })
        return
      }
      await applyStaffPunch({
        tenantId,
        eventId: event.id,
        staffId: mapping.staffId,
        mappingId: mapping.id,
        deviceLocalAt: event.deviceLocalAt,
        direction: event.direction,
        timeZone,
      })
      return
    }

    await db.deviceRawEvent.update({
      where: { id: eventId },
      data: {
        status: 'FAILED',
        mappingId: mapping.id,
        processError: 'Mapping is missing studentId/staffId',
        processedAt: new Date(),
      },
    })
  } catch (err) {
    await db.deviceRawEvent.update({
      where: { id: eventId },
      data: {
        status: 'FAILED',
        mappingId: mapping.id,
        processError: err instanceof Error ? err.message.slice(0, 500) : 'Processing failed',
        processedAt: new Date(),
      },
    })
  }
}

async function applyStudentPunch(input: {
  tenantId: string
  eventId: string
  studentId: string
  mappingId: string
  deviceLocalAt: Date
  direction: BiometricEventDirection
  settings: Awaited<ReturnType<typeof loadBiometricSettings>>
  timeZone: string
  deviceName: string
}) {
  const db = tenantDb(input.tenantId)
  const onDate = attendanceDate(input.deviceLocalAt)

  const enrollment = await db.enrollment.findFirst({
    where: { studentId: input.studentId, isCurrent: true },
    select: { sectionId: true, sessionId: true },
  })
  if (!enrollment) {
    await db.deviceRawEvent.update({
      where: { id: input.eventId },
      data: {
        status: 'FAILED',
        mappingId: input.mappingId,
        studentId: input.studentId,
        processError: 'Student has no current enrollment',
        processedAt: new Date(),
      },
    })
    return
  }

  const existing = await db.studentAttendance.findFirst({
    where: { studentId: input.studentId, onDate },
  })

  if (
    existing &&
    existing.source === 'MANUAL' &&
    existing.status === 'ABSENT' &&
    input.settings.requireManualConflictReview
  ) {
    await db.deviceRawEvent.update({
      where: { id: input.eventId },
      data: {
        status: 'CONFLICT',
        mappingId: input.mappingId,
        studentId: input.studentId,
        processError: 'Manual ABSENT conflicts with biometric punch',
        processedAt: new Date(),
      },
    })
    return
  }

  if (existing && (existing.status === 'LEAVE' || existing.status === 'HOLIDAY')) {
    await db.deviceRawEvent.update({
      where: { id: input.eventId },
      data: {
        status: 'SKIPPED',
        mappingId: input.mappingId,
        studentId: input.studentId,
        processError: `Day already marked ${existing.status}`,
        processedAt: new Date(),
      },
    })
    return
  }

  const mins = minutesFromMidnight(input.deviceLocalAt, input.timeZone)
  const lateThreshold = input.settings.studentLateAfterMinutes
  const isLate = mins > lateThreshold
  const status: AttendanceStatus = isLate ? 'LATE' : 'PRESENT'
  const minutesLate = isLate ? mins - lateThreshold : null

  const firstPunchAt =
    existing?.firstPunchAt && existing.firstPunchAt < input.deviceLocalAt
      ? existing.firstPunchAt
      : input.deviceLocalAt
  const lastPunchAt =
    existing?.lastPunchAt && existing.lastPunchAt > input.deviceLocalAt
      ? existing.lastPunchAt
      : input.deviceLocalAt

  // First punch of the day sets status; later punches only extend lastPunchAt.
  const statusToWrite =
    existing?.firstPunchAt && existing.firstPunchAt < input.deviceLocalAt
      ? existing.status
      : status
  const minutesLateToWrite =
    existing?.firstPunchAt && existing.firstPunchAt < input.deviceLocalAt
      ? existing.minutesLate
      : minutesLate

  const row = await db.studentAttendance.upsert({
    where: {
      tenantId_studentId_onDate: {
        tenantId: input.tenantId,
        studentId: input.studentId,
        onDate,
      },
    },
    create: {
      tenantId: input.tenantId,
      studentId: input.studentId,
      sectionId: enrollment.sectionId,
      sessionId: enrollment.sessionId,
      onDate,
      status: statusToWrite,
      minutesLate: minutesLateToWrite,
      source: 'BIOMETRIC',
      firstPunchAt,
      lastPunchAt,
      remarks: `Biometric via ${input.deviceName}`,
    },
    update: {
      sectionId: enrollment.sectionId,
      sessionId: enrollment.sessionId,
      status: statusToWrite,
      minutesLate: minutesLateToWrite,
      source: 'BIOMETRIC',
      firstPunchAt,
      lastPunchAt,
    },
  })

  const isFirst =
    !existing?.firstPunchAt || existing.firstPunchAt.getTime() === input.deviceLocalAt.getTime()
  const looksLikeExit =
    input.direction === 'OUT' ||
    (!isFirst && input.direction === 'UNKNOWN' && Boolean(existing?.firstPunchAt))

  let notifiedAt: Date | null = null
  const student = await db.student.findFirst({
    where: { id: input.studentId },
    select: { firstName: true, lastName: true },
  })
  const name = student ? `${student.firstName}` : 'Student'
  const timeLabel = formatTime(input.deviceLocalAt, input.timeZone)

  if (isFirst && input.settings.notifyParentOnEntry) {
    await notifyParents(
      input.tenantId,
      input.studentId,
      `${name} checked in`,
      `${name} checked in at school at ${timeLabel}.`,
      'attendance.biometric_entry',
    )
    notifiedAt = new Date()
  } else if (looksLikeExit && input.settings.notifyParentOnExit) {
    await notifyParents(
      input.tenantId,
      input.studentId,
      `${name} checked out`,
      `${name} checked out at ${timeLabel}.`,
      'attendance.biometric_exit',
    )
    notifiedAt = new Date()
  }

  await db.deviceRawEvent.update({
    where: { id: input.eventId },
    data: {
      status: 'PROCESSED',
      mappingId: input.mappingId,
      studentId: input.studentId,
      studentAttendanceId: row.id,
      processedAt: new Date(),
      processError: null,
      ...(notifiedAt ? { notifiedAt } : {}),
    },
  })
}

async function applyStaffPunch(input: {
  tenantId: string
  eventId: string
  staffId: string
  mappingId: string
  deviceLocalAt: Date
  direction: BiometricEventDirection
  timeZone: string
}) {
  const db = tenantDb(input.tenantId)
  const onDate = attendanceDate(input.deviceLocalAt)
  const existing = await db.staffAttendance.findFirst({
    where: { staffId: input.staffId, onDate },
  })

  const mins = minutesFromMidnight(input.deviceLocalAt, input.timeZone)
  const lateAfter = 9 * 60
  const isLate = mins >= lateAfter
  const status: AttendanceStatus = isLate ? 'LATE' : 'PRESENT'

  const isCheckOut =
    input.direction === 'OUT' ||
    (input.direction === 'UNKNOWN' && Boolean(existing?.checkInAt) && !existing?.checkOutAt)

  let row
  if (!existing) {
    row = await db.staffAttendance.create({
      data: {
        tenantId: input.tenantId,
        staffId: input.staffId,
        onDate,
        status,
        checkInAt: input.deviceLocalAt,
        source: 'BIOMETRIC',
        deviceInfo: 'MyCampusView Connect',
      },
    })
  } else if (isCheckOut) {
    row = await db.staffAttendance.update({
      where: { id: existing.id },
      data: {
        checkOutAt: existing.checkOutAt ?? input.deviceLocalAt,
        source: existing.source === 'MANUAL' ? existing.source : 'BIOMETRIC',
      },
    })
  } else {
    // Additional in-punch: keep earliest check-in, refresh status only if still first-ish
    const checkInAt =
      existing.checkInAt && existing.checkInAt < input.deviceLocalAt
        ? existing.checkInAt
        : input.deviceLocalAt
    row = await db.staffAttendance.update({
      where: { id: existing.id },
      data: {
        checkInAt,
        status:
          existing.status === 'LEAVE' || existing.status === 'HOLIDAY' || existing.status === 'ABSENT'
            ? existing.status
            : existing.checkInAt
              ? existing.status
              : status,
        source: existing.source === 'GEOFENCE' ? existing.source : 'BIOMETRIC',
      },
    })
  }

  await db.deviceRawEvent.update({
    where: { id: input.eventId },
    data: {
      status: 'PROCESSED',
      mappingId: input.mappingId,
      staffId: input.staffId,
      staffAttendanceId: row.id,
      processedAt: new Date(),
      processError: null,
    },
  })
}

export async function reprocessUnmappedForExternalUser(tenantId: string, externalUserId: string) {
  const db = tenantDb(tenantId)
  const pending = await db.deviceRawEvent.findMany({
    where: {
      externalUserId,
      status: { in: ['UNMAPPED', 'FAILED', 'PENDING'] },
    },
    orderBy: { deviceLocalAt: 'asc' },
    select: { id: true },
    take: 500,
  })
  for (const row of pending) {
    await processRawEvent(tenantId, row.id)
  }
  return { reprocessed: pending.length }
}

export async function reprocessEvent(tenantId: string, eventId: string) {
  const db = tenantDb(tenantId)
  await db.deviceRawEvent.updateMany({
    where: { id: eventId, status: { not: 'PROCESSED' } },
    data: { status: 'PENDING', processError: null, processedAt: null },
  })
  await processRawEvent(tenantId, eventId)
}

// keep helper import used
void toDateInput
