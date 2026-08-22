import { prisma } from '@/server/db/prisma'
import { tenantDb } from '@/server/db/tenant-client'
import { randomToken, sha256 } from '@/server/crypto'
import { audit } from '@/server/audit'
import { normalisePayload, type GpsFix } from '@/lib/gps-payload'
import type { AppContext } from '@/server/context'

/**
 * Positions from hardware.
 *
 * The driver-phone path already works and costs nothing, but it stops when the
 * screen locks and it is not a compliance story: school transport in India is
 * regulated, and a certified tracker in the vehicle is what a board actually
 * asks for. This is the door those devices come through.
 *
 * Deliberately not a per-vendor integration. A GPS server — Traccar being the
 * obvious one — already speaks a couple of hundred tracker protocols; pointing
 * its forward webhook here means one endpoint covers every device a school will
 * ever buy, and swapping hardware next year changes nothing on our side.
 */

const TOKEN_PREFIX = 'mcv_gps_'

/* -------------------------------------------------------------------------- */
/* Tokens                                                                      */
/* -------------------------------------------------------------------------- */

export async function listIngestTokens(ctx: AppContext) {
  ctx.require('transport.manage')

  return ctx.db.gpsIngestToken.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  })
}

/**
 * Mints a token and returns it once.
 *
 * The plaintext is never stored and cannot be recovered — an administrator who
 * loses it revokes and creates another. That is a small inconvenience set
 * against a credential that would otherwise sit readable in the database and in
 * every backup of it.
 */
export async function createIngestToken(ctx: AppContext, name: string) {
  ctx.require('transport.manage')

  const secret = `${TOKEN_PREFIX}${randomToken(24)}`
  const created = await ctx.db.gpsIngestToken.create({
    data: {
      tenantId: ctx.tenant.id,
      name: name.trim().slice(0, 80) || 'GPS server',
      tokenHash: sha256(secret),
      prefix: secret.slice(0, TOKEN_PREFIX.length + 6),
      createdById: ctx.user.userId,
    },
    select: { id: true, name: true, prefix: true, createdAt: true },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'transport.ingest_token.create',
    module: 'transport',
    entityType: 'GpsIngestToken',
    entityId: created.id,
    summary: `Created a GPS ingest token named ${created.name}`,
  })

  return { ...created, token: secret }
}

export async function revokeIngestToken(ctx: AppContext, id: string) {
  ctx.require('transport.manage')

  const token = await ctx.db.gpsIngestToken.findFirst({
    where: { id },
    select: { id: true, name: true, revokedAt: true },
  })
  if (!token) throw new Error('No such token')
  if (token.revokedAt) return token

  const updated = await ctx.db.gpsIngestToken.update({
    where: { id },
    data: { revokedAt: new Date() },
    select: { id: true, name: true, revokedAt: true },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'transport.ingest_token.revoke',
    module: 'transport',
    entityType: 'GpsIngestToken',
    entityId: id,
    summary: `Revoked the GPS ingest token named ${token.name}`,
  })

  return updated
}

/* -------------------------------------------------------------------------- */
/* Device mapping                                                              */
/* -------------------------------------------------------------------------- */

export async function listTrackedBuses(ctx: AppContext) {
  ctx.require('transport.manage')

  return ctx.db.bus.findMany({
    where: { deletedAt: null },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      registrationNo: true,
      gpsDeviceId: true,
      isActive: true,
      locations: {
        orderBy: { recordedAt: 'desc' },
        take: 1,
        select: { recordedAt: true },
      },
    },
  })
}

export async function setBusDeviceId(ctx: AppContext, busId: string, deviceId: string | null) {
  ctx.require('transport.manage')

  const trimmed = deviceId?.trim() || null

  // The unique index would catch this, but a Prisma constraint error is not a
  // sentence anybody can act on.
  if (trimmed) {
    const clash = await ctx.db.bus.findFirst({
      where: { gpsDeviceId: trimmed, id: { not: busId }, deletedAt: null },
      select: { code: true },
    })
    if (clash) throw new Error(`That device is already assigned to bus ${clash.code}`)
  }

  const updated = await ctx.db.bus.update({
    where: { id: busId },
    data: { gpsDeviceId: trimmed },
    select: { id: true, code: true, gpsDeviceId: true },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'transport.bus.device',
    module: 'transport',
    entityType: 'Bus',
    entityId: busId,
    summary: trimmed
      ? `Linked tracker ${trimmed} to bus ${updated.code}`
      : `Unlinked the tracker from bus ${updated.code}`,
  })

  return updated
}

/* -------------------------------------------------------------------------- */
/* Ingestion                                                                   */
/* -------------------------------------------------------------------------- */

export type IngestOutcome = {
  accepted: number
  /** Fixes whose device is not linked to any bus, named so it can be fixed. */
  unknownDevices: string[]
  rejected: number
}

/**
 * Resolves a bearer token to a tenant.
 *
 * Runs on the unscoped client because there is no tenant yet — the token is
 * what establishes one. It is looked up by hash, so a stolen database row does
 * not yield a usable credential.
 */
export async function tenantForToken(bearer: string): Promise<{ tenantId: string; tokenId: string } | null> {
  const token = bearer.trim()
  if (!token.startsWith(TOKEN_PREFIX)) return null

  const row = await prisma.gpsIngestToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, tenantId: true, revokedAt: true },
  })
  if (!row || row.revokedAt) return null

  return { tenantId: row.tenantId, tokenId: row.id }
}

/**
 * Writes a batch of fixes.
 *
 * Everything is resolved in bulk — one query for the buses, one for the running
 * trips, one insert — because a fleet coming back into signal after a dead spot
 * arrives as one large batch and a per-fix round trip would time out exactly
 * when the data matters most.
 */
export async function ingestFixes(
  tenantId: string,
  tokenId: string,
  body: unknown,
): Promise<IngestOutcome> {
  const fixes = normalisePayload(body)
  if (fixes.length === 0) return { accepted: 0, unknownDevices: [], rejected: 0 }

  const db = tenantDb(tenantId)
  const deviceIds = [...new Set(fixes.map((f) => f.deviceId))]

  const buses = await db.bus.findMany({
    where: { gpsDeviceId: { in: deviceIds }, deletedAt: null },
    select: { id: true, gpsDeviceId: true },
  })
  const busByDevice = new Map(buses.map((b) => [b.gpsDeviceId!, b.id]))

  const unknownDevices = deviceIds.filter((id) => !busByDevice.has(id))
  const usable = fixes.filter((f) => busByDevice.has(f.deviceId))

  if (usable.length === 0) {
    await touchToken(db, tokenId)
    return { accepted: 0, unknownDevices, rejected: fixes.length }
  }

  // Attach each fix to the trip that is actually running, so the position joins
  // the trail the parents' screen draws rather than floating unattached.
  const busIds = [...new Set(usable.map((f) => busByDevice.get(f.deviceId)!))]
  const trips = await db.busTrip.findMany({
    where: { busId: { in: busIds }, status: 'RUNNING' },
    orderBy: { startedAt: 'desc' },
    select: { id: true, busId: true },
  })
  const tripByBus = new Map<string, string>()
  for (const trip of trips) {
    if (!tripByBus.has(trip.busId)) tripByBus.set(trip.busId, trip.id)
  }

  const now = new Date()
  await db.busLocation.createMany({
    data: usable.map((fix: GpsFix) => {
      const busId = busByDevice.get(fix.deviceId)!
      return {
        tenantId,
        busId,
        tripId: tripByBus.get(busId) ?? null,
        latitude: fix.latitude,
        longitude: fix.longitude,
        speedKph: fix.speedKph,
        headingDeg: fix.headingDeg,
        accuracyM: fix.accuracyM,
        // A device clock that could not be trusted was discarded upstream; the
        // arrival time is then the best available answer.
        recordedAt: fix.recordedAt ?? now,
      }
    }),
  })

  await touchToken(db, tokenId)

  return {
    accepted: usable.length,
    unknownDevices,
    rejected: fixes.length - usable.length,
  }
}

/** Last-used is what tells an administrator a tracker has gone quiet. */
async function touchToken(db: ReturnType<typeof tenantDb>, tokenId: string) {
  await db.gpsIngestToken
    .update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined)
}
