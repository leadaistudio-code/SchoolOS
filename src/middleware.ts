import { NextResponse, type NextRequest } from 'next/server'

/**
 * Host routing.
 *
 * One deployment serves two entirely different things:
 *
 *   yourdomain.com          the public website
 *   stjohns.yourdomain.com  that school's application
 *   school-own-domain.com   the same, on a domain the school owns
 *
 * The website lives at `/site/*` internally and is rewritten onto the root of
 * the marketing host, so a visitor sees `/product` rather than `/site/product`
 * and the application keeps the root path on every other host.
 *
 * The decision is made from the host alone. Middleware runs on the edge with
 * no database, so it cannot ask which tenants exist — which is why the rule is
 * inverted: only the apex and `www` are marketing, and everything else is the
 * application. A school's custom domain therefore reaches the app by default
 * rather than by being listed here.
 */

/** Paths that belong to the platform, on every host. */
const PASSTHROUGH = [
  '/api',
  '/platform', // super-admin console, still reached on the apex
  '/login', // platform sign-in when no school owns the host
  '/403',
  '/_next',
  '/favicon',
  '/manifest.webmanifest',
  '/robots.txt',
  '/sitemap.xml',
]

function isMarketingHost(host: string): boolean {
  const root = (process.env.APP_ROOT_DOMAIN ?? 'lvh.me:3000').split(':')[0]!.toLowerCase()
  const bare = host.split(':')[0]!.toLowerCase()
  return bare === root || bare === `www.${root}`
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''

  if (!isMarketingHost(host)) return NextResponse.next()
  if (PASSTHROUGH.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next()

  // Already rewritten, or someone typed the internal path: send them to the
  // canonical public one so a page never has two addresses.
  if (pathname === '/site' || pathname.startsWith('/site/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace(/^\/site/, '') || '/'
    return NextResponse.redirect(url)
  }

  const url = request.nextUrl.clone()
  url.pathname = `/site${pathname === '/' ? '' : pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  // Everything except static assets; the passthrough list above handles the
  // rest, where the decision needs the pathname rather than a pattern.
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)'],
}
