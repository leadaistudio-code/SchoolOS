import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { attendanceDate } from '@/lib/dates'
import { accessibleStudentIds } from '@/server/scope'
import { notify } from '@/server/notifications'
import { distanceMeters, pathLengthMeters, type LatLng } from '@/lib/geo'
import {
  SIGNAL_STALE_MINUTES,
  type BoardingInput,
  type PingInput,
  type TripInput,
} from './service'

/** Within this radius the bus counts as being at the stop, not approaching it. */
const ARRIVED_RADIUS_M = 120
/** Used for the ETA when the bus is stopped or its speed is not reported. */
const ASSUMED_SPEED_KPH = 22
/** How much ping history the map draws as a trail behind the bus. */
const TRAIL_POINTS = 40
/** How close the bus must be before guardians are told to come down. */
const APPROACH_ALERT_M = 700

function actor(ctx: AppContext) {
  return {
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    module: 'transport',
  }
}

function today() {
  return attendanceDate(new Date())
}

function minutesSince(date: Date) {
  return (Date.now() - date.getTime()) / 60_000
}

// ---------------------------------------------------------------------------
// Types the map and the panels are drawn from
// ---------------------------------------------------------------------------

export type TrackedStop = {
  id: string
  name: string
  sortOrder: number
  latitude: number | null
  longitude: number | null
  pickupTime: string | null
  dropTime: string | null
  riders: number
  /** Already served on this trip, according to the boarding log. */
  served: boolean
  /** The stop the signed-in parent's child boards at. */
  isOwnStop: boolean
}

export type TrackedPosition = {
  latitude: number
  longitude: number
  speedKph: number | null
  headingDeg: number | null
  recordedAt: string
}

export type TrackedBus = {
  id: string
  code: string
  registrationNo: string
  model: string | null
  capacity: number
  attendantName: string | null
  driver: {
    id: string
    name: string
    phone: string | null
    photoUrl: string | null
    employeeCode: string
    designation: string | null
  } | null
  route: { id: string; name: string; code: string; distanceKm: number | null } | null
  stops: TrackedStop[]
  trip: {
    id: string
    direction: string
    status: string
    startedAt: string | null
    onBoard: number
  } | null
  position: TrackedPosition | null
  /** Recent pings, oldest first, for the trail behind the bus. */
  trail: { latitude: number; longitude: number }[]
  riders: number
  /** Minutes since the last ping; null when the bus has never reported. */
  signalAgeMin: number | null
  stale: boolean
  nextStop: { id: string; name: string; distanceM: number; etaMinutes: number } | null
  /** Names of the signed-in parent's children riding this bus. */
  ownChildren: string[]
  /** Progress along the stop list, 0–100, for the route strip. */
  progressPercent: number
}

export type TrackingSnapshot = {
  buses: TrackedBus[]
  school: { name: string; latitude: number | null; longitude: number | null } | null
  /** True when the viewer only sees their own children's buses. */
  scoped: boolean
  generatedAt: string
}

// ---------------------------------------------------------------------------
// The live snapshot
// ---------------------------------------------------------------------------

/**
 * Everything the live map needs, in one round trip.
 *
 * The map polls this, so it answers with the whole picture rather than a diff:
 * a parent who opens the page mid-journey must see the same thing as one who
 * has had it open since the depot. Parents are narrowed to the buses their own
 * children ride — a school bus map is a list of where other people's children
 * are standing, and that is not public information.
 */
export async function trackingSnapshot(
  ctx: AppContext,
  options: { busId?: string } = {},
): Promise<TrackingSnapshot> {
  ctx.require('transport.track')

  const scopedStudentIds = await accessibleStudentIds(ctx)
  const scoped = scopedStudentIds !== null

  const ownAssignments = scoped
    ? await ctx.db.transportAssignment.findMany({
        where: { isActive: true, studentId: { in: scopedStudentIds } },
        select: {
          stopId: true,
          busId: true,
          routeId: true,
          student: { select: { firstName: true, lastName: true } },
        },
      })
    : []

  // A route without its own bus still tracks: the bus is resolved through the
  // route, so an assignment made before a vehicle was allocated is not a hole
  // in the map.
  const ownBusIds = new Set(ownAssignments.map((a) => a.busId).filter((id): id is string => !!id))
  const ownRouteIds = new Set(ownAssignments.map((a) => a.routeId))
  const ownStopIds = new Set(ownAssignments.map((a) => a.stopId))

  if (scoped && ownBusIds.size === 0 && ownRouteIds.size === 0) {
    return { buses: [], school: await schoolPoint(ctx), scoped, generatedAt: new Date().toISOString() }
  }

  const buses = await ctx.db.bus.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(options.busId ? { id: options.busId } : {}),
      ...(scoped
        ? {
            OR: [
              { id: { in: [...ownBusIds] } },
              { routes: { some: { id: { in: [...ownRouteIds] } } } },
            ],
          }
        : {}),
    },
    orderBy: { code: 'asc' },
    include: {
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          photoUrl: true,
          employeeCode: true,
          designation: true,
        },
      },
      routes: {
        where: { deletedAt: null, ...(scoped ? { id: { in: [...ownRouteIds] } } : {}) },
        orderBy: { name: 'asc' },
        take: 1,
        include: {
          stops: {
            orderBy: { sortOrder: 'asc' },
            include: { _count: { select: { assignments: { where: { isActive: true } } } } },
          },
        },
      },
      trips: {
        where: { onDate: today(), status: { in: ['RUNNING', 'SCHEDULED'] } },
        orderBy: { startedAt: 'desc' },
        take: 1,
        include: {
          boardings: { select: { stopId: true, event: true } },
          _count: { select: { boardings: true } },
        },
      },
      locations: { orderBy: { recordedAt: 'desc' }, take: TRAIL_POINTS },
      _count: { select: { assignments: { where: { isActive: true } } } },
    },
  })

  const childrenByBus = new Map<string, string[]>()
  for (const assignment of ownAssignments) {
    if (!assignment.busId) continue
    const name = `${assignment.student.firstName} ${assignment.student.lastName}`
    childrenByBus.set(assignment.busId, [...(childrenByBus.get(assignment.busId) ?? []), name])
  }

  const tracked = buses.map((bus) => {
    const route = bus.routes[0] ?? null
    const trip = bus.trips[0] ?? null
    const latest = bus.locations[0] ?? null

    const servedStopIds = new Set(
      (trip?.boardings ?? [])
        .filter((b) => b.event !== 'ABSENT')
        .map((b) => b.stopId)
        .filter((id): id is string => !!id),
    )

    const stops: TrackedStop[] = (route?.stops ?? []).map((stop) => ({
      id: stop.id,
      name: stop.name,
      sortOrder: stop.sortOrder,
      latitude: stop.latitude,
      longitude: stop.longitude,
      pickupTime: stop.pickupTime,
      dropTime: stop.dropTime,
      riders: stop._count.assignments,
      served: servedStopIds.has(stop.id),
      isOwnStop: ownStopIds.has(stop.id),
    }))

    const position: TrackedPosition | null = latest
      ? {
          latitude: latest.latitude,
          longitude: latest.longitude,
          speedKph: latest.speedKph,
          headingDeg: latest.headingDeg,
          recordedAt: latest.recordedAt.toISOString(),
        }
      : null

    const signalAgeMin = latest ? minutesSince(latest.recordedAt) : null
    const next = nextStopFor(stops, position, servedStopIds)
    const servedCount = stops.filter((s) => s.served).length

    return {
      id: bus.id,
      code: bus.code,
      registrationNo: bus.registrationNo,
      model: bus.model,
      capacity: bus.capacity,
      attendantName: bus.attendantName,
      driver: bus.driver
        ? {
            id: bus.driver.id,
            name: `${bus.driver.firstName} ${bus.driver.lastName}`,
            phone: bus.driver.phone,
            photoUrl: bus.driver.photoUrl,
            employeeCode: bus.driver.employeeCode,
            designation: bus.driver.designation,
          }
        : null,
      route: route
        ? { id: route.id, name: route.name, code: route.code, distanceKm: route.distanceKm }
        : null,
      stops,
      trip: trip
        ? {
            id: trip.id,
            direction: trip.direction,
            status: trip.status,
            startedAt: trip.startedAt?.toISOString() ?? null,
            onBoard: trip.boardings.filter((b) => b.event === 'BOARDED').length,
          }
        : null,
      position,
      // Newest first from the database; the trail is drawn in travel order.
      trail: bus.locations
        .slice()
        .reverse()
        .map((l) => ({ latitude: l.latitude, longitude: l.longitude })),
      riders: bus._count.assignments,
      signalAgeMin: signalAgeMin === null ? null : Math.round(signalAgeMin),
      stale: signalAgeMin === null || signalAgeMin > SIGNAL_STALE_MINUTES,
      nextStop: next,
      ownChildren: childrenByBus.get(bus.id) ?? [],
      progressPercent: stops.length === 0 ? 0 : Math.round((servedCount / stops.length) * 100),
    } satisfies TrackedBus
  })

  // A bus in motion is what the page is for; parked and silent vehicles sink
  // to the bottom rather than being hidden, so a missing bus is still visible.
  tracked.sort((a, b) => {
    const rank = (bus: TrackedBus) => (bus.trip?.status === 'RUNNING' && !bus.stale ? 0 : bus.stale ? 2 : 1)
    return rank(a) - rank(b) || a.code.localeCompare(b.code)
  })

  return {
    buses: tracked,
    school: await schoolPoint(ctx),
    scoped,
    generatedAt: new Date().toISOString(),
  }
}

async function schoolPoint(ctx: AppContext) {
  return ctx.db.school.findFirst({ select: { name: true, latitude: true, longitude: true } })
}

/**
 * Which stop the bus is heading for, and when it should get there.
 *
 * The boarding log is the honest answer where it exists — a stop the driver
 * has recorded is behind the bus whatever the GPS says. Before the first
 * boarding, position decides: the nearest stop, or the one after it when the
 * bus is already standing at it.
 *
 * The ETA follows the remaining stop chain rather than the straight line to
 * the stop, because a bus travels the route, not the crow's path. It is
 * deliberately a rough number; a parent needs to know whether to put shoes on,
 * not a timetable.
 */
export function nextStopFor(
  stops: TrackedStop[],
  position: TrackedPosition | null,
  servedStopIds: Set<string>,
): { id: string; name: string; distanceM: number; etaMinutes: number } | null {
  const located = stops.filter(
    (s): s is TrackedStop & LatLng =>
      typeof s.latitude === 'number' && typeof s.longitude === 'number',
  )
  if (located.length === 0 || !position) return null

  const firstUnserved = located.findIndex((s) => !servedStopIds.has(s.id))
  let index = firstUnserved

  if (servedStopIds.size === 0) {
    const nearest = located.reduce(
      (best, stop, i) => {
        const d = distanceMeters(position, stop)
        return d < best.distance ? { index: i, distance: d } : best
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    )
    index = nearest.distance <= ARRIVED_RADIUS_M ? nearest.index + 1 : nearest.index
  }

  const target = located[index]
  if (!target) return null

  const legs: LatLng[] = [position, ...located.slice(index, index + 1)]
  const distanceM = pathLengthMeters(legs)

  // A crawling bus is in traffic, not stopped forever; the assumed speed keeps
  // the estimate from running away to hours.
  const speed = Math.max(position.speedKph ?? 0, ASSUMED_SPEED_KPH)
  const etaMinutes = Math.max(1, Math.round(distanceM / 1000 / speed * 60))

  return { id: target.id, name: target.name, distanceM: Math.round(distanceM), etaMinutes }
}

// ---------------------------------------------------------------------------
// Driver operations
// ---------------------------------------------------------------------------

export async function startTrip(ctx: AppContext, input: TripInput) {
  ctx.require('transport.drive')

  const running = await ctx.db.busTrip.findFirst({
    where: { busId: input.busId, status: 'RUNNING' },
    select: { id: true },
  })
  if (running) throw conflict('This bus already has a trip running. End it before starting another.')

  const bus = await ctx.db.bus.findFirst({
    where: { id: input.busId, deletedAt: null, isActive: true },
    select: { id: true, code: true, driverId: true },
  })
  if (!bus) throw notFound('Bus')

  const driver = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId },
    select: { id: true },
  })

  const trip = await ctx.db.busTrip.create({
    data: {
      tenantId: ctx.tenant.id,
      busId: input.busId,
      routeId: input.routeId,
      driverId: driver?.id ?? bus.driverId ?? null,
      direction: input.direction,
      onDate: today(),
      status: 'RUNNING',
      startedAt: new Date(),
    },
  })

  await audit({
    ...actor(ctx),
    action: 'trip.start',
    entityType: 'BusTrip',
    entityId: trip.id,
    summary: `Started ${input.direction.toLowerCase()} trip on bus ${bus.code}`,
  })

  return trip
}

export async function endTrip(ctx: AppContext, tripId: string) {
  ctx.require('transport.drive')

  const trip = await ctx.db.busTrip.update({
    where: { id: tripId },
    data: { status: 'COMPLETED', endedAt: new Date() },
    include: { bus: { select: { code: true } } },
  })

  await audit({
    ...actor(ctx),
    action: 'trip.end',
    entityType: 'BusTrip',
    entityId: trip.id,
    summary: `Ended trip on bus ${trip.bus.code}`,
  })

  return trip
}

/**
 * Records one GPS ping from the driver device.
 *
 * Writes are append-only and cheap on purpose: this table is the highest-write
 * one in the product, and a ping that arrives late is still worth keeping as
 * history even though it no longer moves the marker.
 */
export async function recordPing(ctx: AppContext, input: PingInput) {
  ctx.require('transport.drive')

  const bus = await ctx.db.bus.findFirst({
    where: { id: input.busId, deletedAt: null },
    select: { id: true },
  })
  if (!bus) throw notFound('Bus')

  const trip =
    input.tripId ??
    (
      await ctx.db.busTrip.findFirst({
        where: { busId: input.busId, status: 'RUNNING' },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      })
    )?.id ??
    null

  const location = await ctx.db.busLocation.create({
    data: {
      tenantId: ctx.tenant.id,
      busId: input.busId,
      tripId: trip,
      latitude: input.latitude,
      longitude: input.longitude,
      speedKph: input.speedKph ?? null,
      headingDeg: input.headingDeg ?? null,
      accuracyM: input.accuracyM ?? null,
    },
  })

  await alertApproachingGuardians(ctx, input.busId, location)

  return location
}

/**
 * Tells the families at the next stop that the bus is nearly there.
 *
 * Sent once per stop per trip — the boarding log is what marks a stop as done,
 * and an alert already sent for a stop is not repeated because the bus is
 * still 600 metres away on the next ping.
 */
async function alertApproachingGuardians(
  ctx: AppContext,
  busId: string,
  position: { latitude: number; longitude: number; tripId: string | null },
) {
  if (!position.tripId) return

  const trip = await ctx.db.busTrip.findFirst({
    where: { id: position.tripId },
    select: {
      id: true,
      direction: true,
      route: {
        select: {
          name: true,
          stops: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true, latitude: true, longitude: true },
          },
        },
      },
      boardings: { select: { stopId: true } },
    },
  })
  if (!trip) return

  const done = new Set(trip.boardings.map((b) => b.stopId).filter((id): id is string => !!id))
  const upcoming = trip.route.stops.find(
    (s) => !done.has(s.id) && s.latitude !== null && s.longitude !== null,
  )
  if (!upcoming) return

  const distance = distanceMeters(position, {
    latitude: upcoming.latitude!,
    longitude: upcoming.longitude!,
  })
  if (distance > APPROACH_ALERT_M) return

  const assignments = await ctx.db.transportAssignment.findMany({
    where: { stopId: upcoming.id, isActive: true },
    select: {
      student: {
        select: {
          firstName: true,
          guardians: { select: { parent: { select: { userId: true } } } },
        },
      },
    },
  })

  const userIds = [
    ...new Set(
      assignments.flatMap((a) =>
        a.student.guardians.map((g) => g.parent.userId).filter((id): id is string => !!id),
      ),
    ),
  ]
  if (userIds.length === 0) return

  await notify(ctx, {
    userIds,
    eventKey: `transport.approaching.${trip.id}.${upcoming.id}`,
    title: 'Bus approaching',
    body: `The ${trip.route.name} bus is about ${Math.round(distance)}m from ${upcoming.name}.`,
    linkUrl: '/transport/tracking',
  })
}

export async function recordBoarding(ctx: AppContext, input: BoardingInput) {
  ctx.require('transport.drive')

  const log = await ctx.db.transportBoardingLog.upsert({
    where: {
      tenantId_tripId_studentId_event: {
        tenantId: ctx.tenant.id,
        tripId: input.tripId,
        studentId: input.studentId,
        event: input.event,
      },
    },
    create: {
      tenantId: ctx.tenant.id,
      tripId: input.tripId,
      studentId: input.studentId,
      stopId: input.stopId ?? null,
      event: input.event,
      recordedById: ctx.user.userId,
    },
    update: { occurredAt: new Date(), stopId: input.stopId ?? null },
  })

  const student = await ctx.db.student.findFirst({
    where: { id: input.studentId },
    select: { firstName: true },
  })

  const verb =
    input.event === 'BOARDED' ? 'boarded the bus' : input.event === 'DROPPED' ? 'was dropped off' : 'did not board'

  const guardians = await ctx.db.studentGuardian.findMany({
    where: { studentId: input.studentId },
    select: { parent: { select: { userId: true } } },
  })
  const userIds = guardians.map((g) => g.parent.userId).filter((id): id is string => !!id)
  if (userIds.length > 0 && student) {
    await notify(ctx, {
      userIds,
      eventKey: `transport.boarding.${log.id}`,
      title: input.event === 'ABSENT' ? 'Bus boarding missed' : 'Bus update',
      body: `${student.firstName} ${verb} at ${new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })}.`,
      linkUrl: '/transport/tracking',
    })
  }

  return log
}

/** The trip a driver is currently running, with the roster to mark off. */
export async function driverToday(ctx: AppContext) {
  ctx.require('transport.drive')

  const staff = await ctx.db.staff.findFirst({
    where: { userId: ctx.user.userId },
    select: { id: true },
  })

  const trip = await ctx.db.busTrip.findFirst({
    where: {
      onDate: today(),
      status: 'RUNNING',
      ...(staff ? { OR: [{ driverId: staff.id }, { bus: { driverId: staff.id } }] } : {}),
    },
    orderBy: { startedAt: 'desc' },
    include: {
      bus: { select: { id: true, code: true, registrationNo: true } },
      route: {
        select: {
          id: true,
          name: true,
          stops: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } },
        },
      },
      boardings: { select: { studentId: true, event: true } },
    },
  })

  const buses = staff
    ? await ctx.db.bus.findMany({
        where: { deletedAt: null, isActive: true, driverId: staff.id },
        select: {
          id: true,
          code: true,
          registrationNo: true,
          routes: { where: { deletedAt: null }, select: { id: true, name: true } },
        },
      })
    : []

  const roster = trip
    ? await ctx.db.transportAssignment.findMany({
        where: { routeId: trip.routeId, isActive: true },
        orderBy: [{ stop: { sortOrder: 'asc' } }, { student: { firstName: 'asc' } }],
        select: {
          id: true,
          student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
          stop: { select: { id: true, name: true } },
        },
      })
    : []

  return { trip, buses, roster }
}
