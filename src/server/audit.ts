import { prisma } from '@/server/db/prisma'
import { requestMeta } from '@/server/auth/session'

export type AuditInput = {
  tenantId: string | null
  actorId?: string | null
  actorLabel?: string | null
  action: string
  module: string
  entityType?: string
  entityId?: string
  summary?: string
  before?: unknown
  after?: unknown
}

const REDACTED = '[redacted]'
const SENSITIVE_FIELDS = new Set([
  'passwordHash',
  'password',
  'mfaSecret',
  'tokenHash',
  'providerSignature',
  'bankAccount',
])

function scrub(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value ?? null
  if (Array.isArray(value)) return value.map(scrub)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_FIELDS.has(k) ? REDACTED : scrub(v)
  }
  return out
}

/**
 * Writes an audit entry. Never throws into the caller: losing an audit row is
 * bad, but failing a fee collection because the audit write failed is worse.
 * Failures are logged so they surface in monitoring.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const meta = await requestMeta().catch(() => ({ ip: null, userAgent: null }))
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? null,
        action: input.action,
        module: input.module,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        before: scrub(input.before) as never,
        after: scrub(input.after) as never,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    })
  } catch (err) {
    console.error('[audit] failed to write audit entry', {
      action: input.action,
      module: input.module,
      err,
    })
  }
}
