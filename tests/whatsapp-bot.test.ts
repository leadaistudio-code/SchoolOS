import { describe, expect, it } from 'vitest'
import { feesText, interpret, menuText, parseInbound } from '@/lib/whatsapp-bot'
import { createHmac } from 'node:crypto'
import { gupshupEndpoint } from '@/server/providers'
import { metaSignatureValid } from '@/server/messaging/meta-signature'

describe('inbound WhatsApp payloads', () => {
  it('reads Gupshup messages', () => {
    const msg = parseInbound({
      app: 'school',
      type: 'message',
      payload: { id: 'x', source: '919876543210', type: 'text', payload: { text: ' Hi ' }, sender: { phone: '919876543210', name: 'Ravi' } },
    })
    expect(msg).toEqual({ from: '919876543210', text: 'Hi', name: 'Ravi' })
  })

  it('reads Meta Cloud messages and button replies', () => {
    const wrap = (m: object) => ({ entry: [{ changes: [{ value: { contacts: [{ profile: { name: 'Asha' } }], messages: [m] } }] }] })
    expect(parseInbound(wrap({ from: '919876543210', type: 'text', text: { body: '1' } }))).toEqual({ from: '919876543210', text: '1', name: 'Asha' })
    expect(parseInbound(wrap({ from: '919876543210', type: 'interactive', interactive: { button_reply: { title: 'Fees' } } }))?.text).toBe('Fees')
  })

  it('reads Twilio form posts', () => {
    expect(parseInbound({ From: 'whatsapp:+919876543210', Body: 'fees', ProfileName: 'K' })).toEqual({ from: 'whatsapp:+919876543210', text: 'fees', name: 'K' })
  })

  it('ignores delivery receipts and status callbacks', () => {
    expect(parseInbound({ type: 'message-event', payload: { type: 'delivered' } })).toBeNull()
    expect(parseInbound({ entry: [{ changes: [{ value: { statuses: [{ status: 'read' }] } }] }] })).toBeNull()
    expect(parseInbound(null)).toBeNull()
  })
})

describe('menu interpretation', () => {
  it('maps numbers and words to the same choice', () => {
    expect(interpret('1', null)).toEqual({ kind: 'fees' })
    expect(interpret('how much fee is pending?', null)).toEqual({ kind: 'fees' })
    expect(interpret('Hello', null)).toEqual({ kind: 'menu' })
    expect(interpret('3', null)).toEqual({ kind: 'attendance' })
    expect(interpret('banana', null)).toEqual({ kind: 'unknown' })
  })

  it('treats the next message as a note for the office after option 6', () => {
    expect(interpret('1', 'QUERY')).toEqual({ kind: 'message', text: '1' })
    expect(interpret('cancel', 'QUERY')).toEqual({ kind: 'stop' })
  })

  it('treats a number as a list pick while choosing a child', () => {
    expect(interpret('2', 'CHILD')).toEqual({ kind: 'pick', index: 1 })
  })

  it('only offers "switch child" to parents with more than one', () => {
    expect(menuText('S', 'A', false)).not.toContain('Switch child')
    expect(menuText('S', 'A', true)).toContain('Switch child')
  })

  it('totals dues and marks overdue ones', () => {
    const t = feesText('Aarav', {
      invoices: [
        { title: 'Tuition', dueOn: '10 Sep', balanceMinor: 300000, overdue: true },
        { title: 'Transport', dueOn: '10 Oct', balanceMinor: 100000, overdue: false },
      ],
      payLink: 'https://school',
    })
    expect(t).toContain('₹4,000')
    expect(t).toContain('Overdue: ₹3,000')
    expect(t).toContain('https://school')
    expect(feesText('Aarav', { invoices: [], payLink: null })).toContain('no fees due')
  })
})

describe('Meta webhook signature', () => {
  it('accepts only bodies signed with the app secret', () => {
    const body = '{"entry":[]}'
    const good = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`
    expect(metaSignatureValid(body, good, 'app-secret')).toBe(true)
    expect(metaSignatureValid(`${body} `, good, 'app-secret')).toBe(false)
    expect(metaSignatureValid(body, good, 'other')).toBe(false)
    expect(metaSignatureValid(body, null, 'app-secret')).toBe(false)
    expect(metaSignatureValid(body, good, undefined)).toBe(false)
  })
})

describe('Gupshup endpoint', () => {
  it('sends free text to /msg and templates to /template/msg', () => {
    const configured = 'https://api.gupshup.io/wa/api/v1/template/msg'
    expect(gupshupEndpoint(configured, true)).toBe(configured)
    expect(gupshupEndpoint(configured, false)).toBe('https://api.gupshup.io/wa/api/v1/msg')
    expect(gupshupEndpoint('https://api.gupshup.io/wa/api/v1/msg', false)).toBe('https://api.gupshup.io/wa/api/v1/msg')
  })
})
