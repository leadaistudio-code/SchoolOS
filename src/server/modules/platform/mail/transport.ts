import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import type Mail from 'nodemailer/lib/mailer'
import { ImapFlow } from 'imapflow'
import { decryptSecret } from '@/server/crypto'
import { env } from '@/lib/env'

/** The subset of a PlatformMailbox row the transport needs. */
export type MailboxConnection = {
  username: string
  passwordEncrypted: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  sendVia: string
  resendKeyEncrypted: string | null
  fromEmail: string
  imapEnabled: boolean
  imapHost: string
  imapPort: number
  sentFolder: string | null
}

function smtpTransport(box: MailboxConnection) {
  return nodemailer.createTransport({
    host: box.smtpHost,
    port: box.smtpPort,
    secure: box.smtpSecure,
    auth: { user: box.username, pass: decryptSecret(box.passwordEncrypted) },
    connectionTimeout: 12_000,
    greetingTimeout: 8_000,
    socketTimeout: 30_000,
  })
}

export function imapClient(box: MailboxConnection) {
  return new ImapFlow({
    host: box.imapHost,
    port: box.imapPort,
    secure: true,
    auth: { user: box.username, pass: decryptSecret(box.passwordEncrypted) },
    // imapflow logs every command by default, including the LOGIN line.
    logger: false,
    connectionTimeout: 12_000,
    greetingTimeout: 8_000,
    socketTimeout: 30_000,
    disableAutoIdle: true,
  })
}

const SENT_NAMES = /^(inbox[./])?(sent|sent items|sent messages|sent mail)$/i

async function findSentFolder(client: ImapFlow): Promise<string | null> {
  const boxes = await client.list()
  const special = boxes.find((b) => b.specialUse === '\\Sent')
  if (special) return special.path
  return boxes.find((b) => SENT_NAMES.test(b.path))?.path ?? null
}

/* ------------------------------------------------------------------ resend */

const RESEND_API = 'https://api.resend.com'

function resendKey(box: MailboxConnection): string | null {
  if (box.resendKeyEncrypted) return decryptSecret(box.resendKeyEncrypted)
  return env().RESEND_API_KEY ?? null
}

export function usesResend(box: Pick<MailboxConnection, 'sendVia'>): boolean {
  return box.sendVia === 'RESEND'
}

class ResendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind?: string,
  ) {
    super(message)
  }
}

async function resendRequest<T>(key: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${RESEND_API}${path}`, {
    method: init?.method ?? 'GET',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const body = (await response.json().catch(() => null)) as (T & { message?: string; name?: string }) | null
  if (!response.ok) {
    throw new ResendError(body?.message ?? `Resend returned ${response.status}`, response.status, body?.name)
  }
  return body as T
}

function addressList(value: Mail.Options['to']): string[] {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  return list.map((a) => (typeof a === 'string' ? a : a.name ? `${a.name} <${a.address}>` : a.address))
}

/**
 * Resend's HTTPS API. Port 443 is open on every host, including the Railway
 * plans that drop outbound SMTP. The From address stays the mailbox's own,
 * which Resend accepts once its domain is verified there.
 */
async function sendOverResend(box: MailboxConnection, mail: OutgoingMail): Promise<{ messageId: string }> {
  const key = resendKey(box)
  if (!key) throw new ResendError('Add the Resend API key for this mailbox under Mail → Mailbox.', 401)
  const from = mail.from && typeof mail.from === 'object' && 'address' in mail.from ? mail.from : null
  const headers: Record<string, string> = {}
  if (mail.headers && !Array.isArray(mail.headers)) {
    for (const [key, value] of Object.entries(mail.headers)) {
      if (typeof value === 'string') headers[key] = value
    }
  }
  if (mail.inReplyTo) headers['In-Reply-To'] = String(mail.inReplyTo)
  if (mail.references) headers.References = Array.isArray(mail.references) ? mail.references.join(' ') : String(mail.references)
  const result = await resendRequest<{ id: string }>(key, '/emails', {
    method: 'POST',
    body: {
      from: from?.name ? `${from.name.replace(/["<>]/g, '')} <${from.address}>` : (from?.address ?? box.fromEmail),
      to: addressList(mail.to),
      cc: addressList(mail.cc),
      bcc: addressList(mail.bcc),
      // Snake case: this is the REST endpoint, not the Node SDK.
      reply_to: mail.replyTo ? addressList(mail.replyTo as Mail.Options['to']) : undefined,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: Object.keys(headers).length ? headers : undefined,
      attachments: (mail.attachments ?? []).map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : Buffer.from(String(a.content ?? '')).toString('base64'),
        content_type: a.contentType,
      })),
    },
  })
  return { messageId: mail.messageId || result.id }
}

/** Checks the key, and that the sending domain is verified in Resend. */
async function verifyResend(box: MailboxConnection): Promise<string | null> {
  const key = resendKey(box)
  if (!key) return 'Add the Resend API key for this mailbox.'
  const domain = box.fromEmail.split('@')[1]?.toLowerCase() ?? ''
  try {
    const { data } = await resendRequest<{ data: { name: string; status: string }[] }>(key, '/domains')
    const match = data.find((d) => d.name.toLowerCase() === domain)
    if (!match) return `${domain} is not added in Resend yet. Add it under Resend → Domains, then add the DNS records it shows in Hostinger.`
    if (match.status !== 'verified') {
      return `${domain} is added in Resend but not verified yet (status: ${match.status}). Add the DNS records Resend shows to Hostinger → DNS Zone, then press Verify in Resend.`
    }
    return null
  } catch (error) {
    // A "sending access" key may not list domains; it can still send.
    if (error instanceof ResendError && error.kind === 'restricted_api_key') return null
    return describeMailError(error)
  }
}

/** Sends through whichever path the mailbox is set to use. */
export async function deliverMail(box: MailboxConnection, mail: OutgoingMail): Promise<{ messageId: string }> {
  return usesResend(box) ? sendOverResend(box, mail) : sendOverSmtp(box, mail)
}

/** Proves the sending path and, when enabled, the IMAP login and Sent folder. */
export async function verifyMailbox(
  box: MailboxConnection,
): Promise<{ ok: true; sentFolder: string | null } | { ok: false; error: string }> {
  if (usesResend(box)) {
    const problem = await verifyResend(box)
    if (problem) return { ok: false, error: `Sending (Resend): ${problem}` }
  } else {
    try {
      await smtpTransport(box).verify()
    } catch (error) {
      return { ok: false, error: `Sending (SMTP): ${describeMailError(error)}` }
    }
  }
  if (!box.imapEnabled) return { ok: true, sentFolder: null }

  const client = imapClient(box)
  try {
    await client.connect()
    const sentFolder = await findSentFolder(client)
    if (!sentFolder) {
      return { ok: false, error: 'Signed in over IMAP, but no Sent folder was found in this mailbox.' }
    }
    return { ok: true, sentFolder }
  } catch (error) {
    return { ok: false, error: `Saving to Sent (IMAP): ${describeMailError(error)}` }
  } finally {
    await client.logout().catch(() => undefined)
  }
}

export type OutgoingMail = Mail.Options & { messageId: string; date: Date }

/** Sends over SMTP. The Message-ID is set by the caller so the Sent copy matches. */
export async function sendOverSmtp(box: MailboxConnection, mail: OutgoingMail): Promise<{ messageId: string }> {
  const info = await smtpTransport(box).sendMail(mail)
  return { messageId: info.messageId || mail.messageId }
}

/**
 * Appends the sent message to the mailbox's Sent folder, so it shows up in
 * Hostinger webmail and on the phone exactly as if it had been sent there.
 * Bcc is kept in this copy only — it never travels to the recipients.
 */
export async function saveToSentFolder(
  box: MailboxConnection,
  mail: OutgoingMail,
): Promise<{ ok: true; folder: string } | { ok: false; error: string }> {
  const composer = new MailComposer(mail)
  const message = composer.compile()
  message.keepBcc = true
  const raw = await message.build()

  const client = imapClient(box)
  try {
    await client.connect()
    const folder = box.sentFolder || (await findSentFolder(client))
    if (!folder) return { ok: false, error: 'No Sent folder was found in the mailbox.' }
    await client.append(folder, raw, ['\\Seen'], mail.date)
    return { ok: true, folder }
  } catch (error) {
    return { ok: false, error: describeMailError(error) }
  } finally {
    await client.logout().catch(() => undefined)
  }
}

/** Turns a mail library error into something an operator can act on. Never echoes credentials. */
export function describeMailError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const code = (error as { code?: string })?.code
  const authFailed = (error as { authenticationFailed?: boolean })?.authenticationFailed

  if (error instanceof ResendError) {
    if (error.status === 401 || error.status === 403) {
      return /domain/i.test(raw) ? raw : 'Resend rejected the API key. Create a new key in Resend → API Keys and save it here.'
    }
    if (error.status === 422 && /domain/i.test(raw)) return `${raw} Verify the domain in Resend → Domains.`
    if (error.status === 429) return 'Resend’s sending limit was reached. Wait a minute, or check your Resend plan’s daily limit.'
    return raw.slice(0, 300)
  }
  if ((error as { name?: string })?.name === 'TimeoutError') return 'Resend did not answer in time. Try again.'
  if (code === 'EAUTH' || authFailed || /authenticat|invalid credentials|login failed/i.test(raw)) {
    return 'The mail server rejected the email address or password. Use the mailbox password set in Hostinger hPanel.'
  }
  if (code === 'ECONNREFUSED') return 'The server refused the connection. Check the server name and port.'
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'ECONNECTION' || /timed? ?out/i.test(raw)) {
    return 'The connection timed out. Check the server name, the port and the SSL setting. If the app is hosted on Railway below the Pro plan, email ports are blocked — switch “How emails are sent” to Resend.'
  }
  if (code === 'EDNS' || code === 'ENOTFOUND' || raw.includes('getaddrinfo')) {
    return 'That server address could not be found.'
  }
  if (code === 'EENVELOPE') return 'One of the recipient addresses was rejected by the mail server.'
  if (code === 'EMESSAGE' && /size|too large/i.test(raw)) {
    return 'The message is too large for the mail server. Remove an attachment and try again.'
  }
  return raw.slice(0, 300)
}
