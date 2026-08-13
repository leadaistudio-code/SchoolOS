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
    const res = middleware(request('web-production-1234.up.railway.app', '/modules'))
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/modules')
  })

  it('refuses the platform sign-in rather than rendering it', () => {
    // Without the role this is the actual leak: a non-apex hostname on the
    // marketing service would serve the application's login page.
    setup('marketing')
    for (const path of ['/login', '/platform', '/403']) {
      const res = middleware(request('web-production-1234.up.railway.app', path))
      expect(res.status, path).toBe(307)
      expect(res.headers.get('location'), path).toMatch(/\/$/)
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
})
