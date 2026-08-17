import { describe, expect, it } from 'vitest'
import { gupshupPayload } from '../src/server/providers'

/**
 * Gupshup's wire format.
 *
 * Form-encoded with a JSON string nested inside one field, which is easy to
 * get subtly wrong and rejected opaquely when you do. These assertions pin the
 * shape so a refactor cannot quietly stop reset codes being delivered.
 */
const base = {
  appName: 'leadaistudio',
  source: '918585999679',
  to: '+91 98421 15933',
  text: 'fallback text',
}

describe('gupshup template payload', () => {
  it('sends the template id and positional params', () => {
    const body = gupshupPayload({
      ...base,
      templateId: 'a1b2c3d4-0000-0000-0000-000000000000',
      variables: { '1': '123456' },
    })

    expect(body.get('channel')).toBe('whatsapp')
    expect(body.get('src.name')).toBe('leadaistudio')
    expect(JSON.parse(body.get('template')!)).toEqual({
      id: 'a1b2c3d4-0000-0000-0000-000000000000',
      params: ['123456'],
    })
  })

  it('strips everything but digits from both numbers', () => {
    const body = gupshupPayload({ ...base, templateId: 't', variables: { '1': '123456' } })

    expect(body.get('destination')).toBe('919842115933')
    expect(body.get('source')).toBe('918585999679')
  })

  it('orders params by their template slot, not by insertion', () => {
    const body = gupshupPayload({
      ...base,
      templateId: 't',
      variables: { '2': 'second', '1': 'first' },
    })

    expect(JSON.parse(body.get('template')!).params).toEqual(['first', 'second'])
  })

  it('falls back to a session message when no template is named', () => {
    const body = gupshupPayload(base)

    expect(body.get('template')).toBeNull()
    expect(JSON.parse(body.get('message')!)).toEqual({ type: 'text', text: 'fallback text' })
  })

  it('form-encodes rather than nesting raw JSON in the body', () => {
    const encoded = gupshupPayload({ ...base, templateId: 't', variables: { '1': '123456' } }).toString()

    expect(encoded).toContain('src.name=leadaistudio')
    expect(encoded).toContain('channel=whatsapp')
    // The JSON must arrive percent-encoded inside the form field.
    expect(encoded).toContain('template=%7B')
  })
})
