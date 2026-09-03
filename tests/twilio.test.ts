import { describe, expect, it } from 'vitest'
import {
  twilioAddress,
  twilioFromWhatsApp,
  twilioMessageForm,
  twilioWhatsAppAddress,
} from '../src/server/providers/twilio'

describe('twilioMessageForm', () => {
  it('builds a plain SMS body', () => {
    const form = twilioMessageForm({
      from: '+14155550100',
      to: '+919876543210',
      body: 'Fee due tomorrow',
    })
    expect(form.get('From')).toBe('+14155550100')
    expect(form.get('To')).toBe('+919876543210')
    expect(form.get('Body')).toBe('Fee due tomorrow')
  })

  it('builds a WhatsApp template with content variables', () => {
    const form = twilioMessageForm({
      from: 'whatsapp:+14155238886',
      to: 'whatsapp:+919876543210',
      contentSid: 'HXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      contentVariables: { '1': '482910' },
    })
    expect(form.get('ContentSid')).toBe('HXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(form.get('ContentVariables')).toBe('{"1":"482910"}')
  })

  it('uses a messaging service when provided', () => {
    const form = twilioMessageForm({
      from: '+14155550100',
      to: '+919876543210',
      body: 'Hello',
      messagingServiceSid: 'MGaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })
    expect(form.get('MessagingServiceSid')).toBe('MGaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(form.get('From')).toBeNull()
  })
})

describe('twilio addresses', () => {
  it('normalises E.164', () => {
    expect(twilioAddress('919876543210')).toBe('+919876543210')
    expect(twilioAddress('+91 98765 43210')).toBe('+919876543210')
  })

  it('prefixes whatsapp', () => {
    expect(twilioWhatsAppAddress('+919876543210')).toBe('whatsapp:+919876543210')
    expect(twilioFromWhatsApp('14155238886')).toBe('whatsapp:+14155238886')
  })
})
