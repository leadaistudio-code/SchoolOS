import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { attendanceDate } from '@/lib/dates'
import { orderByFrom, skipTake, type ListQuery } from '@/lib/query'
import { accessibleStudentIds } from '@/server/scope'
import { notify } from '@/server/notifications'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 07:35')

const optionalDate = z.union([isoDate, z.literal('')]).optional()
const optionalTime = z.union([clockTime, z.literal('')]).optional()

function blankToNull(value: string | undefined | null) {
  return value ? value : null
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const busSchema = z.object({
  code: z.string().trim().min(2, 'Enter a bus code').max(20),
  registrationNo: z.string().trim().min(4, 'Enter the registration number').max(20),
  model: z.string().trim().max(60).optional(),
  capacity: z.coerce.number().int().min(1, 'Capacity must be at least 1').max(120),
  driverId: z.string().trim().optional(),
  attendantName: z.string().trim().max(80).optional(),
  insuranceExpiresOn: optionalDate,
  fitnessExpiresOn: optionalDate,
  pollutionExpiresOn: optionalDate,
  isActive: z.coerce.boolean().default(true),
})

export const routeSchema = z.object({
  name: z.string().trim().min(3, 'Enter a route name').max(80),
  code: z.string().trim().min(2, 'Enter a route code').max(20),
  busId: z.string().trim().optional(),
  distanceKm: z.coerce.number().min(0).max(500).optional(),
  isActive: z.coerce.boolean().default(true),
})

export const stopsSchema = z.object({
  stops: z
    .array(
      z.object({
        id: z.string().trim().optional(),
        name: z.string().trim().min(1, 'Enter a stop name').max(80),
        latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
        longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
        pickupTime: optionalTime,
        dropTime: optionalTime,
        fareMinor: z.coerce.number().int().min(0).nullable().optional(),
      }),
    )
    .min(1, 'A route needs at least one stop')
    .max(60),
})

export const assignmentSchema = z.object({
  studentId: z.string().min(1, 'Choose a student'),
  routeId: z.string().min(1, 'Choose a route'),
  stopId: z.string().min(1, 'Choose a stop'),
  direction: z.enum(['PICKUP', 'DROP', 'BOTH']).default('BOTH'),
})

export const pingSchema = z.object({
  busId: z.string().min(1),
  tripId: z.string().min(1).optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  speedKph: z.coerce.number().min(0).max(200).nullable().optional(),
  headingDeg: z.coerce.number().min(0).max(360).nullable().optional(),
  accuracyM: z.coerce.number().min(0).max(10_000).nullable().optional(),
})

export const boardingSchema = z.object({
  tripId: z.string().min(1),
  studentId: z.string().min(1),
  stopId: z.string().min(1).optional(),
  event: z.enum(['BOARDED', 'DROPPED', 'ABSENT']),
})

export const tripSchema = z.object({
  busId: z.string().min(1, 'Choose a bus'),
  routeId: z.string().min(1, 'Choose a route'),
  direction: z.enum(['PICKUP', 'DROP']).default('PICKUP'),
})

export type BusInput = z.infer<typeof busSchema>
export type RouteInput = z.infer<typeof routeSchema>
export type StopsInput = z.infer<typeof stopsSchema>
export type AssignmentInput = z.infer<typeof assignmentSchema>
export type PingInput = z.infer<typeof pingSchema>
export type BoardingInput = z.infer<typeof boardingSchema>
export type TripInput = z.infer<typeof tripSchema>

// ---------------------------------------------------------------------------
// Tuning constants
//
// Named rather than inlined, because each one is a judgement call a school may
// want to revisit — not a fact.
// ---------------------------------------------------------------------------

/** A ping older than this means the bus is out of coverage, not stationary. */
export const SIGNAL_STALE_MINUTES = 6

const BUS_SORT_FIELDS = ['code', 'registrationNo', 'capacity'] as const
const ROUTE_SORT_FIELDS = ['name', 'code', 'distanceKm'] as const

function actor(ctx: AppContext) {
  return {
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    module: 'transport',
  }
}

// ---------------------------------------------------------------------------
// Buses
// ---------------------------------------------------------------------------

export async function listBuses(ctx: AppContext, query: ListQuery) {
  ctx.require('transport.view')

  const where = {
    deletedAt: null,
    ...(query.q
      ? {
          OR: [
            { code: { contains: query.q, mode: 'insensitive' as const } },
            { registrationNo: { contains: query.q, mode: 'insensitive' as const } },
            { model: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    ctx.db.bus.findMany({
      where,
      orderBy: orderByFrom(query.sort, query.dir, BUS_SORT_FIELDS, { code: 'asc' }),
      ...skipTake(query),
      select: {
        id: true,
        code: true,
        registrationNo: true,
        model: true,
        capacity: true,
        isActive: true,
        attendantName: true,
        insuranceExpiresOn: true,
        fitnessExpiresOn: true,
        pollutionExpiresOn: true,
        driver: {
          select: { id: true, firstName: true, lastName: true, phone: true, photoUrl: true },
        },
        routes: { where: { deletedAt: null }, select: { id: true, name: true, code: true } },
        _count: { select: { assignments: { where: { isActive: true } } } },
      },
    }),
    ctx.db.bus.count({ where }),
  ])

  return { rows, total }
}

export type DocumentAlert = { label: string; date: Date; expired: boolean }

/**
 * Papers that have expired or are about to.
 *
 * A bus with lapsed insurance is not a paperwork problem, it is a bus that
 * must not leave the yard — so this is surfaced on the fleet list itself
 * rather than hidden behind a report nobody opens.
 */
export function documentAlerts(
  bus: {
    insuranceExpiresOn: Date | null
    fitnessExpiresOn: Date | null
    pollutionExpiresOn: Date | null
  },
  withinDays = 30,
): DocumentAlert[] {
  const now = Date.now()
  const horizon = withinDays * 86_400_000

  return (
    [
      ['Insurance', bus.insuranceExpiresOn],
      ['Fitness', bus.fitnessExpiresOn],
      ['Pollution', bus.pollutionExpiresOn],
    ] as const
  )
    .filter(([, date]) => date !== null && date.getTime() - now < horizon)
    .map(([label, date]) => ({ label, date: date!, expired: date!.getTime() < now }))
}

export async function busDetail(ctx: AppContext, busId: string) {
  ctx.require('transport.view')

  const bus = await ctx.db.bus.findFirst({
    where: { id: busId, deletedAt: null },
    include: {
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          photoUrl: true,
          employeeCode: true,
          designation: true,
        },
      },
      routes: {
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        include: {
          stops: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { assignments: { where: { isActive: true } } } },
        },
      },
      maintenance: { orderBy: { onDate: 'desc' }, take: 8 },
      trips: {
        orderBy: [{ onDate: 'desc' }, { startedAt: 'desc' }],
        take: 8,
        include: { route: { select: { name: true } }, _count: { select: { boardings: true } } },
      },
    },
  })
  if (!bus) throw notFound('Bus')

  const [lastLocation, riders] = await Promise.all([
    ctx.db.busLocation.findFirst({ where: { busId }, orderBy: { recordedAt: 'desc' } }),
    ctx.db.transportAssignment.count({ where: { busId, isActive: true } }),
  ])

  return { bus, lastLocation, riders, alerts: documentAlerts(bus) }
}

export async function driverOptions(ctx: AppContext) {
  return ctx.db.staff.findMany({
    where: { deletedAt: null, leftOn: null },
    orderBy: [{ firstName: 'asc' }],
    take: 300,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      designation: true,
      phone: true,
    },
  })
}

export async function saveBus(ctx: AppContext, input: BusInput, busId?: string) {
  ctx.require('transport.manage')

  const registrationNo = input.registrationNo.toUpperCase()
  const clash = await ctx.db.bus.findFirst({
    where: {
      deletedAt: null,
      ...(busId ? { id: { not: busId } } : {}),
      OR: [{ code: input.code }, { registrationNo }],
    },
    select: { code: true },
  })
  if (clash) {
    throw conflict(
      clash.code === input.code
        ? `Bus code ${input.code} is already in use`
        : `Registration ${registrationNo} is already on another bus`,
    )
  }

  const data = {
    tenantId: ctx.tenant.id,
    code: input.code,
    registrationNo,
    model: blankToNull(input.model),
    capacity: input.capacity,
    driverId: blankToNull(input.driverId),
    attendantName: blankToNull(input.attendantName),
    insuranceExpiresOn: input.insuranceExpiresOn ? attendanceDate(input.insuranceExpiresOn) : null,
    fitnessExpiresOn: input.fitnessExpiresOn ? attendanceDate(input.fitnessExpiresOn) : null,
    pollutionExpiresOn: input.pollutionExpiresOn ? attendanceDate(input.pollutionExpiresOn) : null,
    isActive: input.isActive,
  }

  const bus = busId
    ? await ctx.db.bus.update({ where: { id: busId }, data })
    : await ctx.db.bus.create({ data })

  await audit({
    ...actor(ctx),
    action: busId ? 'bus.update' : 'bus.create',
    entityType: 'Bus',
    entityId: bus.id,
    summary: `${busId ? 'Updated' : 'Added'} bus ${bus.code} (${bus.registrationNo})`,
    after: bus,
  })

  return bus
}

export async function retireBus(ctx: AppContext, busId: string) {
  ctx.require('transport.manage')

  const riding = await ctx.db.transportAssignment.count({ where: { busId, isActive: true } })
  if (riding > 0) {
    throw conflict(
      `${riding} student${riding === 1 ? ' is' : 's are'} still assigned to this bus. Move them to another bus first.`,
    )
  }

  const bus = await ctx.db.bus.update({
    where: { id: busId },
    data: { deletedAt: new Date(), isActive: false },
  })

  await audit({
    ...actor(ctx),
    action: 'bus.retire',
    entityType: 'Bus',
    entityId: bus.id,
    summary: `Retired bus ${bus.code}`,
  })

  return bus
}

// ---------------------------------------------------------------------------
// Routes and stops
// ---------------------------------------------------------------------------

export async function listRoutes(ctx: AppContext, query: ListQuery) {
  ctx.require('transport.view')

  const where = {
    deletedAt: null,
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' as const } },
            { code: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    ctx.db.route.findMany({
      where,
      orderBy: orderByFrom(query.sort, query.dir, ROUTE_SORT_FIELDS, { name: 'asc' }),
      ...skipTake(query),
      select: {
        id: true,
        name: true,
        code: true,
        distanceKm: true,
        isActive: true,
        bus: {
          select: {
            id: true,
            code: true,
            registrationNo: true,
            capacity: true,
            driver: { select: { firstName: true, lastName: true, phone: true } },
          },
        },
        stops: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            pickupTime: true,
            dropTime: true,
            latitude: true,
            longitude: true,
          },
        },
        _count: { select: { assignments: { where: { isActive: true } } } },
      },
    }),
    ctx.db.route.count({ where }),
  ])

  return { rows, total }
}

export async function routeDetail(ctx: AppContext, routeId: string) {
  ctx.require('transport.view')

  const route = await ctx.db.route.findFirst({
    where: { id: routeId, deletedAt: null },
    include: {
      bus: {
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              photoUrl: true,
              employeeCode: true,
            },
          },
        },
      },
      stops: {
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { assignments: { where: { isActive: true } } } } },
      },
    },
  })
  if (!route) throw notFound('Route')

  const school = await ctx.db.school.findFirst({
    select: { name: true, latitude: true, longitude: true },
  })

  return { route, school }
}

export async function busOptions(ctx: AppContext) {
  return ctx.db.bus.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, registrationNo: true, capacity: true },
  })
}

export async function routeOptions(ctx: AppContext) {
  return ctx.db.route.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      code: true,
      busId: true,
      stops: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, pickupTime: true, dropTime: true },
      },
    },
  })
}

export async function saveRoute(ctx: AppContext, input: RouteInput, routeId?: string) {
  ctx.require('transport.manage')

  const clash = await ctx.db.route.findFirst({
    where: { deletedAt: null, code: input.code, ...(routeId ? { id: { not: routeId } } : {}) },
    select: { id: true },
  })
  if (clash) throw conflict(`Route code ${input.code} is already in use`)

  const data = {
    tenantId: ctx.tenant.id,
    name: input.name,
    code: input.code,
    busId: blankToNull(input.busId),
    distanceKm: input.distanceKm ?? null,
    isActive: input.isActive,
  }

  const route = routeId
    ? await ctx.db.route.update({ where: { id: routeId }, data })
    : await ctx.db.route.create({ data })

  // The bus on the route is the bus every rider on it travels in. Leaving the
  // assignments pointing at the previous vehicle would show a parent a map of
  // a bus their child is not in.
  if (routeId && data.busId) {
    await ctx.db.transportAssignment.updateMany({
      where: { routeId, isActive: true },
      data: { busId: data.busId },
    })
  }

  await audit({
    ...actor(ctx),
    action: routeId ? 'route.update' : 'route.create',
    entityType: 'Route',
    entityId: route.id,
    summary: `${routeId ? 'Updated' : 'Added'} route ${route.code} — ${route.name}`,
    after: route,
  })

  return route
}

/**
 * Replaces a route's stop list in one transaction.
 *
 * Order is taken from the submitted array, so reordering in the editor needs
 * no separate rank field. A stop dropped from the list is deleted only when
 * nobody boards there — otherwise a careless edit would quietly cut a child
 * loose from their route.
 */
export async function saveStops(ctx: AppContext, routeId: string, input: StopsInput) {
  ctx.require('transport.manage')

  const route = await ctx.db.route.findFirst({
    where: { id: routeId, deletedAt: null },
    include: { stops: { include: { _count: { select: { assignments: true } } } } },
  })
  if (!route) throw notFound('Route')

  const keptIds = new Set(input.stops.map((s) => s.id).filter((id): id is string => !!id))
  const orphaned = route.stops.filter((s) => !keptIds.has(s.id))
  const inUse = orphaned.filter((s) => s._count.assignments > 0)
  if (inUse.length > 0) {
    throw conflict(
      `${inUse.map((s) => s.name).join(', ')} still ${
        inUse.length === 1 ? 'has students assigned' : 'have students assigned'
      } and cannot be removed.`,
    )
  }

  await ctx.db.$transaction(async (tx) => {
    if (orphaned.length > 0) {
      await tx.busStop.deleteMany({ where: { id: { in: orphaned.map((s) => s.id) } } })
    }

    for (const [index, stop] of input.stops.entries()) {
      const data = {
        tenantId: ctx.tenant.id,
        name: stop.name,
        latitude: stop.latitude ?? null,
        longitude: stop.longitude ?? null,
        sortOrder: index + 1,
        pickupTime: blankToNull(stop.pickupTime),
        dropTime: blankToNull(stop.dropTime),
        fareMinor: stop.fareMinor ?? null,
      }
      if (stop.id) {
        await tx.busStop.update({ where: { id: stop.id }, data })
      } else {
        await tx.busStop.create({ data: { ...data, routeId } })
      }
    }
  })

  await audit({
    ...actor(ctx),
    action: 'route.stops.save',
    entityType: 'Route',
    entityId: routeId,
    summary: `Saved ${input.stops.length} stops on route ${route.code}`,
  })

  return { saved: input.stops.length, removed: orphaned.length }
}

// ---------------------------------------------------------------------------
// Student assignments
// ---------------------------------------------------------------------------

export async function listAssignments(ctx: AppContext, query: ListQuery & { routeId?: string }) {
  ctx.require('transport.view')

  // A parent holding transport.view may look at transport, not at every
  // family's stop and boarding time. The row scope decides which.
  const scopedIds = await accessibleStudentIds(ctx)

  const where = {
    isActive: true,
    ...(query.routeId ? { routeId: query.routeId } : {}),
    ...(scopedIds === null ? {} : { studentId: { in: scopedIds } }),
    ...(query.q
      ? {
          student: {
            OR: [
              { firstName: { contains: query.q, mode: 'insensitive' as const } },
              { lastName: { contains: query.q, mode: 'insensitive' as const } },
              { admissionNo: { contains: query.q, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    ctx.db.transportAssignment.findMany({
      where,
      orderBy: [{ route: { name: 'asc' } }, { stop: { sortOrder: 'asc' } }],
      ...skipTake(query),
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
            photoUrl: true,
            enrollments: {
              where: { isCurrent: true },
              take: 1,
              select: {
                classLevel: { select: { name: true } },
                section: { select: { name: true } },
              },
            },
          },
        },
        route: { select: { id: true, name: true, code: true } },
        stop: { select: { id: true, name: true, pickupTime: true, dropTime: true, fareMinor: true } },
        bus: { select: { id: true, code: true, registrationNo: true } },
      },
    }),
    ctx.db.transportAssignment.count({ where }),
  ])

  return { rows, total }
}

export async function assignStudent(ctx: AppContext, input: AssignmentInput) {
  ctx.require('transport.manage')

  const stop = await ctx.db.busStop.findFirst({
    where: { id: input.stopId, routeId: input.routeId },
    include: { route: { select: { id: true, name: true, code: true, busId: true } } },
  })
  if (!stop) throw notFound('Stop on that route')

  const student = await ctx.db.student.findFirst({
    where: { id: input.studentId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  })
  if (!student) throw notFound('Student')

  // Capacity is a safety limit, not a preference: a full bus cannot take
  // another child however much the office would like it to.
  if (stop.route.busId) {
    const bus = await ctx.db.bus.findFirst({
      where: { id: stop.route.busId },
      select: {
        capacity: true,
        code: true,
        _count: { select: { assignments: { where: { isActive: true } } } },
      },
    })
    if (bus && bus._count.assignments >= bus.capacity) {
      throw conflict(`Bus ${bus.code} is at its capacity of ${bus.capacity} riders.`)
    }
  }

  const existing = await ctx.db.transportAssignment.findFirst({
    where: { studentId: input.studentId, routeId: input.routeId, direction: input.direction },
    select: { id: true },
  })

  const data = {
    tenantId: ctx.tenant.id,
    studentId: input.studentId,
    routeId: input.routeId,
    stopId: input.stopId,
    busId: stop.route.busId,
    direction: input.direction,
    isActive: true,
    endedOn: null,
  }

  const assignment = existing
    ? await ctx.db.transportAssignment.update({ where: { id: existing.id }, data })
    : await ctx.db.transportAssignment.create({ data })

  await audit({
    ...actor(ctx),
    action: 'transport.assign',
    entityType: 'TransportAssignment',
    entityId: assignment.id,
    summary: `${student.firstName} ${student.lastName} assigned to ${stop.route.code} at ${stop.name}`,
    after: assignment,
  })

  await notifyGuardians(ctx, student.id, {
    eventKey: 'transport.assigned',
    title: 'Transport assigned',
    body: `${student.firstName} now travels on ${stop.route.name}, boarding at ${stop.name}${
      stop.pickupTime ? ` at ${stop.pickupTime}` : ''
    }.`,
    linkUrl: '/transport/tracking',
  })

  return assignment
}

export async function endAssignment(ctx: AppContext, assignmentId: string) {
  ctx.require('transport.manage')

  const assignment = await ctx.db.transportAssignment.update({
    where: { id: assignmentId },
    data: { isActive: false, endedOn: new Date() },
    include: {
      student: { select: { firstName: true, lastName: true } },
      route: { select: { code: true } },
    },
  })

  await audit({
    ...actor(ctx),
    action: 'transport.unassign',
    entityType: 'TransportAssignment',
    entityId: assignment.id,
    summary: `${assignment.student.firstName} ${assignment.student.lastName} removed from ${assignment.route.code}`,
  })

  return assignment
}

/** Active students with no transport assignment — the pool the picker offers. */
export async function unassignedStudents(ctx: AppContext, search?: string) {
  ctx.require('transport.manage')

  return ctx.db.student.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      transport: { none: { isActive: true } },
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { admissionNo: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ firstName: 'asc' }],
    take: 50,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      enrollments: {
        where: { isCurrent: true },
        take: 1,
        select: { classLevel: { select: { name: true } }, section: { select: { name: true } } },
      },
    },
  })
}

async function notifyGuardians(
  ctx: AppContext,
  studentId: string,
  message: { eventKey: string; title: string; body: string; linkUrl?: string },
) {
  const guardians = await ctx.db.studentGuardian.findMany({
    where: { studentId },
    select: { parent: { select: { userId: true } } },
  })
  const userIds = guardians.map((g) => g.parent.userId).filter((id): id is string => !!id)
  if (userIds.length > 0) await notify(ctx, { userIds, ...message })
}

// ---------------------------------------------------------------------------
// Module overview
// ---------------------------------------------------------------------------

/**
 * The transport landing figures.
 *
 * Deliberately operational rather than statistical: how many buses are out
 * right now, how many children they carry, and which papers are about to
 * lapse. A transport manager opens this page to find out what needs doing
 * today, not to admire a total.
 */
export async function transportOverview(ctx: AppContext) {
  ctx.require('transport.view')

  const startOfDay = attendanceDate(new Date())

  const [buses, activeRoutes, riders, trips, unassignedRiders] = await Promise.all([
    ctx.db.bus.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        registrationNo: true,
        capacity: true,
        isActive: true,
        insuranceExpiresOn: true,
        fitnessExpiresOn: true,
        pollutionExpiresOn: true,
        driver: { select: { firstName: true, lastName: true, phone: true } },
        routes: { where: { deletedAt: null }, select: { id: true, name: true, code: true } },
        _count: { select: { assignments: { where: { isActive: true } } } },
      },
    }),
    ctx.db.route.count({ where: { deletedAt: null, isActive: true } }),
    ctx.db.transportAssignment.count({ where: { isActive: true } }),
    ctx.db.busTrip.findMany({
      where: { onDate: startOfDay },
      select: { id: true, status: true, direction: true },
    }),
    ctx.db.busStop.count({ where: { latitude: null } }),
  ])

  const alerts = buses
    .flatMap((bus) => documentAlerts(bus).map((alert) => ({ ...alert, bus })))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  const seats = buses.filter((b) => b.isActive).reduce((sum, b) => sum + b.capacity, 0)

  return {
    buses,
    activeBuses: buses.filter((b) => b.isActive).length,
    activeRoutes,
    riders,
    seats,
    occupancyPercent: seats === 0 ? 0 : Math.round((riders / seats) * 100),
    running: trips.filter((t) => t.status === 'RUNNING').length,
    completed: trips.filter((t) => t.status === 'COMPLETED').length,
    withoutDriver: buses.filter((b) => b.isActive && !b.driver).length,
    stopsWithoutCoordinates: unassignedRiders,
    alerts,
  }
}

// ---------------------------------------------------------------------------
// Dashboard snapshot
// ---------------------------------------------------------------------------

export type TransportDashboardBus = {
  id: string
  code: string
  routeName: string | null
  status: 'RUNNING' | 'NO_SIGNAL' | 'PARKED'
  lastSeenMinutes: number | null
}

/**
 * The transport strip on the dashboard.
 *
 * Deliberately lighter than the live map's snapshot: this answers "is anything
 * wrong with the fleet right now", not "where exactly is bus 7". It reads the
 * latest ping per bus and nothing else, so putting it on a page every
 * administrator opens costs one indexed query rather than a trail per vehicle.
 */
export async function transportDashboard(ctx: AppContext) {
  ctx.require('transport.view')

  const [buses, riders] = await Promise.all([
    ctx.db.bus.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { code: 'asc' },
      take: 6,
      select: {
        id: true,
        code: true,
        routes: { where: { deletedAt: null }, take: 1, select: { name: true } },
        trips: {
          where: { onDate: attendanceDate(new Date()), status: 'RUNNING' },
          take: 1,
          select: { id: true },
        },
        locations: { orderBy: { recordedAt: 'desc' }, take: 1, select: { recordedAt: true } },
      },
    }),
    ctx.db.transportAssignment.count({ where: { isActive: true } }),
  ])

  const rows: TransportDashboardBus[] = buses.map((bus) => {
    const lastSeen = bus.locations[0]?.recordedAt ?? null
    const minutes = lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 60_000) : null
    const running = bus.trips.length > 0

    return {
      id: bus.id,
      code: bus.code,
      routeName: bus.routes[0]?.name ?? null,
      // A trip that is running but silent is the case worth surfacing: the bus
      // is out with children on it and nobody can see where.
      status: running
        ? minutes !== null && minutes <= SIGNAL_STALE_MINUTES
          ? 'RUNNING'
          : 'NO_SIGNAL'
        : 'PARKED',
      lastSeenMinutes: minutes,
    }
  })

  return {
    rows,
    riders,
    running: rows.filter((r) => r.status === 'RUNNING').length,
    noSignal: rows.filter((r) => r.status === 'NO_SIGNAL').length,
    fleet: buses.length,
  }
}
