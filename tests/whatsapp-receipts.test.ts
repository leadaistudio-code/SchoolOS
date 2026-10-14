import { describe, expect, it, vi } from 'vitest'
import {
  aisensyPayload,
  classifyAiSensyFailure,
  classifyMetaFailure,
  consentIntent,
  maskNumber,
  metaTemplatePayload,
  nextOutboxStatus,
  parseAiSensyWebhook,
  parseMetaWebhook,
  receiptLinkKey,
  receiptParams,
  signReceiptToken,
  toWhatsAppNumber,
  verifyReceiptToken,
} from '../src/server/modules/whatsapp-receipts/pure'
import {
  aiSensyProvider,
  AISENSY_ENDPOINT,
  dryRunProvider,
  liveSendAllowed,
  metaCloudApiProvider,
  type FetchLike,
} from '../src/server/modules/whatsapp-receipts/providers'

const MESSAGE = { to: '919876543210', params: ['Aarav Sharma', '₹12,300', 'RCT-1', '14 Oct 2026'], linkToken: 'tok', linkUrl: 'https://demo.example/r/tok', userName: 'Priya Sharma' }

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('whatsapp receipts: numbers and message content', () => {
  it('normalises Indian and international numbers, and rejects partial ones', () => {
    expect(toWhatsAppNumber('98765 43210')).toBe('919876543210')
    expect(toWhatsAppNumber('+91 98765-43210')).toBe('919876543210')
    expect(toWhatsAppNumber('09876543210')).toBe('919876543210')
    expect(toWhatsAppNumber('0091 98765 43210')).toBe('919876543210')
    expect(toWhatsAppNumber('+44 7700 900123')).toBe('447700900123')
    expect(toWhatsAppNumber('12345')).toBeNull()
    expect(toWhatsAppNumber('')).toBeNull()
    expect(toWhatsAppNumber(null)).toBeNull()
    expect(maskNumber('919876543210')).toBe('+91 ******3210')
  })

  it('fills the template with the student, amount, receipt number and IST date', () => {
    const params = receiptParams({
      studentName: 'Aarav\n  Sharma',
      amountMinor: 1_230_050,
      currency: 'INR',
      receiptNumber: 'RCT/2026-27/00042',
      paidOn: new Date('2026-10-13T20:00:00.000Z'),
    })
    expect(params).toEqual(['Aarav Sharma', '₹12,300.50', 'RCT/2026-27/00042', '14 Oct 2026'])
    expect(receiptParams({ studentName: 'A B', amountMinor: 1_230_000, currency: 'INR', receiptNumber: 'R', paidOn: new Date() })[1]).toBe('₹12,300')
  })

  it('builds the Meta template request with four body parameters and the link as the button suffix', () => {
    const body = metaTemplatePayload({ to: '919876543210', templateName: 'fee_receipt', language: 'en', params: MESSAGE.params, linkToken: 'abc.def.ghi' })
    expect(body.type).toBe('template')
    expect(body.template.name).toBe('fee_receipt')
    expect(body.template.components[0]).toEqual({ type: 'body', parameters: MESSAGE.params.map((text) => ({ type: 'text', text })) })
    expect(body.template.components[1]).toEqual({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'abc.def.ghi' }] })
  })

  it('builds the AiSensy request with the full link as the fifth parameter', () => {
    const body = aisensyPayload({ apiKey: 'k', campaignName: 'fee_receipts', to: '919876543210', userName: 'Priya', params: MESSAGE.params, linkUrl: MESSAGE.linkUrl })
    expect(body.destination).toBe('919876543210')
    expect(body.templateParams).toEqual([...MESSAGE.params, MESSAGE.linkUrl])
  })
})

describe('whatsapp receipts: failures and statuses', () => {
  it('retries throttling and outages but not bad requests', () => {
    expect(classifyMetaFailure(500, null).retryable).toBe(true)
    expect(classifyMetaFailure(429, null).retryable).toBe(true)
    expect(classifyMetaFailure(400, { error: { code: 131048, title: 'Spam rate limit hit' } })).toMatchObject({ retryable: true, code: 'meta_131048' })
    expect(classifyMetaFailure(400, { error: { code: 132001, title: 'Template name does not exist' } })).toMatchObject({ retryable: false, code: 'meta_132001' })
    expect(classifyMetaFailure(401, { error: { code: 190, message: 'Invalid OAuth access token' } }).retryable).toBe(false)
    expect(classifyAiSensyFailure(400, { message: 'Campaign not live' })).toMatchObject({ retryable: false })
    expect(classifyAiSensyFailure(502, null).retryable).toBe(true)
  })

  it('only moves delivery status forward, whatever order callbacks arrive in', () => {
    expect(nextOutboxStatus('SENT', 'delivered')).toBe('DELIVERED')
    expect(nextOutboxStatus('DELIVERED', 'read')).toBe('READ')
    expect(nextOutboxStatus('SENT', 'read')).toBe('READ')
    expect(nextOutboxStatus('READ', 'delivered')).toBeNull()
    expect(nextOutboxStatus('DELIVERED', 'sent')).toBeNull()
    expect(nextOutboxStatus('SENT', 'failed')).toBe('DEAD')
    expect(nextOutboxStatus('READ', 'failed')).toBeNull()
    expect(nextOutboxStatus('SKIPPED', 'read')).toBeNull()
    expect(nextOutboxStatus('QUEUED', 'delivered')).toBeNull()
  })

  it('reads STOP and START replies, and nothing else', () => {
    expect(consentIntent(' STOP ')).toBe('opt_out')
    expect(consentIntent('Unsubscribe')).toBe('opt_out')
    expect(consentIntent('start')).toBe('opt_in')
    expect(consentIntent('please stop the bus at 7')).toBeNull()
  })
})

describe('whatsapp receipts: webhook payload validation', () => {
  const meta = (phoneNumberId: string, statuses: unknown[], messages: unknown[] = []) => ({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: phoneNumberId }, statuses, messages } }] }],
  })

  it('reads Meta statuses and STOP replies for the school number only', () => {
    const parsed = parseMetaWebhook(
      meta('111', [
        { id: 'wamid.A', status: 'delivered', timestamp: '1760400000', recipient_id: '919876543210' },
        { id: 'wamid.B', status: 'failed', timestamp: '1760400001', errors: [{ code: 131026, title: 'Undeliverable' }] },
        { id: 'wamid.C', status: 'deleted', timestamp: '1' },
        { status: 'read' },
      ], [{ from: '919876543210', id: 'wamid.in', type: 'text', text: { body: 'STOP' } }]),
      '111',
    )
    expect(parsed?.statuses).toEqual([
      { messageId: 'wamid.A', status: 'delivered', at: new Date(1_760_400_000_000) },
      { messageId: 'wamid.B', status: 'failed', at: new Date(1_760_400_001_000), errorCode: 'meta_131026' },
    ])
    expect(parsed?.replies).toEqual([{ from: '919876543210', text: 'STOP' }])
    expect(parseMetaWebhook(meta('222', [{ id: 'wamid.A', status: 'read', timestamp: '1' }]), '111')?.statuses).toEqual([])
  })

  it('rejects bodies that are not WhatsApp Business webhooks', () => {
    expect(parseMetaWebhook(null, '111')).toBeNull()
    expect(parseMetaWebhook({ object: 'page', entry: [] }, '111')).toBeNull()
    expect(parseMetaWebhook({ object: 'whatsapp_business_account', entry: 'x' }, '111')).toBeNull()
  })

  it('reads the AiSensy shapes it knows and ignores anything else', () => {
    expect(parseAiSensyWebhook({ messageId: 'ais-1', status: 'Delivered', timestamp: 1760400000 })?.statuses).toEqual([
      { messageId: 'ais-1', status: 'delivered', at: new Date(1_760_400_000_000) },
    ])
    expect(parseAiSensyWebhook({ event: 'message.status.update', data: { value: { statuses: [{ id: 'wamid.X', status: 'read', timestamp: '1760400000' }] } } })?.statuses[0])
      .toMatchObject({ messageId: 'wamid.X', status: 'read' })
    expect(parseAiSensyWebhook({ messageId: 'ais-1', status: 'enqueued' })).toBeNull()
    expect(parseAiSensyWebhook({ hello: 'world' })).toBeNull()
    expect(parseAiSensyWebhook('STOP')).toBeNull()
  })
})

describe('whatsapp receipts: signed receipt links', () => {
  const key = receiptLinkKey('test-auth-secret-that-is-long-enough')
  const expiresAt = new Date('2026-10-21T00:00:00.000Z')
  const token = signReceiptToken({ tenantId: 'tenant_a', receiptId: 'cmreceipt0001abcdefgh', expiresAt }, key)
  const before = new Date('2026-10-20T00:00:00.000Z')

  it('accepts its own token until it expires', () => {
    expect(verifyReceiptToken(token, 'tenant_a', key, before)).toEqual({ ok: true, receiptId: 'cmreceipt0001abcdefgh', expiresAt })
    expect(verifyReceiptToken(token, 'tenant_a', key, new Date('2026-10-21T00:00:01.000Z'))).toEqual({ ok: false, reason: 'expired' })
  })

  it('cannot be moved to another school, receipt or expiry, or signed with another key', () => {
    const [id, exp, sig] = token.split('.') as [string, string, string]
    expect(verifyReceiptToken(token, 'tenant_b', key, before)).toEqual({ ok: false, reason: 'bad_signature' })
    expect(verifyReceiptToken(`cmreceipt0002abcdefgh.${exp}.${sig}`, 'tenant_a', key, before)).toEqual({ ok: false, reason: 'bad_signature' })
    expect(verifyReceiptToken(`${id}.${(parseInt(exp, 36) + 86_400).toString(36)}.${sig}`, 'tenant_a', key, before)).toEqual({ ok: false, reason: 'bad_signature' })
    expect(verifyReceiptToken(token, 'tenant_a', receiptLinkKey('another-secret-another-secret'), before)).toEqual({ ok: false, reason: 'bad_signature' })
    expect(verifyReceiptToken('not-a-token', 'tenant_a', key, before)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyReceiptToken(`../etc.${exp}.${sig}`, 'tenant_a', key, before)).toEqual({ ok: false, reason: 'malformed' })
  })
})

describe('whatsapp receipts: providers (mocked HTTP)', () => {
  const metaCfg = { phoneNumberId: '1234567890', accessToken: 'secret-token', templateName: 'fee_receipt', language: 'en', apiVersion: 'v21.0' }

  it('Meta: sends the template with the bearer token and returns the message id', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, { messages: [{ id: 'wamid.OK' }] }))
    const result = await metaCloudApiProvider(metaCfg, fetchImpl).send(MESSAGE)
    expect(result).toEqual({ ok: true, messageId: 'wamid.OK' })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer secret-token')
    expect(JSON.parse(String(init.body)).template.name).toBe('fee_receipt')
  })

  it('Meta: a rejected template is final; a network error is retried', async () => {
    const rejected = await metaCloudApiProvider(metaCfg, async () => jsonResponse(400, { error: { code: 132001, title: 'Template name does not exist' } })).send(MESSAGE)
    expect(rejected).toMatchObject({ ok: false, retryable: false, code: 'meta_132001' })
    const offline = await metaCloudApiProvider(metaCfg, async () => { throw new TypeError('fetch failed') }).send(MESSAGE)
    expect(offline).toMatchObject({ ok: false, retryable: true, code: 'network' })
    // The error text never carries the token.
    expect(JSON.stringify([rejected, offline])).not.toContain('secret-token')
  })

  it('AiSensy: posts the campaign and treats success:false as a failure', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, { success: 'true', submitted_message_id: 'ais-9' }))
    expect(await aiSensyProvider({ apiKey: 'k', campaignName: 'fee_receipts' }, fetchImpl).send(MESSAGE)).toEqual({ ok: true, messageId: 'ais-9' })
    expect(fetchImpl.mock.calls[0]![0]).toBe(AISENSY_ENDPOINT)
    const refused = await aiSensyProvider({ apiKey: 'k', campaignName: 'x' }, async () => jsonResponse(200, { success: false, message: 'Campaign not found' })).send(MESSAGE)
    expect(refused).toMatchObject({ ok: false, retryable: false })
  })

  it('the dry-run provider never makes a request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const result = await dryRunProvider().send(MESSAGE)
    expect(result.ok && result.messageId?.startsWith('dryrun_')).toBe(true)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('sends for real only from production, outside tests, without dry-run', () => {
    expect(liveSendAllowed({ nodeEnv: 'production', vitest: undefined, dryRun: false })).toBe(true)
    expect(liveSendAllowed({ nodeEnv: 'production', vitest: undefined, dryRun: true })).toBe(false)
    expect(liveSendAllowed({ nodeEnv: 'production', vitest: 'true', dryRun: false })).toBe(false)
    expect(liveSendAllowed({ nodeEnv: 'development', vitest: undefined, dryRun: false })).toBe(false)
    expect(liveSendAllowed({ nodeEnv: 'test', vitest: undefined, dryRun: false })).toBe(false)
  })
})
