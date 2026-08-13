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
 *
 * ## Running the two halves as separate deployments
 *
 * `APP_ROLE` narrows a deployment to one half, which is what makes it safe to
 * run the marketing site and the application as two services off the same
 * repository:
 *
 *   both       (default) host decides, as described above
 *   marketing  every host serves the website; application paths are refused
 *   app        every host serves the application; `/site/*` is refused
 *
 * Without it, a second service would still answer for the wrong half on its
 * own `*.up.railway.app` hostname — the marketing service would serve the
 * platform sign-in page, because that host is not the apex. Narrowing the role
 * means each service answers for exactly what it was deployed to be, whatever
 * hostname it is reached on.
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

/**
 * The API surface the marketing site needs.
 *
 * A marketing-only deployment answers these and nothing else under `/api`, so
 * the application's endpoints are simply absent from that host rather than
 * relying on each one to reject the request.
 */
const MARKETING_API = ['/api/v1/site', '/api/health']

type Role = 'both' | 'app' | 'marketing'

function role(): Role {
  const value = (process.env.APP_ROLE ?? 'both').toLowerCase()
  return value === 'app' || value === 'marketing' ? value : 'both'
}

function isMarketingHost(host: string): boolean {
  const root = (process.env.APP_ROOT_DOMAIN ?? 'lvh.me:3000').split(':')[0]!.toLowerCase()
  const bare = host.split(':')[0]!.toLowerCase()
  return bare === root || bare === `www.${root}`
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  const deployment = role()

  const internal =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/manifest.webmanifest'

  // A marketing-only deployment: the application does not exist here, on any
  // host. Anything belonging to it goes to the website's front page rather than
  // rendering a sign-in form on a hostname that should only ever serve pages.
  if (deployment === 'marketing' && !internal) {
    const appOnly =
      pathname.startsWith('/platform') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/403') ||
      (pathname.startsWith('/api') && !MARKETING_API.some((p) => pathname.startsWith(p)))

    if (appOnly) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  // An application-only deployment: `/site/*` is the website's internal path and
  // must not be reachable here, or the same pages answer on two hostnames.
  if (deployment === 'app') {
    if (pathname === '/site' || pathname.startsWith('/site/')) {
      return new NextResponse('Not found', { status: 404 })
    }
    const response = NextResponse.next()
    response.headers.set('x-pathname', pathname)
    return response
  }

  const servesMarketing = deployment === 'marketing' || isMarketingHost(host)
  if (!servesMarketing) {
    const response = NextResponse.next()
    response.headers.set('x-pathname', pathname)
    return response
  }

  if (PASSTHROUGH.some((prefix) => pathname.startsWith(prefix))) {
    const response = NextResponse.next()
    response.headers.set('x-pathname', pathname)
    return response
  }

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
