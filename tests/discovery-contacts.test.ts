import { afterEach, describe, expect, it, vi } from 'vitest'

const dns = vi.hoisted(() => ({ map: {} as Record<string, string> }))
vi.mock('node:dns/promises', () => ({
  lookup: async (host: string) => [{ address: dns.map[host] ?? '93.184.216.34', family: 4 }],
}))

import {
  extractEmails,
  extractPhones,
  nameMatchScore,
  normalizeIndianPhone,
  overallContactConfidence,
} from '@/lib/lead-discovery'
import { findSchoolContacts, mergeFindings, rankFindings } from '@/server/modules/platform/growth/discovery/contacts'
import type { LeadDiscoveryProvider } from '@/server/modules/platform/growth/discovery/provider'

describe('contact parsing', () => {
  it('normalises Indian mobiles and landlines', () => {
    expect(normalizeIndianPhone('+91 95600 64222')).toBe('+91 95600 64222')
    expect(normalizeIndianPhone('09560064222')).toBe('+91 95600 64222')
    expect(normalizeIndianPhone('0129 228 0522')).toBe('+91 129 228 0522')
    expect(normalizeIndianPhone('+91 0129-4197200')).toBe('+91 129 419 7200')
    expect(normalizeIndianPhone('+91-129-4197222')).toBe('+91 129 419 7222')
    expect(normalizeIndianPhone('121007')).toBeNull()
    expect(normalizeIndianPhone('9999999999')).toBeNull()
  })

  it('reads labelled or prefixed numbers and skips pin codes and years', () => {
    const text =
      'Sector 14, Faridabad, Haryana 121007 · Est. 2026 · Phone: 9098991000 · +91-129-4197222 · Reg No 1234567890123'
    expect(extractPhones(text)).toEqual(['+91 90989 91000', '+91 129 419 7222'])
  })

  it('reads emails and drops junk addresses', () => {
    const text = 'Email: Info@MRIS.edu.in, counsellor.mris14@mris. … logo@2x.png noreply@school.in user@example.com'
    expect(extractEmails(text)).toEqual(['info@mris.edu.in'])
    expect(extractEmails('thetakshshilaschoolsec85[at]gmail[dot]com')).toEqual(['thetakshshilaschoolsec85@gmail.com'])
    expect(extractEmails('office (at) school.in')).toEqual(['office@school.in'])
  })

  it('matches school names on their distinctive words', () => {
    expect(nameMatchScore('Manav Rachna International School', 'Manav Rachna International School')).toBe(1)
    expect(nameMatchScore('Delhi Public School', 'Delhi Public School - Greater Faridabad')).toBe(1)
    expect(nameMatchScore('Manav Rachna International School', 'Modern Delhi International School')).toBe(0)
  })
})

describe('ranking findings', () => {
  it('prefers the strongest source and rewards agreement between sources', () => {
    const ranked = rankFindings([
      { field: 'phone', value: '+91 95600 64222', confidence: 86, source: 'GOOGLE_MAPS', url: 'https://maps.google.com/?cid=1' },
      { field: 'phone', value: '+91 95600 64222', confidence: 62, source: 'DIRECTORY', url: 'https://www.justdial.com/x' },
      { field: 'phone', value: '+91 129 419 7200', confidence: 55, source: 'SEARCH_RESULT', url: 'https://news.example/x' },
      { field: 'email', value: 'hr@mris.edu.in', confidence: 90, source: 'OFFICIAL_WEBSITE', url: 'https://mris.edu.in' },
      { field: 'email', value: 'info@mris.edu.in', confidence: 90, source: 'OFFICIAL_WEBSITE', url: 'https://mris.edu.in' },
    ])
    expect(ranked.phone).toMatchObject({ value: '+91 95600 64222', confidence: 94, source: 'GOOGLE_MAPS', corroboratedBy: 1 })
    expect(ranked.otherPhones.map((p) => p.value)).toEqual(['+91 129 419 7200'])
    expect(ranked.email?.value).toBe('info@mris.edu.in')
    expect(overallContactConfidence(ranked)).toBe(Math.round((94 + 90 + 0) / 3))
  })

  it('keeps the stronger value when a school is searched again', () => {
    const base = { version: 1 as const, checkedAt: '', address: null, website: null, otherEmails: [], otherPhones: [], sourcesChecked: [] }
    const strong = { value: '+91 95600 64222', confidence: 90, source: 'GOOGLE_MAPS' as const, url: null, corroboratedBy: 0 }
    const weak = { value: '+91 98111 11111', confidence: 50, source: 'SEARCH_RESULT' as const, url: null, corroboratedBy: 0 }
    const merged = mergeFindings({ ...base, email: null, phone: strong }, { ...base, email: null, phone: weak })
    expect(merged.phone?.value).toBe('+91 95600 64222')
    expect(merged.otherPhones.map((p) => p.value)).toEqual(['+91 98111 11111'])
  })
})

describe('findSchoolContacts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    dns.map = {}
  })

  const provider = (website: string): LeadDiscoveryProvider => ({
    name: 'serper',
    async searchSchools() {
      return [
        {
          title: 'Contact Us - Sunrise Valley School Faridabad',
          url: `${website}/contact-us`,
          snippet: 'Sunrise Valley School · Phone: +91 98100 12345 · admissions@sunrisevalley.in',
        },
        { title: 'Some other school', url: 'https://other.example/x', snippet: 'Call 9812345678 other@other.example' },
      ]
    },
    async lookupPlaces() {
      return [
        {
          title: 'Sunrise Valley School',
          address: 'Plot 4, Sector 88, Faridabad, Haryana 121002',
          phone: '098100 12345',
          website,
          category: 'CBSE School',
          mapsUrl: 'https://maps.google.com/?cid=42',
        },
      ]
    },
  })

  it('combines Maps, search and the school website with sources and confidence', async () => {
    const pages: string[] = []
    vi.stubGlobal('fetch', async (url: URL | string) => {
      pages.push(String(url))
      const html = String(url).includes('contact')
        ? '<a href="mailto:info@sunrisevalley.in">Mail</a><a href="tel:+911294000111">Call</a>'
        : '<html><a href="/contact-us">Contact</a><p>Welcome</p></html>'
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
    })

    const { findings, queries } = await findSchoolContacts(provider('https://sunrisevalley.in'), {
      schoolName: 'Sunrise Valley School',
      sector: 'Sector 88',
      city: 'Faridabad',
      state: 'Haryana',
    })

    expect(queries).toBe(2)
    expect(findings.sourcesChecked).toEqual(['Google Maps', 'Contact search', 'School website'])
    expect(findings.phone).toMatchObject({ value: '+91 98100 12345', source: 'GOOGLE_MAPS', corroboratedBy: 1 })
    expect(findings.phone!.confidence).toBeGreaterThanOrEqual(90)
    expect(findings.address).toMatchObject({ value: 'Plot 4, Sector 88, Faridabad, Haryana 121002', source: 'GOOGLE_MAPS' })
    expect(findings.email?.value).toMatch(/@sunrisevalley\.in$/)
    expect(findings.email!.confidence).toBeGreaterThanOrEqual(85)
    expect(findings.website?.value).toBe('https://sunrisevalley.in')
    expect([...findings.otherEmails, ...findings.otherPhones].map((f) => f.value)).not.toContain('other@other.example')
    expect(findings.otherPhones.map((p) => p.value)).toContain('+91 129 400 0111')
    expect(pages.some((p) => p.endsWith('/contact-us'))).toBe(true)
  })

  it('never fetches a website that resolves to a private address', async () => {
    dns.map['intranet.sunrise.in'] = '10.0.0.5'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { findings } = await findSchoolContacts(provider('https://intranet.sunrise.in'), {
      schoolName: 'Sunrise Valley School',
      city: 'Faridabad',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(findings.phone?.value).toBe('+91 98100 12345')
  })
})
