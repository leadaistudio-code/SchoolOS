import { env } from '@/lib/env'
import { SOURCE_TYPE_WEIGHTS } from '@/lib/lead-discovery'

export type SearchHit = {
  title: string
  url: string
  snippet: string
  sourceName?: string
}

export type LeadDiscoveryProvider = {
  readonly name: string
  searchSchools: (query: string) => Promise<SearchHit[]>
  fetchEvidence?: (url: string) => Promise<{ title?: string; snippet?: string } | null>
}

function classifySourceType(url: string, title: string, snippet: string): string {
  const hay = `${url} ${title} ${snippet}`.toLowerCase()
  if (/cbse\.gov|education\.gov|nic\.in/.test(hay)) return 'REGULATORY'
  if (/admission/.test(hay)) return 'ADMISSIONS'
  if (/hiring|recruit|career|job/.test(hay)) return 'RECRUITMENT'
  if (/linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com/.test(hay)) return 'SOCIAL'
  if (/maps\.google|goo\.gl\/maps/.test(hay)) return 'MAPS'
  if (/timesofindia|hindustantimes|indianexpress|tribuneindia|educationworld/.test(hay)) return 'NEWS'
  if (/school|edu\.in|\.ac\.in/.test(hay) && /official|about|campus|branch/.test(hay)) return 'OFFICIAL_WEBSITE'
  if (/justdial|sulekha|yellowpages|indiamart/.test(hay)) return 'DIRECTORY'
  return 'OTHER'
}

export function evidenceWeight(sourceType: string): number {
  return SOURCE_TYPE_WEIGHTS[sourceType] ?? SOURCE_TYPE_WEIGHTS.OTHER!
}

function serperProvider(apiKey: string): LeadDiscoveryProvider {
  return {
    name: 'serper',
    async searchSchools(query) {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, gl: 'in', hl: 'en', num: 8 }),
      })
      if (!res.ok) {
        throw new Error(`Serper search failed (${res.status})`)
      }
      const data = (await res.json()) as {
        organic?: { title?: string; link?: string; snippet?: string }[]
      }
      return (data.organic ?? [])
        .filter((r) => r.link && r.title)
        .map((r) => ({
          title: r.title!,
          url: r.link!,
          snippet: r.snippet ?? '',
          sourceName: new URL(r.link!).hostname.replace(/^www\./, ''),
        }))
    },
  }
}

function braveProvider(apiKey: string): LeadDiscoveryProvider {
  return {
    name: 'brave',
    async searchSchools(query) {
      const url = new URL('https://api.search.brave.com/res/v1/web/search')
      url.searchParams.set('q', query)
      url.searchParams.set('count', '8')
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': apiKey,
        },
      })
      if (!res.ok) throw new Error(`Brave search failed (${res.status})`)
      const data = (await res.json()) as {
        web?: { results?: { title?: string; url?: string; description?: string }[] }
      }
      return (data.web?.results ?? [])
        .filter((r) => r.url && r.title)
        .map((r) => ({
          title: r.title!,
          url: r.url!,
          snippet: r.description ?? '',
          sourceName: new URL(r.url!).hostname.replace(/^www\./, ''),
        }))
    },
  }
}

const noneProvider: LeadDiscoveryProvider = {
  name: 'none',
  async searchSchools() {
    return []
  },
}

export function getLeadDiscoveryProvider(): LeadDiscoveryProvider {
  const { LEAD_DISCOVERY_SEARCH_DRIVER, LEAD_DISCOVERY_SEARCH_API_KEY } = env()
  if (!LEAD_DISCOVERY_SEARCH_API_KEY || LEAD_DISCOVERY_SEARCH_DRIVER === 'none') {
    return noneProvider
  }
  if (LEAD_DISCOVERY_SEARCH_DRIVER === 'serper') return serperProvider(LEAD_DISCOVERY_SEARCH_API_KEY)
  if (LEAD_DISCOVERY_SEARCH_DRIVER === 'brave') return braveProvider(LEAD_DISCOVERY_SEARCH_API_KEY)
  return noneProvider
}

export function annotateHit(hit: SearchHit) {
  const sourceType = classifySourceType(hit.url, hit.title, hit.snippet)
  return { ...hit, sourceType, weight: evidenceWeight(sourceType) }
}
