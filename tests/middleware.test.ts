import { describe, expect, it, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../src/middleware'

/**
 * Host routing, including the two-service split.
 *
 * The rules here decide whether a request is answered by the public website or
 * by a school's application, so a mistake shows up as the wrong product on a
 * domain — or, in the case a separate marketing service, as a sign-in page on a
 * hostname that should only ever serve pages.
 */

const ROOT = 'schoolos.test'

function request(host: string, path = '/') {
  return new NextRequest(`https://${host}${path}`, { headers: { host } })
}

function setup(role: string | undefined) {
  process.env.APP_ROOT_DOMAIN = ROOT
  if (role === undefined) delete process.env.APP_ROLE
  else process.env.APP_ROLE = role
}

afterEach(() => {
  delete process.env.APP_ROLE
  delete process.env.APP_URL
})

describe('one service for both halves (default)', () => {
  it('rewrites the apex onto the website', () => {
    setup(undefined)
    const res = middleware(request(ROOT, '/product'))
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/product')
  })

  it('leaves a school subdomain on the application', () => {
    setup(undefined)
    const res = middleware(request(`stjohns.${ROOT}`, '/students'))
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('redirects the internal path so a page never has two addresses', () => {
    setup(undefined)
    const res = middleware(request(ROOT, '/site/product'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/product')
  })
})

describe('a marketing-only service', () => {
  it('serves the website on any hostname, including a railway one', () => {
    setup('marketing')
    delete process.env.APP_URL
    const res = middleware(request('web-production-1234.up.railway.app', '/modules'))
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/modules')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('returns 410 Gone on the railway hostname so Google can drop it', () => {
    setup('marketing')
    process.env.APP_URL = 'https://www.mycampusview.com'
    const res = middleware(request('website-production-026e.up.railway.app', '/customer-stories'))
    expect(res.status).toBe(410)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    delete process.env.APP_URL
  })

  it('still 301s the apex onto www', () => {
    setup('marketing')
    process.env.APP_URL = 'https://www.mycampusview.com'
    const res = middleware(request('mycampusview.com', '/blog'))
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('https://www.mycampusview.com/blog')
    delete process.env.APP_URL
  })

  it('refuses robots.txt on the railway hostname', () => {
    setup('marketing')
    delete process.env.APP_URL
    const res = middleware(request('web-production-1234.up.railway.app', '/robots.txt'))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('refuses the platform sign-in rather than rendering it', () => {
    // Without the role this is the actual leak: a non-apex hostname on the
    // marketing service would serve the application's login page.
    setup('marketing')
    delete process.env.APP_URL
    for (const path of ['/login', '/platform', '/403']) {
      const res = middleware(request('web-production-1234.up.railway.app', path))
      expect(res.status, path).toBe(307)
      expect(res.headers.get('location'), path).toMatch(/\/$/)
      expect(res.headers.get('x-robots-tag'), path).toBe('noindex, nofollow')
    }
  })

  it('keeps the demo form and the health check reachable', () => {
    setup('marketing')
    for (const path of ['/api/v1/site/demo', '/api/health', '/api/metrics']) {
      const res = middleware(request(ROOT, path))
      expect(res.status, path).toBe(200)
      expect(res.headers.get('location'), path).toBeNull()
    }
  })

  it('refuses the application API', () => {
    setup('marketing')
    const res = middleware(request(ROOT, '/api/v1/students'))
    expect(res.status).toBe(307)
  })
})

describe('an application-only service', () => {
  it('serves the application even on the apex', () => {
    setup('app')
    const res = middleware(request(ROOT, '/students'))
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it('refuses the website internal path so pages do not answer twice', () => {
    setup('app')
    expect(middleware(request(`stjohns.${ROOT}`, '/site/product')).status).toBe(404)
  })

  it('returns 410 Gone on the railway hostname so Google can drop it', () => {
    setup('app')
    process.env.APP_URL = 'https://app.mycampusview.com'
    const res = middleware(request('schoolos-production-b013.up.railway.app', '/login'))
    expect(res.status).toBe(410)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    delete process.env.APP_URL
  })

  it('keeps tenant hosts reachable', () => {
    setup('app')
    process.env.APP_URL = 'https://app.mycampusview.com'
    const res = middleware(request(`stjohns.${ROOT}`, '/students'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    delete process.env.APP_URL
  })
})
