import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Notices, alerts and daily summaries on Meta Cloud.
 *
 * Free-form text is accepted by Meta and then dropped unless the recipient
 * wrote in the last 24 hours, so with a notification template configured every
 * untemplated message must go through it - with parameters Meta will accept.
 * Nothing is sent: fetch is stubbed.
 */
const overrides = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/env')>()
  return { ...actual, env: () => ({ ...actual.env(), ...overrides.value }) }
})

const { notificationTemplateVariables, templateParam, NOTIFY_DETAIL_MAX, NOTIFY_TITLE_MAX } = await import('../src/server/messaging/notify-template')
const { sendParentMessage, whatsappMessageFor } = await import('../src/server/messaging/send')

const META = {
  WHATSAPP_DRIVER: 'meta_cloud',
  WHATSAPP_PHONE_NUMBER_ID: '1234567890',
  WHATSAPP_ACCESS_TOKEN: 'test-token',
  WHATSAPP_API_VERSION: 'v21.0',
  WHATSAPP_OTP_TEMPLATE_LANG: 'en',
  WHATSAPP_OTP_COPY_BUTTON: true,
  MESSAGING_WHATSAPP_FAILOVER_SMS: false,
}

/** Meta rejects parameters with line breaks, tabs or more than four spaces in a row. */
function acceptableParam(value: string) {
  return value.length > 0 && !/[\n\r\t]/.test(value) && !/ {5,}/.test(value)
}

describe('notification template parameters', () => {
  it('splits "title, blank line, body" into heading and details on one line', () => {
    const vars = notificationTemplateVariables('🌅 Good morning — Apni Pathshala Gurukulam\n\n👩‍🎓 Students: not marked yet\n📝 Not marked: Class 11 Arts\n\n🧑‍🏫 Staff: 0/12 in')
    expect(vars['1']).toBe('🌅 Good morning — Apni Pathshala Gurukulam')
    expect(vars['2']).toBe('👩‍🎓 Students: not marked yet · 📝 Not marked: Class 11 Arts · 🧑‍🏫 Staff: 0/12 in')
  })

  it('uses a leading "School name: " as the heading', () => {
    expect(notificationTemplateVariables('Greenwood High: Riya is at the gate.\nReason: fever.')).toEqual({
      '1': 'Greenwood High',
      '2': 'Riya is at the gate. · Reason: fever.',
    })
  })

  it('falls back to a generic heading', () => {
    expect(notificationTemplateVariables('School closed tomorrow due to rain')).toEqual({
      '1': 'Notification',
      '2': 'School closed tomorrow due to rain',
    })
  })

  it('never produces a parameter Meta would reject', () => {
    const inputs = ['', '   ', '\n\n\n', 'a\tb     c', `${'x'.repeat(200)}\n\n${'y '.repeat(2000)}`, 'Title\n\n\n\n   \n']
    for (const input of inputs) {
      const vars = notificationTemplateVariables(input)
      expect(acceptableParam(vars['1']), JSON.stringify(input)).toBe(true)
      expect(acceptableParam(vars['2']), JSON.stringify(input)).toBe(true)
      expect(vars['1'].length).toBeLessThanOrEqual(NOTIFY_TITLE_MAX)
      expect(vars['2'].length).toBeLessThanOrEqual(NOTIFY_DETAIL_MAX)
    }
  })

  it('shortens long text with an ellipsis', () => {
    const out = templateParam('word '.repeat(100), 20)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('choosing the notification template', () => {
  afterEach(() => {
    overrides.value = {}
  })

  it('leaves messages unchanged when no template is configured', () => {
    overrides.value = { WHATSAPP_NOTIFY_TEMPLATE: undefined }
    expect(whatsappMessageFor({ to: '+919000000001', body: 'Hi\n\nThere' }, 'meta_cloud')).toEqual({
      to: '+919000000001', body: 'Hi\n\nThere', templateName: undefined, variables: undefined,
    })
  })

  it('leaves messages with their own template alone', () => {
    overrides.value = { WHATSAPP_NOTIFY_TEMPLATE: 'school_update' }
    const msg = whatsappMessageFor({ to: '+919000000001', body: '123456 is your code', templateName: 'password_reset_otp', variables: { '1': '123456' } }, 'meta_cloud')
    expect(msg.templateName).toBe('password_reset_otp')
    expect(msg.variables).toEqual({ '1': '123456' })
    expect(msg.copyCodeButton).toBeUndefined()
  })

  it('applies only to Meta Cloud', () => {
    overrides.value = { WHATSAPP_NOTIFY_TEMPLATE: 'school_update' }
    expect(whatsappMessageFor({ to: '+919000000001', body: 'Hi' }, 'twilio').templateName).toBeUndefined()
    expect(whatsappMessageFor({ to: '+919000000001', body: 'Hi' }, 'gupshup').templateName).toBeUndefined()
  })

  it('wraps untemplated messages in the notification template', () => {
    overrides.value = { WHATSAPP_NOTIFY_TEMPLATE: 'school_update', WHATSAPP_NOTIFY_TEMPLATE_LANG: 'en_US' }
    expect(whatsappMessageFor({ to: '+919000000001', body: 'Holiday\n\nSchool is closed on Friday.' }, 'meta_cloud')).toEqual({
      to: '+919000000001',
      body: 'Holiday\n\nSchool is closed on Friday.',
      templateName: 'school_update',
      language: 'en_US',
      variables: { '1': 'Holiday', '2': 'School is closed on Friday.' },
      copyCodeButton: false,
    })
  })
})

describe('what reaches Meta', () => {
  const requests: { url: string; body: Record<string, unknown> }[] = []

  beforeEach(() => {
    requests.length = 0
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      requests.push({ url, body: JSON.parse(init.body) })
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    overrides.value = {}
  })

  it('sends a template with two body parameters and no button', async () => {
    overrides.value = { ...META, WHATSAPP_NOTIFY_TEMPLATE: 'school_update', WHATSAPP_NOTIFY_TEMPLATE_LANG: 'en' }
    const result = await sendParentMessage({ to: '+91 90000 00001', body: 'Absent today\n\nAarav was marked absent in Class 5A.' })

    expect(result).toMatchObject({ ok: true, channel: 'whatsapp', providerMessageId: 'wamid.test' })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toBe('https://graph.facebook.com/v21.0/1234567890/messages')
    expect(requests[0]!.body).toEqual({
      messaging_product: 'whatsapp',
      to: '919000000001',
      type: 'template',
      template: {
        name: 'school_update',
        language: { code: 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: 'Absent today' },
            { type: 'text', text: 'Aarav was marked absent in Class 5A.' },
          ],
        }],
      },
    })
  })

  it('still sends free-form text when no template is configured', async () => {
    overrides.value = { ...META, WHATSAPP_NOTIFY_TEMPLATE: undefined }
    await sendParentMessage({ to: '+919000000001', body: 'Hello' })
    expect(requests[0]!.body).toEqual({ messaging_product: 'whatsapp', to: '919000000001', type: 'text', text: { body: 'Hello' } })
  })

  it('keeps the copy-code button on one-time codes', async () => {
    overrides.value = { ...META, WHATSAPP_NOTIFY_TEMPLATE: 'school_update' }
    await sendParentMessage({ to: '+919000000001', body: '123456 is your code', templateName: 'password_reset_otp', variables: { '1': '123456' } })
    const template = requests[0]!.body.template as { name: string; components: { type: string }[] }
    expect(template.name).toBe('password_reset_otp')
    expect(template.components.map((c) => c.type)).toEqual(['body', 'button'])
  })
})
