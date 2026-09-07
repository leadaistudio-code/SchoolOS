import { prisma } from '@/server/db/prisma'
import { tenantDb } from '@/server/db/tenant-client'
import { sha256 } from '@/server/crypto'
import { CONNECTOR_OFFLINE_AFTER_SEC, TOKEN_PREFIX } from './schema'

export type ConnectorAuth = {
  tenantId: string
  connectorId: string
  connectorKey: string
}

/**
 * Resolve a Connect bearer token to a tenant-bound connector.
 * Tenant membership comes only from this row — never from the request body.
 */
export async function connectorForToken(bearer: string): Promise<ConnectorAuth | null> {
  if (!bearer.startsWith(TOKEN_PREFIX)) return null
  const hash = sha256(bearer)
  const row = await prisma.deviceConnector.findFirst({
    where: {
      secretHash: hash,
      revokedAt: null,
      enabled: true,
      status: { not: 'REVOKED' },
    },
    select: { id: true, tenantId: true, connectorKey: true, status: true },
  })
  if (!row) return null
  if (row.status === 'DISABLED') return null
  return { tenantId: row.tenantId, connectorId: row.id, connectorKey: row.connectorKey }
}

export function isConnectorOnline(lastSeenAt: Date | null | undefined, now = new Date()): boolean {
  if (!lastSeenAt) return false
  return now.getTime() - lastSeenAt.getTime() <= CONNECTOR_OFFLINE_AFTER_SEC * 1000
}

export async function touchConnector(
  tenantId: string,
  connectorId: string,
  patch: {
    version?: string | null
    hostname?: string | null
    osInfo?: string | null
    pendingEvents?: number
  },
) {
  const db = tenantDb(tenantId)
  await db.deviceConnector.update({
    where: { id: connectorId },
    data: {
      lastSeenAt: new Date(),
      status: 'ONLINE',
      ...(patch.version !== undefined ? { version: patch.version } : {}),
      ...(patch.hostname !== undefined ? { hostname: patch.hostname } : {}),
      ...(patch.osInfo !== undefined ? { osInfo: patch.osInfo } : {}),
      ...(patch.pendingEvents !== undefined ? { pendingEvents: patch.pendingEvents } : {}),
    },
  })
}
