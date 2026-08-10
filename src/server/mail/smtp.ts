import nodemailer from 'nodemailer'
import { z } from 'zod'
import { prisma } from '@/server/db/prisma'
import { decryptSecret, encryptSecret } from '@/server/crypto'
import { emailProvider } from '@/server/providers'
import type { EmailMessage, EmailProvider, SendResult } from '@/server/providers/types'

/**
 * The school's own mailbox.
 *
 * A school that already has mail at its own domain should send from that
 * address, not from ours: a fee reminder arriving from a stranger's domain
 * gets deleted or reported. So the credentials live per tenant and the
 * transport is resolved per tenant at send time.
 *
 * Credentials are stored in the `Setting` table under the `email` namespace,
 * with the password encrypted at rest (AES-256-GCM, key derived from
 * AUTH_SECRET). The password is never sent back to a browser — the settings
 * form receives a masked placeholder and only writes a new value when the
 * administrator actually types one.
 */

export const SETTINGS_NAMESPACE = 'email'
export const SETTINGS_KEY = 'smtp'

export const smtpSchema = z.object({
  enabled: z.coerce.boolean().default(false),
  host: z.string().trim().min(1, 'Enter the SMTP server address').max(200),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  // Implicit TLS on 465; STARTTLS on 587 and 25. Naming it "secure" matches
  // what every mail provider's help page calls it.
  secure: z.coerce.boolean().default(false),
  username: z.string().trim().max(200).optional(),
  password: z.string().max(400).optional(),
  fromName: z.string().trim().min(1, 'Enter the sender name').max(120),
  fromEmail: z.string().trim().email('Enter a valid sender address'),
  replyTo: z.union([z.string().trim().email('Enter a valid reply-to address'), z.literal('')]).optional(),
})

export type SmtpInput = z.infer<typeof smtpSchema>

/** What is safe to hand to a browser: everything except the password. */
export type SmtpSettings = {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  username: string | null
  hasPassword: boolean
  fromName: string
  fromEmail: string
  replyTo: string | null
  verifiedAt: string | null
  lastError: string | null
}

type StoredSmtp = Omit<SmtpSettings, 'hasPassword'> & { passwordEncrypted: string | null }

async function readStored(tenantId: string): Promise<StoredSmtp | null> {
  const row = await prisma.setting.findUnique({
    where: {
      tenantId_namespace_key: {
        tenantId,
        namespace: SETTINGS_NAMESPACE,
        key: SETTINGS_KEY,
      },
    },
    select: { value: true },
  })
  return (row?.value as StoredSmtp | undefined) ?? null
}

export async function getSmtpSettings(tenantId: string): Promise<SmtpSettings | null> {
  const stored = await readStored(tenantId)
  if (!stored) return null

  const { passwordEncrypted, ...rest } = stored
  return { ...rest, hasPassword: !!passwordEncrypted }
}

export async function saveSmtpSettings(
  tenantId: string,
  input: SmtpInput,
): Promise<SmtpSettings> {
  const existing = await readStored(tenantId)

  // An empty password field means "leave it alone", not "clear it" — the form
  // never received the old value to send back.
  const passwordEncrypted = input.password
    ? encryptSecret(input.password)
    : (existing?.passwordEncrypted ?? null)

  const value: StoredSmtp = {
    enabled: input.enabled,
    host: input.host,
    port: input.port,
    secure: input.secure,
    username: input.username || null,
    passwordEncrypted,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    replyTo: input.replyTo || null,
    // Any change invalidates the previous proof that it works.
    verifiedAt: null,
    lastError: null,
  }

  await prisma.setting.upsert({
    where: {
      tenantId_namespace_key: { tenantId, namespace: SETTINGS_NAMESPACE, key: SETTINGS_KEY },
    },
    create: {
      tenantId,
      namespace: SETTINGS_NAMESPACE,
      key: SETTINGS_KEY,
      value: value as never,
      isSecret: true,
    },
    update: { value: value as never, isSecret: true },
  })

  const { passwordEncrypted: _omit, ...rest } = value
  return { ...rest, hasPassword: !!passwordEncrypted }
}

export async function clearSmtpSettings(tenantId: string): Promise<void> {
  await prisma.setting.deleteMany({
    where: { tenantId, namespace: SETTINGS_NAMESPACE, key: SETTINGS_KEY },
  })
}

async function recordOutcome(tenantId: string, patch: Partial<StoredSmtp>): Promise<void> {
  const stored = await readStored(tenantId)
  if (!stored) return
  await prisma.setting.update({
    where: {
      tenantId_namespace_key: { tenantId, namespace: SETTINGS_NAMESPACE, key: SETTINGS_KEY },
    },
    data: { value: { ...stored, ...patch } as never },
  })
}

function transportFor(stored: StoredSmtp) {
  return nodemailer.createTransport({
    host: stored.host,
    port: stored.port,
    secure: stored.secure,
    auth:
      stored.username && stored.passwordEncrypted
        ? { user: stored.username, pass: decryptSecret(stored.passwordEncrypted) }
        : undefined,
    // A school's mail server is not worth waiting on forever; a request that
    // hangs here would hold a page open.
    connectionTimeout: 12_000,
    greetingTimeout: 8_000,
    socketTimeout: 20_000,
  })
}

/**
 * Opens a connection, authenticates, and sends one message — proving the
 * settings work before an administrator trusts them with a fee reminder.
 */
export async function verifySmtp(
  tenantId: string,
  testRecipient: string,
): Promise<{ ok: boolean; message: string }> {
  const stored = await readStored(tenantId)
  if (!stored) return { ok: false, message: 'No mail server has been configured yet.' }

  try {
    const transport = transportFor(stored)
    await transport.verify()
    await transport.sendMail({
      from: `"${stored.fromName}" <${stored.fromEmail}>`,
      to: testRecipient,
      subject: 'SchoolOS test message',
      text: 'Your school mailbox is connected. This message was sent from SchoolOS to confirm the settings work.',
      html: '<p>Your school mailbox is connected.</p><p>This message was sent from SchoolOS to confirm the settings work.</p>',
    })

    await recordOutcome(tenantId, { verifiedAt: new Date().toISOString(), lastError: null })
    return { ok: true, message: `Test message sent to ${testRecipient}.` }
  } catch (error) {
    const message = describe(error)
    await recordOutcome(tenantId, { verifiedAt: null, lastError: message })
    return { ok: false, message }
  }
}

/**
 * The provider outbound mail should use for this tenant.
 *
 * Falls back to the platform provider when a school has not connected its own
 * mailbox, so the notification pipeline behaves identically either way and no
 * caller has to know which is in play.
 */
export async function tenantEmailProvider(tenantId: string): Promise<EmailProvider> {
  const stored = await readStored(tenantId)
  if (!stored || !stored.enabled) return emailProvider()

  return {
    name: `smtp:${stored.host}`,
    async send(message: EmailMessage): Promise<SendResult> {
      try {
        const info = await transportFor(stored).sendMail({
          from: `"${stored.fromName}" <${stored.fromEmail}>`,
          to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
          replyTo: message.replyTo ?? stored.replyTo ?? undefined,
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: message.attachments?.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
        })
        return { ok: true, providerMessageId: info.messageId }
      } catch (error) {
        const description = describe(error)
        // Recorded so a school sees a failing mail server on the settings
        // page rather than discovering it through unanswered reminders.
        await recordOutcome(tenantId, { lastError: description })
        return { ok: false, error: description }
      }
    },
  }
}

/** Turns a mail library error into something an administrator can act on. */
function describe(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const code = (error as { code?: string })?.code

  if (code === 'EAUTH') return 'The server rejected the username or password.'
  if (code === 'ECONNREFUSED') return 'The server refused the connection. Check the host and port.'
  if (code === 'ETIMEDOUT' || code === 'ESOCKET') {
    return 'The connection timed out. Check the host, the port, and whether TLS is required.'
  }
  if (code === 'EDNS' || raw.includes('getaddrinfo')) return 'That server address could not be found.'
  return raw.slice(0, 300)
}
