import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EmailProvider } from '@/server/providers/types'

/**
 * The HTTPS mail route.
 *
 * It exists because most hosts block outbound SMTP, so on those deployments
 * this is the only path a password reset or a website enquiry can take. The
 * request shape is worth pinning: `reply_to` under the wrong key is accepted
 * and ignored, which would break replying to an enquiry without failing
 * anything, and an attachment sent as raw bytes rather than base64 is rejected
 * only at the point somebody emails a receipt.
 */

let emailProvider: () => EmailProvider

beforeAll(async () => {
  // env() caches on first read, so this has to be set before the module graph
  // that reads it is imported.
  process.env.EMAIL_DRIVER = 'resend'
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.EMAIL_FROM = 'MyCampusView <contact@mycampusview.com>'
  ;({ emailProvider } = await import('@/server/providers'))
})

afterEach(() => vi.unstubAllGlobals())

/** Captures the outgoing request and answers with `response`. */
function stubFetch(response: { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: () => Promise.resolve(response.body),
    } as Response)
  })
  return calls
}

const MESSAGE = {
  to: 'contact@mycampusview.com',
  replyTo: 'anita@sunrise.edu.in',
  subject: 'Demo request — Sunrise International School',
  html: '<p>An enquiry</p>',
  text: 'An enquiry',
}

describe('the Resend HTTPS provider', () => {
  it('is chosen over SMTP when a key is set', () => {
    expect(emailProvider().name).toBe('resend_api')
  })

  it('sends the message the way the REST API expects it', async () => {
    const calls = stubFetch({ status: 200, body: { id: 'abc-123' } })

    const result = await emailProvider().send(MESSAGE)

    expect(result).toEqual({ ok: true, providerMessageId: 'abc-123' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.resend.com/emails')

    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer re_test_key')

    const body = JSON.parse(calls[0].init.body as string)
    expect(body).toMatchObject({
      from: 'MyCampusView <contact@mycampusview.com>',
      to: ['contact@mycampusview.com'],
      // Snake case, not the Node SDK's replyTo — sent camelCase it is dropped
      // silently and every reply goes to the sender instead of the enquirer.
      reply_to: 'anita@sunrise.edu.in',
      subject: MESSAGE.subject,
      html: MESSAGE.html,
      text: MESSAGE.text,
    })
    expect(body.replyTo).toBeUndefined()
  })

  it('base64-encodes attachments', async () => {
    const calls = stubFetch({ status: 200, body: { id: 'abc-123' } })

    await emailProvider().send({
      ...MESSAGE,
      attachments: [
        { filename: 'receipt.pdf', content: Buffer.from('hello'), contentType: 'application/pdf' },
      ],
    })

    expect(JSON.parse(calls[0].init.body as string).attachments).toEqual([
      { filename: 'receipt.pdf', content: Buffer.from('hello').toString('base64'), content_type: 'application/pdf' },
    ])
  })

  it('reports why the provider refused, rather than throwing', async () => {
    stubFetch({ status: 403, body: { message: 'The mycampusview.com domain is not verified.' } })

    await expect(emailProvider().send(MESSAGE)).resolves.toEqual({
      ok: false,
      error: 'The mycampusview.com domain is not verified.',
    })
  })

  it('survives a network failure without throwing', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('fetch failed')))

    await expect(emailProvider().send(MESSAGE)).resolves.toEqual({
      ok: false,
      error: 'fetch failed',
    })
  })
})
