import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import {
  emailPreference,
  extractEmails,
  extractPhones,
  hostOf,
  isDirectoryHost,
  isOfficialCandidateHost,
  nameMatchScore,
  normalizeIndianPhone,
  type ContactFinding,
  type ContactFindings,
  type ContactSource,
} from '@/lib/lead-discovery'
import type { LeadDiscoveryProvider, PlaceHit, SearchHit } from './provider'

export type ContactLookupInput = {
  schoolName: string
  branchName?: string | null
  sector?: string | null
  area?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  website?: string | null
  /** Values the discovery step already read out of news/search text. */
  seedEmail?: string | null
  seedPhone?: string | null
  seedAddress?: string | null
  /** Hits from the discovery search, scanned for contact details too. */
  hits?: SearchHit[]
}

type Raw = { field: 'email' | 'phone' | 'address' | 'website'; value: string; confidence: number; source: ContactSource; url: string | null }

const PAGE_TIMEOUT_MS = 7_000
const MAX_PAGE_BYTES = 1_500_000
const MAX_PAGES = 3

/* ------------------------------------------------------------ safe fetching */

function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase()
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:') || v === '::'
  }
  const [a = 0, b = 0] = ip.split('.').map(Number)
  return (
    a === 10 || a === 127 || a === 0 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

/** Only public http(s) hosts on default ports; resolves DNS to block internal targets. */
async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only web addresses')
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('Non-standard port')
  if (url.username || url.password) throw new Error('Credentials in URL')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Internal host')
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address)
  if (ips.length === 0 || ips.some(isPrivateAddress)) throw new Error('Internal address')
  return url
}

async function fetchPage(raw: string): Promise<{ url: string; html: string } | null> {
  let current = raw
  for (let hop = 0; hop < 4; hop++) {
    const url = await assertPublicUrl(current)
    const res = await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; MyCampusViewBot/1.0; +https://www.mycampusview.com)',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    })
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location')
      if (!next) return null
      current = new URL(next, url).toString()
      continue
    }
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null
    const reader = res.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let size = 0
    while (size < MAX_PAGE_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.byteLength
    }
    await reader.cancel().catch(() => {})
    return { url: url.toString(), html: Buffer.concat(chunks).toString('utf8') }
  }
  return null
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#64;|&commat;/g, '@')
    .replace(/[ \t]+/g, ' ')
}

/** Contact details the page publishes in schema.org JSON-LD. */
function jsonLdContacts(html: string): { email?: string; phone?: string; address?: string } {
  const out: { email?: string; phone?: string; address?: string } = {}
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown
    try {
      data = JSON.parse(m[1]!.trim())
    } catch {
      continue
    }
    const stack: unknown[] = [data]
    while (stack.length) {
      const node = stack.pop()
      if (!node || typeof node !== 'object') continue
      if (Array.isArray(node)) {
        stack.push(...node)
        continue
      }
      const o = node as Record<string, unknown>
      if (!out.email && typeof o.email === 'string') out.email = o.email.replace(/^mailto:/i, '')
      if (!out.phone && typeof o.telephone === 'string') out.phone = o.telephone
      const addr = o.address
      if (!out.address && addr && typeof addr === 'object' && !Array.isArray(addr)) {
        const a = addr as Record<string, unknown>
        const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode]
          .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p) => p.trim())
        if (parts.length >= 2) out.address = parts.join(', ')
      } else if (!out.address && typeof addr === 'string' && addr.length > 10) {
        out.address = addr
      }
      stack.push(...Object.values(o).filter((v) => v && typeof v === 'object'))
    }
  }
  return out
}

function contactLinks(html: string, base: string): string[] {
  const links: string[] = []
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1]!
    const label = m[2]!.replace(/<[^>]+>/g, ' ')
    if (!/contact|reach[\s-]?us|get[\s-]?in[\s-]?touch/i.test(`${href} ${label}`)) continue
    try {
      const url = new URL(href, base)
      if (hostOf(url.toString()) === hostOf(base) && !links.includes(url.toString())) links.push(url.toString())
    } catch {
      /* ignore bad links */
    }
  }
  return links
}

async function scanWebsite(website: string): Promise<Raw[]> {
  const out: Raw[] = []
  const siteHost = hostOf(website)
  if (!siteHost) return out
  const home = await fetchPage(website).catch(() => null)
  const origin = new URL(home?.url ?? website).origin
  const extra = home ? contactLinks(home.html, home.url) : []
  const queue = [...extra, `${origin}/contact-us`, `${origin}/contact`].filter((u) => u !== home?.url)
  const pages = home ? [home] : []
  const fetched = await Promise.all(
    [...new Set(queue)].slice(0, MAX_PAGES - pages.length).map((u) => fetchPage(u).catch(() => null)),
  )
  pages.push(...fetched.filter((p): p is { url: string; html: string } => !!p))

  for (const page of pages) {
    const ld = jsonLdContacts(page.html)
    for (const email of extractEmails(ld.email ?? '')) {
      out.push({ field: 'email', value: email, confidence: 92, source: 'OFFICIAL_WEBSITE', url: page.url })
    }
    if (ld.phone) {
      const p = normalizeIndianPhone(ld.phone)
      if (p) out.push({ field: 'phone', value: p, confidence: 90, source: 'OFFICIAL_WEBSITE', url: page.url })
    }
    if (ld.address) out.push({ field: 'address', value: ld.address, confidence: 85, source: 'OFFICIAL_WEBSITE', url: page.url })

    for (const m of page.html.matchAll(/href=["']mailto:([^"'?]+)/gi)) {
      for (const email of extractEmails(decodeURIComponent(m[1]!))) {
        out.push({ field: 'email', value: email, confidence: email.endsWith(`@${siteHost}`) ? 92 : 82, source: 'OFFICIAL_WEBSITE', url: page.url })
      }
    }
    for (const m of page.html.matchAll(/href=["']tel:([^"']+)/gi)) {
      const p = normalizeIndianPhone(decodeURIComponent(m[1]!))
      if (p) out.push({ field: 'phone', value: p, confidence: 88, source: 'OFFICIAL_WEBSITE', url: page.url })
    }
    const text = htmlToText(page.html)
    for (const email of extractEmails(text)) {
      out.push({ field: 'email', value: email, confidence: email.endsWith(`@${siteHost}`) ? 90 : 78, source: 'OFFICIAL_WEBSITE', url: page.url })
    }
    for (const p of extractPhones(text)) {
      out.push({ field: 'phone', value: p, confidence: 82, source: 'OFFICIAL_WEBSITE', url: page.url })
    }
  }
  return out
}

/* ------------------------------------------------------------ other sources */

function bestPlace(input: ContactLookupInput, places: PlaceHit[]): { place: PlaceHit; match: number } | null {
  const city = (input.city ?? '').toLowerCase()
  const locality = [input.sector, input.area, input.branchName].filter(Boolean).map((s) => s!.toLowerCase())
  let best: { place: PlaceHit; match: number } | null = null
  for (const place of places) {
    let match = nameMatchScore(input.schoolName, place.title)
    if (match < 0.6) continue
    const addr = (place.address ?? '').toLowerCase()
    if (city && addr && !addr.includes(city.replace(/^greater\s+/, ''))) continue
    if (locality.some((l) => addr.includes(l) || place.title.toLowerCase().includes(l))) match = Math.min(1, match + 0.15)
    if (!best || match > best.match) best = { place, match }
  }
  return best
}

function fromPlace(input: ContactLookupInput, places: PlaceHit[]): Raw[] {
  const hit = bestPlace(input, places)
  if (!hit) return []
  const penalty = Math.round((1 - hit.match) * 40)
  const out: Raw[] = []
  const url = hit.place.mapsUrl
  const phone = hit.place.phone ? normalizeIndianPhone(hit.place.phone) : null
  if (phone) out.push({ field: 'phone', value: phone, confidence: 86 - penalty, source: 'GOOGLE_MAPS', url })
  if (hit.place.address && hit.place.address.length > 8) {
    out.push({ field: 'address', value: hit.place.address, confidence: 90 - penalty, source: 'GOOGLE_MAPS', url })
  }
  if (hit.place.website && isOfficialCandidateHost(hit.place.website)) {
    out.push({ field: 'website', value: hit.place.website, confidence: 85 - penalty, source: 'GOOGLE_MAPS', url })
  }
  return out
}

function fromSnippets(input: ContactLookupInput, hits: SearchHit[], website: string | null): Raw[] {
  const out: Raw[] = []
  const siteHost = hostOf(website)
  for (const hit of hits) {
    const text = `${hit.title} · ${hit.snippet}`
    const host = hostOf(hit.url)
    const official = !!siteHost && host === siteHost
    const relevant = official || nameMatchScore(input.schoolName, hit.title) >= 0.6
    if (!relevant) continue
    const source: ContactSource = official ? 'OFFICIAL_WEBSITE' : isDirectoryHost(hit.url) ? 'DIRECTORY' : 'SEARCH_RESULT'
    const base = official ? 80 : source === 'DIRECTORY' ? 62 : 55
    for (const email of extractEmails(text)) {
      const ownDomain = !!siteHost && email.endsWith(`@${siteHost}`)
      out.push({ field: 'email', value: email, confidence: ownDomain ? Math.max(base, 85) : base, source, url: hit.url })
    }
    for (const p of extractPhones(text)) out.push({ field: 'phone', value: p, confidence: base, source, url: hit.url })
    if (!website && isOfficialCandidateHost(hit.url) && nameMatchScore(input.schoolName, hit.title) >= 0.75) {
      out.push({ field: 'website', value: new URL(hit.url).origin, confidence: 60, source: 'SEARCH_RESULT', url: hit.url })
    }
  }
  return out
}

function seeds(input: ContactLookupInput): Raw[] {
  const out: Raw[] = []
  for (const email of extractEmails(input.seedEmail ?? '')) {
    out.push({ field: 'email', value: email, confidence: 50, source: 'DISCOVERY_TEXT', url: null })
  }
  const phone = input.seedPhone ? normalizeIndianPhone(input.seedPhone) : null
  if (phone) out.push({ field: 'phone', value: phone, confidence: 50, source: 'DISCOVERY_TEXT', url: null })
  if (input.seedAddress && input.seedAddress.length > 8) {
    out.push({ field: 'address', value: input.seedAddress, confidence: 50, source: 'DISCOVERY_TEXT', url: null })
  }
  const approx = [input.sector, input.area, input.city, input.state, input.postalCode].filter(Boolean).join(', ')
  if ((input.sector || input.area) && approx) {
    out.push({ field: 'address', value: approx, confidence: 35, source: 'DERIVED', url: null })
  }
  return out
}

/* ------------------------------------------------------------ ranking */

function normalisedKey(field: Raw['field'], value: string): string {
  if (field === 'address') return value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40)
  if (field === 'website') return hostOf(value) ?? value
  return value.toLowerCase()
}

/** Best value per field; each extra independent source showing it adds confidence. */
export function rankFindings(raws: Raw[]): Pick<ContactFindings, 'email' | 'phone' | 'address' | 'website' | 'otherEmails' | 'otherPhones'> {
  const groups = new Map<string, { best: Raw; sources: Set<string> }>()
  for (const r of raws) {
    const key = `${r.field}|${normalisedKey(r.field, r.value)}`
    const g = groups.get(key)
    const sourceKey = `${r.source}|${hostOf(r.url) ?? r.source}`
    if (!g) groups.set(key, { best: r, sources: new Set([sourceKey]) })
    else {
      g.sources.add(sourceKey)
      if (r.confidence > g.best.confidence) g.best = r
    }
  }
  const byField = (field: Raw['field']): ContactFinding[] =>
    [...groups.values()]
      .filter((g) => g.best.field === field)
      .map((g) => ({
        value: g.best.value,
        confidence: Math.min(97, g.best.confidence + (g.sources.size - 1) * 8),
        source: g.best.source,
        url: g.best.url,
        corroboratedBy: g.sources.size - 1,
      }))
      .sort((a, b) =>
        field === 'email'
          ? b.confidence + emailPreference(b.value) * 4 - (a.confidence + emailPreference(a.value) * 4)
          : b.confidence - a.confidence,
      )

  const emails = byField('email')
  const phones = byField('phone')
  return {
    email: emails[0] ?? null,
    phone: phones[0] ?? null,
    address: byField('address')[0] ?? null,
    website: byField('website')[0] ?? null,
    otherEmails: emails.slice(1, 5),
    otherPhones: phones.slice(1, 5),
  }
}

/**
 * Looks up a school's email, phone and address from its Google Maps listing,
 * a targeted contact search and its own website. Every value keeps the page it
 * came from and a confidence score; nothing is guessed.
 */
export async function findSchoolContacts(
  provider: LeadDiscoveryProvider,
  input: ContactLookupInput,
): Promise<{ findings: ContactFindings; queries: number }> {
  const sourcesChecked: string[] = []
  let queries = 0
  const where = [input.branchName, input.sector, input.area, input.city].filter(Boolean).join(' ')
  const name = input.schoolName

  let placesLookup: Promise<PlaceHit[]> = Promise.resolve([])
  if (provider.lookupPlaces) {
    queries++
    sourcesChecked.push('Google Maps')
    placesLookup = provider.lookupPlaces(`${name} ${where}`).catch(() => [])
  }
  let contactSearch: Promise<SearchHit[]> = Promise.resolve([])
  if (provider.name !== 'none') {
    queries++
    sourcesChecked.push('Contact search')
    contactSearch = provider.searchSchools(`"${name}" ${where} contact phone email`).catch(() => [])
  }
  const [places, contactHits] = await Promise.all([placesLookup, contactSearch])

  const raws: Raw[] = [...seeds(input), ...fromPlace(input, places)]
  if (isOfficialCandidateHost(input.website)) {
    raws.push({ field: 'website', value: input.website!, confidence: 70, source: 'DISCOVERY_TEXT', url: null })
  }
  const knownSite = raws.filter((r) => r.field === 'website').sort((a, b) => b.confidence - a.confidence)[0]?.value ?? null
  raws.push(...fromSnippets(input, [...(input.hits ?? []), ...contactHits], knownSite))

  const website = knownSite ?? raws.find((r) => r.field === 'website')?.value ?? null
  if (website && isOfficialCandidateHost(website)) {
    sourcesChecked.push('School website')
    raws.push(...(await scanWebsite(website).catch(() => [])))
  }

  return {
    queries,
    findings: { version: 1, checkedAt: new Date().toISOString(), ...rankFindings(raws), sourcesChecked },
  }
}

/** Keeps the stronger finding per field when a school is looked up again. */
export function mergeFindings(previous: ContactFindings | null, next: ContactFindings): ContactFindings {
  if (!previous) return next
  const pick = (a: ContactFinding | null, b: ContactFinding | null) =>
    !a ? b : !b ? a : b.confidence >= a.confidence ? b : a
  const others = (a: ContactFinding[], b: ContactFinding[], best: ContactFinding | null) => {
    const seen = new Set([best?.value])
    return [...b, ...a].filter((f) => !seen.has(f.value) && seen.add(f.value)).slice(0, 4)
  }
  const email = pick(previous.email, next.email)
  const phone = pick(previous.phone, next.phone)
  return {
    ...next,
    email,
    phone,
    address: pick(previous.address, next.address),
    website: pick(previous.website, next.website),
    otherEmails: others([...previous.otherEmails, ...(previous.email ? [previous.email] : [])], [...next.otherEmails, ...(next.email ? [next.email] : [])], email),
    otherPhones: others([...previous.otherPhones, ...(previous.phone ? [previous.phone] : [])], [...next.otherPhones, ...(next.phone ? [next.phone] : [])], phone),
  }
}
