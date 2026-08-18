import { describe, expect, it } from 'vitest'
import { composeDemoEmail, demoRequestSchema } from '@/server/modules/site/demo'
import { SCHOOL_TYPE_OPTIONS, SIZE_OPTIONS, optionLabel } from '@/content/site/demo-options'

/**
 * The enquiry email is the only thing that tells anyone a lead arrived, and
 * nobody reads it until a real one lands. These cover the two ways it could be
 * quietly wrong: stored codes printed instead of words, and visitor text going
 * into the HTML unescaped.
 */

const META = { ip: '203.0.113.4', userAgent: 'test', referer: 'https://mycampusview.com/book-demo' }

const INPUT = demoRequestSchema.parse({
  name: 'Anita Rao',
  email: 'anita@sunrise.edu.in',
  phone: '+91 98765 43210',
  school: 'Sunrise International School',
  city: 'Pune',
  country: 'India',
  schoolType: 'INTERNATIONAL_SCHOOL',
  size: '1000_3000',
  interest: 'FEES',
  contactPreference: 'WHATSAPP',
  message: 'We run fees on Tally and attendance on paper.',
  consent: true,
})

describe('the demo enquiry email', () => {
  it('names the school and the town in the subject', () => {
    expect(composeDemoEmail(INPUT, META).subject).toBe(
      'Demo request — Sunrise International School, Pune',
    )
  })

  it('prints the words the visitor saw, not the stored codes', () => {
    const { text, html } = composeDemoEmail(INPUT, META)

    for (const body of [text, html]) {
      expect(body).toContain(optionLabel(SCHOOL_TYPE_OPTIONS, 'INTERNATIONAL_SCHOOL'))
      expect(body).toContain(optionLabel(SIZE_OPTIONS, '1000_3000'))
      expect(body).not.toContain('INTERNATIONAL_SCHOOL')
      expect(body).not.toContain('1000_3000')
    }
  })

  it('carries the phone number and what they wrote', () => {
    const { text, html } = composeDemoEmail(INPUT, META)
    expect(text).toContain('+91 98765 43210')
    expect(html).toContain('href="tel:+919876543210"')
    expect(text).toContain('We run fees on Tally')
    expect(html).toContain('We run fees on Tally')
  })

  it('escapes visitor text before it reaches the HTML', () => {
    const hostile = demoRequestSchema.parse({
      ...INPUT,
      school: '<script>alert(1)</script>',
      message: 'Tom & Jerry <b>School</b>',
      consent: true,
    })

    const { html } = composeDemoEmail(hostile, META)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('Tom &amp; Jerry')
  })

  it('leaves out fields the visitor did not fill in', () => {
    const sparse = demoRequestSchema.parse({
      ...INPUT,
      city: '',
      country: '',
      message: '',
      consent: true,
    })

    const { subject, text, html } = composeDemoEmail(sparse, META)
    expect(subject).toBe('Demo request — Sunrise International School')
    expect(text).not.toContain('Location')
    expect(html).not.toContain('They wrote')
  })
})
