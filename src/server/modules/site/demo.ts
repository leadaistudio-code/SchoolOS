import { z } from 'zod'
import { prisma } from '@/server/db/prisma'
import { audit } from '@/server/audit'
import { env } from '@/lib/env'
import { CONTACT } from '@/content/site/company'
import {
  CONTACT_PREFERENCE_OPTIONS,
  INTEREST_OPTIONS,
  SCHOOL_TYPE_OPTIONS,
  SIZE_OPTIONS,
  optionLabel,
  optionValues,
} from '@/content/site/demo-options'
import { emailProvider } from '@/server/providers'

/**
 * Demo requests from the public website.
 *
 * Stored as a Job on the `sales` queue rather than in a bespoke table. The row
 * is durable, carries its payload, and is already the mechanism the product
 * uses for work that has to survive a restart — so a request is never lost
 * because an email provider was unreachable when it arrived.
 *
 * There is no tenant on these rows: an enquiry arrives before a school exists.
 */
export const demoRequestSchema = z.object({
  name: z.string().trim().min(2, 'Please tell us your name').max(120),
  email: z.string().trim().email('Please check this email address').max(180),
  phone: z.string().trim().min(6, 'Please include a phone number').max(30),
  school: z.string().trim().min(2, 'Please tell us the name of your school').max(180),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  // The four selects are validated against the same lists the form renders, so
  // an option added to one is accepted by the other without a second edit.
  schoolType: z.enum(optionValues(SCHOOL_TYPE_OPTIONS)),
  size: z.enum(optionValues(SIZE_OPTIONS)),
  interest: z.enum(optionValues(INTEREST_OPTIONS)),
  contactPreference: z.enum(optionValues(CONTACT_PREFERENCE_OPTIONS)),
  message: z.string().trim().max(4000).optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Please confirm we may contact you' }),
  }),
  // Honeypot. Accepted by the schema on purpose: rejecting it here would tell
  // an automated submitter which field gave it away. The route discards the
  // request quietly instead.
  website: z.string().max(200).optional(),
})

export type DemoRequestInput = z.infer<typeof demoRequestSchema>

export type DemoRequestMeta = {
  ip: string | null
  userAgent: string | null
  referer: string | null
}

export async function recordDemoRequest(input: DemoRequestInput, meta: DemoRequestMeta) {
  const job = await prisma.job.create({
    data: {
      tenantId: null,
      queue: 'sales',
      name: 'demo.request',
      payload: {
        ...input,
        receivedAt: new Date().toISOString(),
        ip: meta.ip,
        userAgent: meta.userAgent,
        referer: meta.referer,
      } as never,
    },
    select: { id: true },
  })

  await audit({
    tenantId: null,
    actorLabel: input.email,
    action: 'site.demo.request',
    module: 'marketing',
    entityType: 'Job',
    entityId: job.id,
    summary: `Demo requested by ${input.school} (${input.schoolType.toLowerCase().replaceAll('_', ' ')})`,
  })

  return job
}

/* ------------------------------------------------------------ the enquiry */

/** Where enquiries land. The published address unless a deployment overrides it. */
export function salesInbox(): string {
  return env().SALES_INBOX || CONTACT.sales
}

/**
 * Waiting on a mail server is the slow part of this request, and the Job row
 * above is already the durable copy — so the send is given a short leash and
 * the visitor gets their confirmation either way.
 */
const SEND_TIMEOUT_MS = 9_000

/**
 * Emails the enquiry to the sales inbox.
 *
 * Never throws. The enquiry is safe in the database before this runs, so a
 * mail server that is down, misconfigured or simply absent must not turn a
 * captured lead into an error on the visitor's screen. What happened is
 * written back onto the Job row instead, where it can be found later.
 *
 * Reply-To is the person who filled the form, so answering the notification
 * answers them — the one thing you want to do on reading it.
 */
export async function emailDemoRequest(
  input: DemoRequestInput,
  meta: DemoRequestMeta,
  jobId: string,
): Promise<void> {
  const to = salesInbox()
  const provider = emailProvider()

  // The log driver reports success for everything it is handed. Recording that
  // as a delivered enquiry would be a lie on the day it matters most.
  if (provider.name === 'log') {
    await recordSend(jobId, {
      notified: false,
      to,
      reason: 'No mail provider is configured (EMAIL_DRIVER=log).',
    })
    console.warn(
      `[site] demo request from ${input.school} was not emailed: EMAIL_DRIVER is "log". ` +
        `Set EMAIL_DRIVER=smtp and SMTP_URL to deliver enquiries to ${to}.`,
    )
    return
  }

  try {
    const result = await withTimeout(
      provider.send({ to, replyTo: input.email, ...composeDemoEmail(input, meta) }),
      SEND_TIMEOUT_MS,
    )

    await recordSend(jobId, {
      notified: result.ok,
      to,
      provider: provider.name,
      providerMessageId: result.providerMessageId ?? null,
      reason: result.ok ? undefined : result.error,
    })

    if (!result.ok) {
      console.error('[site] demo request email failed', { jobId, error: result.error })
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error('[site] demo request email failed', { jobId, reason })
    await recordSend(jobId, { notified: false, to, reason })
  }
}

type SendOutcome = {
  notified: boolean
  to?: string
  provider?: string
  providerMessageId?: string | null
  reason?: string
}

/**
 * Writes the outcome onto the Job without touching its status: the row means
 * "an enquiry nobody has called back yet", which sending an email does not
 * change. `lastError` is set on failure so an undelivered one is findable.
 */
async function recordSend(jobId: string, outcome: SendOutcome): Promise<void> {
  try {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        result: { ...outcome, at: new Date().toISOString() } as never,
        lastError: outcome.notified ? null : (outcome.reason ?? 'The enquiry email was not sent.'),
      },
    })
  } catch (error) {
    // The enquiry itself is already stored; failing to annotate it is not
    // worth propagating to the visitor.
    console.error('[site] could not record the demo email outcome', error)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error('The mail server did not respond in time.')), ms),
    ),
  ])
}

/* -------------------------------------------------------------- composing */

/**
 * The enquiry as an email. Exported so `npm run mail:doctor` sends the real
 * thing rather than a lookalike — a test message that differs from the article
 * proves the wrong thing.
 */
export function composeDemoEmail(
  input: DemoRequestInput,
  meta: DemoRequestMeta,
): { subject: string; text: string; html: string } {
  return {
    subject: demoSubject(input),
    text: demoText(input, meta),
    html: demoHtml(input, meta),
  }
}

function demoSubject(input: DemoRequestInput): string {
  const where = input.city?.trim()
  return `Demo request — ${input.school}${where ? `, ${where}` : ''}`
}

/** Fields in the order they matter on a callback, not the order of the form. */
function fields(input: DemoRequestInput, meta: DemoRequestMeta): [string, string][] {
  const place = [input.city?.trim(), input.country?.trim()].filter(Boolean).join(', ')

  const rows: [string, string][] = [
    ['School', input.school],
    ['Type', optionLabel(SCHOOL_TYPE_OPTIONS, input.schoolType)],
    ['Students', optionLabel(SIZE_OPTIONS, input.size)],
    ['Location', place],
    ['Contact', input.name],
    ['Email', input.email],
    ['Phone', input.phone],
    ['Prefers', optionLabel(CONTACT_PREFERENCE_OPTIONS, input.contactPreference)],
    ['Interested in', optionLabel(INTEREST_OPTIONS, input.interest)],
    ['Received', receivedAt()],
    ['Came from', meta.referer ?? ''],
  ]

  return rows.filter(([, value]) => Boolean(value))
}

/** Readable rather than ISO, and stamped with the zone so it is unambiguous. */
function receivedAt(): string {
  const formatted = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date())
  return `${formatted} IST`
}

function demoText(input: DemoRequestInput, meta: DemoRequestMeta): string {
  const lines = fields(input, meta).map(([label, value]) => `${label.padEnd(14)}${value}`)

  return [
    `${input.name} at ${input.school} has asked for a demonstration.`,
    '',
    ...lines,
    ...(input.message ? ['', 'They wrote:', input.message] : []),
    '',
    `Reply to this email to answer ${input.name} directly.`,
  ].join('\n')
}

function demoHtml(input: DemoRequestInput, meta: DemoRequestMeta): string {
  const rows = fields(input, meta)
    .map(
      ([label, value]) =>
        '<tr>' +
        `<td style="padding:6px 16px 6px 0;color:#6b7791;font-size:13px;white-space:nowrap;vertical-align:top">${esc(label)}</td>` +
        `<td style="padding:6px 0;color:#0a1024;font-size:14px">${linkify(label, value)}</td>` +
        '</tr>',
    )
    .join('')

  const note = input.message
    ? '<p style="margin:20px 0 6px;color:#6b7791;font-size:13px">They wrote</p>' +
      `<p style="margin:0;padding:12px 14px;background:#f6f5f2;border-left:3px solid #6c4bf4;color:#0a1024;font-size:14px;line-height:1.55;white-space:pre-wrap">${esc(input.message)}</p>`
    : ''

  return (
    `<div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;color:#0a1024">` +
    '<p style="margin:0 0 18px;font-size:16px;line-height:1.5">' +
    `<strong>${esc(input.name)}</strong> at <strong>${esc(input.school)}</strong> has asked for a demonstration.` +
    '</p>' +
    `<table style="border-collapse:collapse">${rows}</table>` +
    note +
    '<p style="margin:22px 0 0;color:#6b7791;font-size:13px">' +
    `Reply to this email to answer ${esc(input.name)} directly.` +
    '</p>' +
    '</div>'
  )
}

/** The two fields worth one tap on a phone. */
function linkify(label: string, value: string): string {
  if (label === 'Email') {
    return `<a href="mailto:${esc(value)}" style="color:#6c4bf4">${esc(value)}</a>`
  }
  if (label === 'Phone') {
    return `<a href="tel:${esc(value.replace(/[^\d+]/g, ''))}" style="color:#6c4bf4">${esc(value)}</a>`
  }
  return esc(value)
}

/** Visitor-supplied text goes into HTML; it is escaped, without exception. */
function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
