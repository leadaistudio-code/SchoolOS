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
  '/unsubscribe', // bulk email opt-out, linked from every campaign email
  '/_next',
  '/favicon',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline',
  '/site-pages',
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
const MARKETING_API = ['/api/v1/site', '/api/health', '/api/metrics']

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

function academySlugFromEnv() {
  return (process.env.ACADEMY_SLUG ?? 'academy').toLowerCase()
}

/** academy.mycampusview.com (and academy.lvh.me in local). */
function isAcademyHost(host: string): boolean {
  const root = (process.env.APP_ROOT_DOMAIN ?? 'lvh.me:3000').split(':')[0]!.toLowerCase()
  const bare = host.split(':')[0]!.toLowerCase()
  const slug = academySlugFromEnv()
  return bare === `${slug}.${root}` || bare === `${slug}.lvh.me` || bare === slug
}

/**
 * On the Academy host, public pages live at `/`, `/courses/…`, `/join`, `/terms`.
 * Internally they still render from `/academy/…`; old `/academy` URLs redirect.
 */
function academyHostRouting(request: NextRequest, pathname: string): NextResponse | null {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  if (!isAcademyHost(host)) return null

  if (pathname === '/academy' || pathname.startsWith('/academy/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.slice('/academy'.length) || '/'
    return NextResponse.redirect(url, 308)
  }

  const publicAcademy =
    pathname === '/' ||
    pathname.startsWith('/courses/') ||
    pathname === '/courses' ||
    pathname === '/join' ||
    pathname.startsWith('/join/') ||
    pathname === '/terms' ||
    pathname.startsWith('/terms/')

  if (publicAcademy) {
    const url = request.nextUrl.clone()
    url.pathname = pathname === '/' ? '/academy' : `/academy${pathname}`
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-pathname', pathname)
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } })
  }

  return null
}

/** Provider default hostnames — never the brand Google should index. */
function isRailwayAppHost(host: string): boolean {
  const bare = host.split(':')[0]!.toLowerCase()
  return bare.endsWith('.up.railway.app')
}

function withNoIndex(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}

/**
 * Tell crawlers the provider hostname is not a public site.
 * Used when we still have to answer on `*.up.railway.app` (health checks)
 * or when `APP_URL` is unset in local tests.
 */
function railwayRobotsTxt(): NextResponse {
  return withNoIndex(
    new NextResponse('User-agent: *\nDisallow: /\n', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
  )
}

/**
 * The one public origin of a marketing-only deployment, from `APP_URL`.
 *
 * Every other hostname that reaches the service (the apex, the provider's own
 * `*.up.railway.app` address) answers with a permanent redirect to it. A copy
 * of the site on a second domain, with tags pointing between them, is what
 * Google Ads reads as a compromised site — and what makes Google show the
 * host brand ("Railway") next to our pages in search.
 */
function canonicalRedirect(request: NextRequest, host: string): NextResponse | null {
  const target = process.env.APP_URL
  if (!target) return null
  let canonical: URL
  try {
    canonical = new URL(target)
  } catch {
    return null
  }
  const bare = host.split(':')[0]!.toLowerCase()
  if (
    !bare ||
    bare === canonical.hostname.toLowerCase() ||
    bare === 'localhost' ||
    bare === '127.0.0.1' ||
    bare.endsWith('.railway.internal') ||
    bare.endsWith('.lvh.me') ||
    bare === 'lvh.me'
  ) {
    return null
  }
  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, canonical.origin)
  return withNoIndex(NextResponse.redirect(url, 301))
}

/**
 * Application deployments must keep tenant and custom domains reachable, so
 * only the provider hostname is folded onto `APP_URL` — not every non-canonical
 * host the way the marketing service does.
 */
function railwayAppRedirect(request: NextRequest, host: string): NextResponse | null {
  if (!isRailwayAppHost(host)) return null
  if (request.nextUrl.pathname.startsWith('/api/health')) return null
  if (request.nextUrl.pathname === '/robots.txt') return railwayRobotsTxt()
  return canonicalRedirect(request, host)
}

function withPathname(request: NextRequest, pathname: string) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })
  response.headers.set('x-pathname', pathname)
  return response
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  const deployment = role()

  const internal =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/manifest.webmanifest'

  // Provider host with no canonical redirect yet (local / missing APP_URL):
  // still refuse indexing so Google never treats Railway as the site.
  if (isRailwayAppHost(host) && pathname === '/robots.txt') {
    return railwayRobotsTxt()
  }

  // Academy subdomain: clean public URLs at the host root.
  if (deployment !== 'marketing' && !internal) {
    const academy = academyHostRouting(request, pathname)
    if (academy) return academy
  }

  // A marketing-only deployment: the application does not exist here, on any
  // host. Anything belonging to it goes to the website's front page rather than
  // rendering a sign-in form on a hostname that should only ever serve pages.
  if (deployment === 'marketing' && !internal) {
    if (!pathname.startsWith('/api/health')) {
      const redirect = canonicalRedirect(request, host)
      if (redirect) return redirect
    }

    const appOnly =
      pathname.startsWith('/platform') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/403') ||
      (pathname.startsWith('/api') && !MARKETING_API.some((p) => pathname.startsWith(p)))

    if (appOnly) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.search = ''
      return withNoIndex(NextResponse.redirect(url))
    }
  }

  // An application-only deployment: `/site/*` is the website's internal path and
  // must not be reachable here, or the same pages answer on two hostnames.
  // The provider hostname also redirects to APP_URL so Google never indexes it.
  if (deployment === 'app') {
    const railway = railwayAppRedirect(request, host)
    if (railway) return railway
    if (pathname === '/site' || pathname.startsWith('/site/')) {
      return new NextResponse('Not found', { status: 404 })
    }
    const response = withPathname(request, pathname)
    if (isRailwayAppHost(host)) return withNoIndex(response)
    return response
  }

  const servesMarketing = deployment === 'marketing' || isMarketingHost(host)
  if (!servesMarketing) {
    const response = withPathname(request, pathname)
    return isRailwayAppHost(host) ? withNoIndex(response) : response
  }

  if (PASSTHROUGH.some((prefix) => pathname.startsWith(prefix))) {
    const response = withPathname(request, pathname)
    return isRailwayAppHost(host) ? withNoIndex(response) : response
  }

  // Already rewritten, or someone typed the internal path: send them to the
  // canonical public one so a page never has two addresses.
  if (pathname === '/site' || pathname.startsWith('/site/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace(/^\/site/, '') || '/'
    const redirect = NextResponse.redirect(url)
    return isRailwayAppHost(host) ? withNoIndex(redirect) : redirect
  }

  const url = request.nextUrl.clone()
  url.pathname = `/site${pathname === '/' ? '' : pathname}`
  const rewrite = NextResponse.rewrite(url)
  return isRailwayAppHost(host) ? withNoIndex(rewrite) : rewrite
}

export const config = {
  // Everything except static assets; the passthrough list above handles the
  // rest, where the decision needs the pathname rather than a pattern.
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm)$).*)'],
}
