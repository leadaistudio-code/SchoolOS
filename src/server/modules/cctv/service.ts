import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { ApiException, badRequest, conflict, notFound } from '@/server/api/response'
import { prisma } from '@/server/db/prisma'
import { tenantUrl } from '@/server/tenant'
import { env } from '@/lib/env'
import { minutesOf } from '@/lib/ist-clock'
import {
  RELAY_PASSWORD_PLACEHOLDER,
  buildRelayConfig,
  formatRelayKey,
  normaliseStreamBase,
  parentWindow,
  parseRelayKey,
  type ParentWindow,
  type Zone,
} from '@/lib/cctv'
import { CCTV_CLAIM_KEY, CCTV_ISSUER, cameraPath, cctvAudience, signCctvToken } from '@/server/cctv/token'

const TOKEN_TTL_MS = 10 * 60_000
const MAX_CAMERAS = 64

const actor = (ctx: AppContext) => ({
  tenantId: ctx.tenant.id,
  actorId: ctx.user.userId,
  actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
})

export function jwksUrl() {
  return `${env().APP_URL.replace(/\/+$/, '')}/api/v1/cctv/jwks`
}

const SITE_DEFAULTS = {
  name: 'School CCTV',
  enabled: false,
  streamBaseUrl: null as string | null,
  nvrHost: null as string | null,
  nvrPort: 554,
  nvrUsername: null as string | null,
  parentAccessEnabled: false,
  parentStart: '08:00',
  parentEnd: '14:00',
  parentDays: [1, 2, 3, 4, 5, 6],
}

export type CctvSiteView = typeof SITE_DEFAULTS & { id: string | null }

async function loadSite(ctx: AppContext): Promise<CctvSiteView> {
  const site = await ctx.db.cctvSite.findFirst()
  if (!site) return { id: null, ...SITE_DEFAULTS }
  return {
    id: site.id,
    name: site.name,
    enabled: site.enabled,
    streamBaseUrl: site.streamBaseUrl,
    nvrHost: site.nvrHost,
    nvrPort: site.nvrPort,
    nvrUsername: site.nvrUsername,
    parentAccessEnabled: site.parentAccessEnabled,
    parentStart: site.parentStart,
    parentEnd: site.parentEnd,
    parentDays: site.parentDays,
  }
}

async function ensureSite(ctx: AppContext) {
  const existing = await ctx.db.cctvSite.findFirst({ select: { id: true } })
  if (existing) return existing.id
  const created = await ctx.db.cctvSite.create({ data: { tenantId: ctx.tenant.id } })
  return created.id
}

function sectionLabel(section: { name: string; classLevel: { name: string } } | null) {
  return section ? `${section.classLevel.name} ${section.name}` : null
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function cctvSettings(ctx: AppContext) {
  ctx.require('cctv.manage')
  const [site, cameras, sections] = await Promise.all([
    loadSite(ctx),
    ctx.db.cctvCamera.findMany({
      orderBy: [{ sortOrder: 'asc' }, { channel: 'asc' }],
      include: { section: { select: { name: true, classLevel: { select: { name: true } } } } },
    }),
    ctx.db.section.findMany({
      where: { classLevel: { deletedAt: null, session: { isCurrent: true } } },
      select: { id: true, name: true, classLevel: { select: { name: true } } },
      orderBy: [{ classLevel: { numeric: 'asc' } }, { name: 'asc' }],
    }),
  ])
  return {
    site,
    jwksUrl: jwksUrl(),
    cameras: cameras.map((c) => ({
      id: c.id,
      name: c.name,
      channel: c.channel,
      zone: c.zone as Zone,
      sectionId: c.sectionId,
      sectionLabel: sectionLabel(c.section),
      sortOrder: c.sortOrder,
      enabled: c.enabled,
    })),
    sections: sections.map((s) => ({ id: s.id, label: `${s.classLevel.name} ${s.name}` })),
  }
}

const hhmm = z.string().refine((v) => minutesOf(v) !== null, 'Use HH:MM, for example 08:00')

export const siteSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    enabled: z.boolean(),
    streamBaseUrl: z.string().trim().max(300),
    nvrHost: z.string().trim().max(120),
    nvrPort: z.coerce.number().int().min(1).max(65535),
    nvrUsername: z.string().trim().max(60),
    parentAccessEnabled: z.boolean(),
    parentStart: hhmm,
    parentEnd: hhmm,
    parentDays: z.array(z.number().int().min(1).max(7)).max(7),
  })
  .refine((v) => (minutesOf(v.parentEnd) ?? 0) > (minutesOf(v.parentStart) ?? 0), {
    path: ['parentEnd'],
    message: 'The end time must be after the start time',
  })

export type SiteInput = z.infer<typeof siteSchema>

export async function saveSite(ctx: AppContext, input: SiteInput) {
  ctx.require('cctv.manage')
  let streamBaseUrl: string | null = null
  if (input.streamBaseUrl) {
    streamBaseUrl = normaliseStreamBase(input.streamBaseUrl)
    if (!streamBaseUrl) throw badRequest('The stream address must start with https:// (for example https://cctv.yourschool.com)')
  }
  if (input.enabled && !streamBaseUrl) throw badRequest('Add the stream address before switching live view on')
  if (input.nvrHost && !/^[A-Za-z0-9.-]+$/.test(input.nvrHost)) {
    throw badRequest('Recorder address should be an IP like 192.168.1.108, without http:// or rtsp://')
  }
  const data = {
    name: input.name,
    enabled: input.enabled,
    streamBaseUrl,
    nvrHost: input.nvrHost || null,
    nvrPort: input.nvrPort,
    nvrUsername: input.nvrUsername || null,
    parentAccessEnabled: input.parentAccessEnabled,
    parentStart: input.parentStart,
    parentEnd: input.parentEnd,
    parentDays: [...new Set(input.parentDays)].sort(),
  }
  await ctx.db.cctvSite.upsert({
    where: { tenantId: ctx.tenant.id },
    create: { tenantId: ctx.tenant.id, ...data },
    update: data,
  })
  await audit({
    ...actor(ctx),
    action: 'cctv.settings.update',
    module: 'cctv',
    entityType: 'CctvSite',
    summary: `CCTV live view ${input.enabled ? 'on' : 'off'}; parent viewing ${input.parentAccessEnabled ? 'on' : 'off'}`,
  })
}

export const cameraSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, 'Give the camera a name').max(60),
    channel: z.coerce.number().int().min(1, 'Channel starts at 1').max(256),
    zone: z.enum(['GENERAL', 'GATE', 'CLASSROOM']),
    sectionId: z.string().optional().nullable(),
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
    enabled: z.boolean().default(true),
  })
  .refine((v) => v.zone !== 'CLASSROOM' || !!v.sectionId, {
    path: ['sectionId'],
    message: 'Pick the class this camera watches',
  })

export type CameraInput = z.infer<typeof cameraSchema>

export async function saveCamera(ctx: AppContext, input: CameraInput) {
  ctx.require('cctv.manage')
  const sectionId = input.zone === 'CLASSROOM' ? input.sectionId || null : null
  if (sectionId) {
    const section = await ctx.db.section.findFirst({ where: { id: sectionId }, select: { id: true } })
    if (!section) throw badRequest('That class no longer exists')
  }
  const data = {
    name: input.name,
    channel: input.channel,
    zone: input.zone,
    sectionId,
    sortOrder: input.sortOrder,
    enabled: input.enabled,
  }
  try {
    if (input.id) {
      const existing = await ctx.db.cctvCamera.findFirst({ where: { id: input.id }, select: { id: true } })
      if (!existing) throw notFound('Camera')
      await ctx.db.cctvCamera.update({ where: { id: input.id }, data })
    } else {
      const count = await ctx.db.cctvCamera.count()
      if (count >= MAX_CAMERAS) throw badRequest(`Up to ${MAX_CAMERAS} cameras can be added`)
      const siteId = await ensureSite(ctx)
      await ctx.db.cctvCamera.create({ data: { tenantId: ctx.tenant.id, siteId, ...data } })
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw conflict(`Channel ${input.channel} is already used by another camera`)
    }
    throw e
  }
  await audit({
    ...actor(ctx),
    action: input.id ? 'cctv.camera.update' : 'cctv.camera.create',
    module: 'cctv',
    entityType: 'CctvCamera',
    entityId: input.id,
    summary: `${input.id ? 'Updated' : 'Added'} camera "${input.name}" (channel ${input.channel})`,
  })
}

export async function deleteCamera(ctx: AppContext, id: string) {
  ctx.require('cctv.manage')
  const cam = await ctx.db.cctvCamera.findFirst({ where: { id }, select: { id: true, name: true, channel: true } })
  if (!cam) throw notFound('Camera')
  await ctx.db.cctvCamera.delete({ where: { id } })
  await audit({
    ...actor(ctx),
    action: 'cctv.camera.delete',
    module: 'cctv',
    entityType: 'CctvCamera',
    entityId: id,
    summary: `Removed camera "${cam.name}" (channel ${cam.channel})`,
  })
}

function relayCameras(cameras: { id: string; name: string; channel: number }[]) {
  return cameras.map((c) => ({ path: cameraPath(c.id), hdPath: cameraPath(c.id, true), name: c.name, channel: c.channel }))
}

/**
 * The relay's settings file. The recorder password is typed in at download
 * time and written only into this file; it is never saved.
 */
export async function relayConfig(ctx: AppContext, input: { password: string; includeHd: boolean }) {
  ctx.require('cctv.manage')
  const site = await loadSite(ctx)
  if (!site.nvrHost) throw badRequest('Save the recorder address first')
  const cameras = await ctx.db.cctvCamera.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: 'asc' }, { channel: 'asc' }],
    select: { id: true, name: true, channel: true },
  })
  if (cameras.length === 0) throw badRequest('Add at least one camera first')
  const yaml = buildRelayConfig({
    schoolName: ctx.tenant.name,
    jwksUrl: jwksUrl(),
    audience: cctvAudience(ctx.tenant.id),
    issuer: CCTV_ISSUER,
    claimKey: CCTV_CLAIM_KEY,
    nvr: { host: site.nvrHost, port: site.nvrPort, username: site.nvrUsername ?? '', password: input.password },
    cameras: relayCameras(cameras),
    includeHd: input.includeHd,
  })
  await audit({
    ...actor(ctx),
    action: 'cctv.relay_config.download',
    module: 'cctv',
    entityType: 'CctvSite',
    summary: `Downloaded the CCTV relay settings file (${cameras.length} cameras)`,
  })
  return yaml
}

// ---------------------------------------------------------------------------
// Relay app
// ---------------------------------------------------------------------------

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export type RelayStatus = {
  connected: boolean
  keyHint: string | null
  keyCreatedAt: string | null
  lastSeenAt: string | null
  appVersion: string | null
}

export async function relayStatus(ctx: AppContext): Promise<RelayStatus> {
  ctx.require('cctv.manage')
  const site = await ctx.db.cctvSite.findFirst({
    select: { relayKeyHash: true, relayKeyHint: true, relayKeyCreatedAt: true, relayLastSeenAt: true, relayAppVersion: true },
  })
  return {
    connected: !!site?.relayKeyHash,
    keyHint: site?.relayKeyHint ?? null,
    keyCreatedAt: site?.relayKeyCreatedAt?.toISOString() ?? null,
    lastSeenAt: site?.relayLastSeenAt?.toISOString() ?? null,
    appVersion: site?.relayAppVersion ?? null,
  }
}

/** A new connection key for the relay app. Replaces any earlier key, which stops working at once. */
export async function createRelayKey(ctx: AppContext): Promise<string> {
  ctx.require('cctv.manage')
  const secret = randomBytes(32).toString('base64url')
  const key = formatRelayKey(ctx.tenant.id, secret)
  await ensureSite(ctx)
  await ctx.db.cctvSite.update({
    where: { tenantId: ctx.tenant.id },
    data: {
      relayKeyHash: sha256(secret),
      relayKeyHint: secret.slice(-4),
      relayKeyCreatedAt: new Date(),
      relayLastSeenAt: null,
      relayAppVersion: null,
    },
  })
  await audit({
    ...actor(ctx),
    action: 'cctv.relay_key.create',
    module: 'cctv',
    entityType: 'CctvSite',
    summary: 'Created a new connection key for the CCTV relay app',
  })
  return key
}

export async function revokeRelayKey(ctx: AppContext) {
  ctx.require('cctv.manage')
  await ctx.db.cctvSite.updateMany({
    data: { relayKeyHash: null, relayKeyHint: null, relayKeyCreatedAt: null, relayLastSeenAt: null, relayAppVersion: null },
  })
  await audit({
    ...actor(ctx),
    action: 'cctv.relay_key.revoke',
    module: 'cctv',
    entityType: 'CctvSite',
    summary: 'Disconnected the CCTV relay app',
  })
}

export type RelaySync = {
  schoolName: string
  liveUrl: string
  streamBaseUrl: string | null
  enabled: boolean
  nvr: { host: string; port: number; username: string } | null
  cameras: { path: string; hdPath: string; name: string; channel: number }[]
  /** mediamtx.yml with the password left as a placeholder; null until the recorder and a camera are set up. */
  config: string | null
  passwordPlaceholder: string
  message: string | null
  pollSeconds: number
}

const relayUnauthorized = () => new ApiException(401, 'UNAUTHORIZED', 'This connection key is not valid. Create a new one in Settings → CCTV.')

/**
 * Called by the relay app every couple of minutes with its connection key.
 * Hands back the current camera list and records that the relay is alive.
 */
export async function relaySync(rawKey: string, info: { appVersion?: string }, now: Date = new Date()): Promise<RelaySync> {
  const parsed = parseRelayKey(rawKey)
  if (!parsed) throw relayUnauthorized()
  const site = await prisma.cctvSite.findUnique({
    where: { tenantId: parsed.tenantId },
    include: {
      cameras: { where: { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { channel: 'asc' }], select: { id: true, name: true, channel: true } },
    },
  })
  const expected = site?.relayKeyHash ? Buffer.from(site.relayKeyHash, 'hex') : null
  const given = Buffer.from(sha256(parsed.secret), 'hex')
  if (!site || !expected || expected.length !== given.length || !timingSafeEqual(expected, given)) throw relayUnauthorized()
  const tenant = await prisma.tenant.findUnique({
    where: { id: site.tenantId },
    select: { id: true, name: true, slug: true, status: true, archivedAt: true },
  })
  if (!tenant || tenant.archivedAt || tenant.status === 'SUSPENDED' || tenant.status === 'ARCHIVED') {
    throw new ApiException(403, 'FORBIDDEN', 'This school account is not active.')
  }

  await prisma.cctvSite.update({
    where: { id: site.id },
    data: { relayLastSeenAt: now, relayAppVersion: info.appVersion?.slice(0, 20) || null },
  })

  const cameras = relayCameras(site.cameras)
  let message: string | null = null
  if (!site.nvrHost) message = 'Add the recorder IP address in MyCampusView → Settings → CCTV.'
  else if (cameras.length === 0) message = 'Add your cameras in MyCampusView → Settings → CCTV.'

  const config =
    site.nvrHost && cameras.length > 0
      ? buildRelayConfig({
          schoolName: tenant.name,
          jwksUrl: jwksUrl(),
          audience: cctvAudience(tenant.id),
          issuer: CCTV_ISSUER,
          claimKey: CCTV_CLAIM_KEY,
          nvr: { host: site.nvrHost, port: site.nvrPort, username: site.nvrUsername ?? '', password: RELAY_PASSWORD_PLACEHOLDER },
          cameras,
          includeHd: true,
          generatedAt: site.updatedAt,
        })
      : null

  return {
    schoolName: tenant.name,
    liveUrl: tenantUrl(tenant.slug, '/cctv'),
    streamBaseUrl: site.streamBaseUrl,
    enabled: site.enabled,
    nvr: site.nvrHost ? { host: site.nvrHost, port: site.nvrPort, username: site.nvrUsername ?? '' } : null,
    cameras,
    config,
    passwordPlaceholder: RELAY_PASSWORD_PLACEHOLDER,
    message,
    pollSeconds: 60,
  }
}

// ---------------------------------------------------------------------------
// Viewing
// ---------------------------------------------------------------------------

export type ViewableCamera = {
  id: string
  name: string
  zone: Zone
  sectionLabel: string | null
  /** Main stream path is only offered to staff. */
  hd: boolean
}

export type ViewerState = {
  site: { name: string; enabled: boolean; ready: boolean }
  cameras: ViewableCamera[]
  /** Set for parent-only viewers. */
  parent: ParentWindow | null
  /** Why the list is empty, in words for the person looking at it. */
  emptyReason: string | null
}

function canWatch(ctx: AppContext) {
  return ctx.can('cctv.view_all') || ctx.can('cctv.view_gate') || ctx.can('cctv.view_child')
}

async function childSectionIds(ctx: AppContext): Promise<string[]> {
  const parent = await ctx.db.parent.findFirst({
    where: { userId: ctx.user.userId, deletedAt: null },
    select: { children: { select: { studentId: true } } },
  })
  const studentIds = parent?.children.map((c) => c.studentId) ?? []
  if (studentIds.length === 0) return []
  const enrollments = await ctx.db.enrollment.findMany({
    where: { studentId: { in: studentIds }, isCurrent: true, student: { deletedAt: null, status: 'ACTIVE' } },
    select: { sectionId: true },
  })
  return [...new Set(enrollments.map((e) => e.sectionId))]
}

async function resolveViewer(ctx: AppContext, now: Date) {
  const site = await loadSite(ctx)
  const all = ctx.can('cctv.view_all')
  const gate = !all && ctx.can('cctv.view_gate')
  const child = !all && !gate && ctx.can('cctv.view_child')
  const window = child ? parentWindow(site, now) : null

  const include = { section: { select: { name: true, classLevel: { select: { name: true } } } } }
  const orderBy = [{ sortOrder: 'asc' as const }, { channel: 'asc' as const }]
  let rows: Prisma.CctvCameraGetPayload<{ include: typeof include }>[] = []
  if (site.enabled && site.streamBaseUrl) {
    if (all) {
      rows = await ctx.db.cctvCamera.findMany({ where: { enabled: true }, include, orderBy })
    } else if (gate) {
      rows = await ctx.db.cctvCamera.findMany({ where: { enabled: true, zone: 'GATE' }, include, orderBy })
    } else if (child && window?.open) {
      const sectionIds = await childSectionIds(ctx)
      if (sectionIds.length > 0) {
        rows = await ctx.db.cctvCamera.findMany({
          where: { enabled: true, zone: 'CLASSROOM', sectionId: { in: sectionIds } },
          include,
          orderBy,
        })
      }
    }
  }

  const cameras: ViewableCamera[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    zone: c.zone as Zone,
    sectionLabel: sectionLabel(c.section),
    hd: !child,
  }))

  let emptyReason: string | null = null
  if (cameras.length === 0) {
    if (!site.enabled || !site.streamBaseUrl) emptyReason = 'Live CCTV is not switched on for the school yet.'
    else if (child && !site.parentAccessEnabled) emptyReason = 'The school has not opened classroom cameras to parents.'
    else if (child && !window?.open) emptyReason = `Classroom cameras can be watched ${window?.label ?? 'during school hours'} (India time).`
    else if (child) emptyReason = 'There is no camera set up for your child’s classroom yet.'
    else if (gate) emptyReason = 'No gate or entrance cameras have been set up yet.'
    else emptyReason = 'No cameras have been added yet.'
  }

  return { site, cameras, window, child, emptyReason }
}

export async function viewerState(ctx: AppContext, now: Date = new Date()): Promise<ViewerState> {
  if (!canWatch(ctx)) ctx.require('cctv.view_all')
  const { site, cameras, window, emptyReason } = await resolveViewer(ctx, now)
  return {
    site: { name: site.name, enabled: site.enabled, ready: !!site.streamBaseUrl },
    cameras,
    parent: window,
    emptyReason,
  }
}

export type ViewGrant = { token: string; baseUrl: string; expiresAt: string }

/**
 * One token for every camera this person may watch right now. The client
 * asks again before it lapses; a parent's token never outlives the viewing
 * window, so their picture stops when the window closes.
 */
export async function issueViewGrant(ctx: AppContext, opts: { refresh: boolean }, now: Date = new Date()): Promise<ViewGrant> {
  if (!canWatch(ctx)) ctx.require('cctv.view_all')
  const { site, cameras, window, child } = await resolveViewer(ctx, now)
  if (!site.enabled || !site.streamBaseUrl) throw badRequest('Live CCTV is not switched on')
  if (cameras.length === 0) throw badRequest('There are no cameras you can watch right now')

  let expiresAt = new Date(now.getTime() + TOKEN_TTL_MS)
  if (child && window?.open && window.closesAt < expiresAt) expiresAt = window.closesAt

  const paths = cameras.flatMap((c) => (c.hd ? [cameraPath(c.id), cameraPath(c.id, true)] : [cameraPath(c.id)]))
  const token = signCctvToken(env().AUTH_SECRET, { tenantId: ctx.tenant.id, userId: ctx.user.userId, paths, expiresAt, now })

  if (!opts.refresh) {
    await audit({
      ...actor(ctx),
      action: 'cctv.view',
      module: 'cctv',
      entityType: 'CctvSite',
      summary: `Opened live CCTV (${cameras.length} camera${cameras.length === 1 ? '' : 's'})`,
    })
  }
  return { token, baseUrl: site.streamBaseUrl, expiresAt: expiresAt.toISOString() }
}
