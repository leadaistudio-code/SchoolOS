import { randomToken, sha256 } from '@/server/crypto'
import { prisma } from '@/server/db/prisma'
import { tenantDb } from '@/server/db/tenant-client'
import { CONNECTOR_OFFLINE_AFTER_SEC, TOKEN_PREFIX } from './schema'

export type TallyConnectorAuth = {
  tenantId: string
  connectorId: string
  integrationId: string
  connectorKey: string
}

export async function tallyConnectorForToken(
  bearer: string,
): Promise<TallyConnectorAuth | null> {
  if (!bearer.startsWith(TOKEN_PREFIX)) return null
  const hash = sha256(bearer)
  const row = await prisma.tallyConnector.findFirst({
    where: {
      secretHash: hash,
      revokedAt: null,
      enabled: true,
      status: { not: 'REVOKED' },
    },
    select: {
      id: true,
      tenantId: true,
      integrationId: true,
      connectorKey: true,
      status: true,
    },
  })
  if (!row || row.status === 'DISABLED') return null
  return {
    tenantId: row.tenantId,
    connectorId: row.id,
    integrationId: row.integrationId,
    connectorKey: row.connectorKey,
  }
}

export function isTallyConnectorOnline(
  lastSeenAt: Date | null | undefined,
  now = new Date(),
): boolean {
  if (!lastSeenAt) return false
  return now.getTime() - lastSeenAt.getTime() <= CONNECTOR_OFFLINE_AFTER_SEC * 1000
}

export async function touchTallyConnector(
  tenantId: string,
  connectorId: string,
  patch: {
    version?: string | null
    hostname?: string | null
    osInfo?: string | null
    pendingJobs?: number
    tallyHost?: string
    tallyPort?: number
  },
) {
  const db = tenantDb(tenantId)
  await db.tallyConnector.update({
    where: { id: connectorId },
    data: {
      lastSeenAt: new Date(),
      status: 'ONLINE',
      ...(patch.version !== undefined ? { version: patch.version } : {}),
      ...(patch.hostname !== undefined ? { hostname: patch.hostname } : {}),
      ...(patch.osInfo !== undefined ? { osInfo: patch.osInfo } : {}),
      ...(patch.pendingJobs !== undefined ? { pendingJobs: patch.pendingJobs } : {}),
      ...(patch.tallyHost !== undefined ? { tallyHost: patch.tallyHost } : {}),
      ...(patch.tallyPort !== undefined ? { tallyPort: patch.tallyPort } : {}),
    },
  })
}

export function newConnectorSecret(): { secret: string; hash: string; prefix: string } {
  const secret = `${TOKEN_PREFIX}${randomToken(24)}`
  return {
    secret,
    hash: sha256(secret),
    prefix: secret.slice(0, 16),
  }
}
