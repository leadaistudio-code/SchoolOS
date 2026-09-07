import { route } from '@/server/api/handler'
import { ok } from '@/server/api/response'
import { overview, listConnectors, listDevices, getDevice, setDeviceActive } from '@/server/modules/device-gateway/devices'
import { createPairingCode, listPairingCodes, revokeConnector } from '@/server/modules/device-gateway/pairing'
import { createPairingSchema } from '@/server/modules/device-gateway/schema'
import { enqueueCommand } from '@/server/modules/device-gateway/commands'
import { listMappings, upsertMapping, suggestMatches } from '@/server/modules/device-gateway/mappings'
import { listRawEvents, adminReprocessEvent } from '@/server/modules/device-gateway/logs'
import { getBiometricSettings, saveBiometricSettings } from '@/server/modules/device-gateway/settings'
import { mappingSchema, biometricSettingsSchema } from '@/server/modules/device-gateway/schema'
import type { NextRequest } from 'next/server'
import type { DeviceCommandType, DeviceRawEventStatus } from '@prisma/client'

export const GET = route(
  async (req: NextRequest, ctx) => {
    const tab = req.nextUrl.searchParams.get('tab') ?? 'overview'
    if (tab === 'connectors') return ok(await listConnectors(ctx))
    if (tab === 'devices') return ok(await listDevices(ctx))
    if (tab === 'pairing') return ok(await listPairingCodes(ctx))
    if (tab === 'settings') return ok(await getBiometricSettings(ctx))
    if (tab === 'mappings') {
      return ok(
        await listMappings(ctx, {
          q: req.nextUrl.searchParams.get('q') ?? undefined,
          status: (req.nextUrl.searchParams.get('status') as 'mapped' | 'unmapped' | 'all') || 'all',
          page: Number(req.nextUrl.searchParams.get('page') ?? 1),
        }),
      )
    }
    if (tab === 'events') {
      return ok(
        await listRawEvents(ctx, {
          deviceId: req.nextUrl.searchParams.get('deviceId') ?? undefined,
          status: (req.nextUrl.searchParams.get('status') as DeviceRawEventStatus) || undefined,
          q: req.nextUrl.searchParams.get('q') ?? undefined,
          page: Number(req.nextUrl.searchParams.get('page') ?? 1),
        }),
      )
    }
    if (tab === 'device') {
      const id = req.nextUrl.searchParams.get('id')
      if (!id) return ok(null)
      return ok(await getDevice(ctx, id))
    }
    if (tab === 'suggest') {
      const externalUserId = req.nextUrl.searchParams.get('externalUserId') ?? ''
      return ok(await suggestMatches(ctx, externalUserId))
    }
    return ok(await overview(ctx))
  },
  { permission: 'biometric.view' },
)

export const POST = route(
  async (req: NextRequest, ctx) => {
    const body = await req.json()
    const action = body?.action as string

    if (action === 'create_pairing') {
      return ok(await createPairingCode(ctx, createPairingSchema.parse(body)))
    }
    if (action === 'revoke_connector') {
      return ok(await revokeConnector(ctx, String(body.connectorId)))
    }
    if (action === 'set_device_active') {
      return ok(await setDeviceActive(ctx, String(body.deviceId), Boolean(body.active)))
    }
    if (action === 'enqueue_command') {
      return ok(
        await enqueueCommand(ctx, {
          connectorId: String(body.connectorId),
          deviceId: body.deviceId ? String(body.deviceId) : null,
          type: body.type as DeviceCommandType,
          payload: body.payload,
        }),
      )
    }
    if (action === 'upsert_mapping') {
      return ok(await upsertMapping(ctx, mappingSchema.parse(body)))
    }
    if (action === 'reprocess_event') {
      return ok(await adminReprocessEvent(ctx, String(body.eventId)))
    }
    if (action === 'save_settings') {
      return ok(await saveBiometricSettings(ctx, biometricSettingsSchema.parse(body.settings ?? body)))
    }

    return ok({ error: 'Unknown action' })
  },
  { permission: 'biometric.manage', rateLimitKey: 'mutation' },
)
