import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { env } from '@/lib/env'
import { decryptSecret, encryptSecret } from '@/server/crypto'
import { getSmtpSettings } from '@/server/mail/smtp'

export const NAMESPACE = 'integrations'

/**
 * Integrations.
 *
 * Two kinds of configuration meet on this screen and they are labelled apart
 * everywhere it shows. Platform-level drivers are chosen by whoever runs the
 * deployment and are read-only here — a school cannot switch the product's
 * SMS vendor. School-level credentials are the account *this* school holds
 * with that vendor, and those are editable.
 *
 * Secrets are encrypted at rest with the same helper the mail settings use,
 * and are never sent back to a browser: the form receives a "set / not set"
 * flag and only writes when somebody actually types a new value.
 */
export type IntegrationKind = 'sms' | 'whatsapp' | 'payment'

export const credentialSchema = z.object({
  kind: z.enum(['sms', 'whatsapp', 'payment']),
  accountId: z.string().trim().max(200).optional(),
  apiKey: z.string().max(400).optional(),
  apiSecret: z.string().max(400).optional(),
  senderId: z.string().trim().max(60).optional(),
  enabled: z.coerce.boolean().default(false),
})

type StoredCredential = {
  enabled: boolean
  accountId: string | null
  senderId: string | null
  apiKeyEncrypted: string | null
  apiSecretEncrypted: string | null
  updatedAt: string
}

/** What is safe to hand to a browser. */
export type CredentialView = {
  kind: IntegrationKind
  enabled: boolean
  accountId: string | null
  senderId: string | null
  hasApiKey: boolean
  hasApiSecret: boolean
  updatedAt: string | null
}

export type ProviderStatus = {
  key: string
  label: string
  driver: string
  /** Whether the deployment has enough configuration for this to actually work. */
  live: boolean
  detail: string
  /** Where a school can do something about it, if anywhere. */
  href?: string
}

function emptyView(kind: IntegrationKind): CredentialView {
  return {
    kind,
    enabled: false,
    accountId: null,
    senderId: null,
    hasApiKey: false,
    hasApiSecret: false,
    updatedAt: null,
  }
}

export async function listCredentials(ctx: AppContext): Promise<CredentialView[]> {
  ctx.require('settings.integrations')

  const rows = await ctx.db.setting.findMany({ where: { namespace: NAMESPACE } })
  const byKey = new Map(rows.map((r) => [r.key, r.value as unknown as StoredCredential]))

  return (['sms', 'whatsapp', 'payment'] as const).map((kind) => {
    const stored = byKey.get(kind)
    if (!stored) return emptyView(kind)
    return {
      kind,
      enabled: stored.enabled,
      accountId: stored.accountId,
      senderId: stored.senderId,
      hasApiKey: !!stored.apiKeyEncrypted,
      hasApiSecret: !!stored.apiSecretEncrypted,
      updatedAt: stored.updatedAt,
    }
  })
}

export async function saveCredential(ctx: AppContext, input: z.infer<typeof credentialSchema>) {
  ctx.require('settings.integrations')

  const row = await ctx.db.setting.findFirst({
    where: { namespace: NAMESPACE, key: input.kind },
  })
  const existing = (row?.value as unknown as StoredCredential | undefined) ?? null

  // A blank secret field means "leave it alone", not "clear it" — the form
  // never received the old value to send back.
  const value: StoredCredential = {
    enabled: input.enabled,
    accountId: input.accountId ?? existing?.accountId ?? null,
    senderId: input.senderId ?? existing?.senderId ?? null,
    apiKeyEncrypted: input.apiKey ? encryptSecret(input.apiKey) : (existing?.apiKeyEncrypted ?? null),
    apiSecretEncrypted: input.apiSecret
      ? encryptSecret(input.apiSecret)
      : (existing?.apiSecretEncrypted ?? null),
    updatedAt: new Date().toISOString(),
  }

  await ctx.db.setting.upsert({
    where: {
      tenantId_namespace_key: {
        tenantId: ctx.tenant.id,
        namespace: NAMESPACE,
        key: input.kind,
      },
    },
    create: {
      tenantId: ctx.tenant.id,
      namespace: NAMESPACE,
      key: input.kind,
      value: value as never,
      isSecret: true,
    },
    update: { value: value as never, isSecret: true },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'settings.integration.save',
    module: 'settings',
    entityType: 'Setting',
    entityId: input.kind,
    // Deliberately no `after`: the audit log must not become the place the
    // secrets leak from.
    summary: `Updated ${input.kind} integration credentials`,
  })
}

/** Reads a stored secret for server-side use. Never call this from a page. */
export async function readCredentialSecret(
  ctx: AppContext,
  kind: IntegrationKind,
): Promise<{ apiKey: string | null; apiSecret: string | null }> {
  const row = await ctx.db.setting.findFirst({ where: { namespace: NAMESPACE, key: kind } })
  const stored = (row?.value as unknown as StoredCredential | undefined) ?? null
  return {
    apiKey: stored?.apiKeyEncrypted ? decryptSecret(stored.apiKeyEncrypted) : null,
    apiSecret: stored?.apiSecretEncrypted ? decryptSecret(stored.apiSecretEncrypted) : null,
  }
}

/**
 * What the deployment is actually wired to.
 *
 * Read from the environment rather than from a settings table, because that
 * is where the running process reads it from — a status page that reports a
 * different source than the code uses is worse than no status page.
 */
export async function providerStatus(ctx: AppContext): Promise<ProviderStatus[]> {
  ctx.require('settings.integrations')

  const e = env()
  const smtp = await getSmtpSettings(ctx.tenant.id)

  return [
    {
      key: 'email',
      label: 'Email',
      driver: smtp?.enabled ? 'school SMTP' : e.EMAIL_DRIVER,
      live: !!smtp?.enabled || e.EMAIL_DRIVER !== 'log',
      detail: smtp?.enabled
        ? `Sending as ${smtp.fromEmail}`
        : e.EMAIL_DRIVER === 'log'
          ? 'Mail is written to the server log, not delivered'
          : 'Using the platform mail service',
      href: '/settings/email',
    },
    {
      key: 'sms',
      label: 'SMS',
      driver: e.SMS_DRIVER,
      live: e.SMS_DRIVER !== 'log',
      detail:
        e.SMS_DRIVER === 'log'
          ? 'Messages are written to the server log, not sent'
          : `Delivered through ${e.SMS_DRIVER}`,
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      driver: e.WHATSAPP_DRIVER,
      live: e.WHATSAPP_DRIVER !== 'log',
      detail:
        e.WHATSAPP_DRIVER === 'log'
          ? 'Messages are written to the server log, not sent'
          : `Delivered through ${e.WHATSAPP_DRIVER}`,
    },
    {
      key: 'payment',
      label: 'Payment gateway',
      driver: e.PAYMENT_DRIVER,
      live: e.PAYMENT_DRIVER !== 'mock' && !!e.PAYMENT_KEY_ID,
      detail:
        e.PAYMENT_DRIVER === 'mock'
          ? 'Online payments are simulated — nothing is charged'
          : e.PAYMENT_KEY_ID
            ? `Live through ${e.PAYMENT_DRIVER}`
            : `${e.PAYMENT_DRIVER} selected but no key is configured`,
    },
    {
      key: 'storage',
      label: 'File storage',
      driver: e.STORAGE_DRIVER,
      live: e.STORAGE_DRIVER === 's3',
      detail:
        e.STORAGE_DRIVER === 's3'
          ? 'Uploads go to object storage'
          : 'Uploads are kept on the application server',
    },
    {
      key: 'maps',
      label: 'Maps',
      driver: e.MAPS_DRIVER,
      live: e.MAPS_DRIVER !== 'none' && !!e.MAPS_API_KEY,
      detail:
        e.MAPS_DRIVER === 'none'
          ? 'Bus tracking shows coordinates without a map'
          : `Tiles from ${e.MAPS_DRIVER}`,
    },
    {
      key: 'ai',
      label: 'Assistant',
      driver: e.AI_DRIVER,
      live: e.AI_DRIVER !== 'none' && !!e.AI_API_KEY,
      detail:
        e.AI_DRIVER === 'none'
          ? 'The in-app assistant is switched off'
          : `Answering through ${e.AI_DRIVER}`,
    },
  ]
}
