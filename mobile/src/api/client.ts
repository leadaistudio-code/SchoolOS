import { getStoredSession, clearStoredSession } from '@/auth/storage'
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '@/config'

/**
 * The one place a request leaves the app.
 *
 * Everything the backend needs to identify the caller — the bearer token and
 * the tenant slug — is attached here and nowhere else. A screen that builds
 * its own fetch would be a screen that can forget the tenant header, and a
 * request without it resolves no school and returns 401, or worse resolves the
 * wrong one. There is deliberately no way to call the API except through this.
 */

/** The envelope every v1 route returns: `{ data, meta, error }`. */
type Envelope<T> = {
  data: T
  meta: { page?: number; limit?: number; total?: number } | null
  error: { code: string; message: string; details?: unknown } | null
}

export type ApiMeta = Envelope<unknown>['meta']

/**
 * A failure a screen can render. The raw backend message is kept for logs, but
 * `message` is always something worth showing a principal on a train.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** The session is gone; the caller should return to sign-in. */
  get isAuth(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  /** Nothing reached the server. Worth offering a retry rather than an apology. */
  get isOffline(): boolean {
    return this.status === 0
  }
}

/** Called when a request is refused for want of a session. Set by the auth store. */
let onUnauthenticated: (() => void) | null = null
export function setUnauthenticatedHandler(handler: (() => void) | null) {
  onUnauthenticated = handler
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** Query parameters. `undefined` and `''` are dropped rather than sent empty. */
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
  /**
   * Extra headers for the one request that cannot inherit them. Sign-in has to
   * name its school before a session exists to carry the slug.
   */
  headers?: Record<string, string>
  /**
   * Sign-in and school lookup run before there is a session. They must not
   * trigger the "you have been signed out" path on a 401 — a wrong password is
   * not an expired session.
   */
  anonymous?: boolean
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.replace(/^\//, ''), `${API_BASE_URL.replace(/\/$/, '')}/`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<{
  data: T
  meta: ApiMeta
}> {
  const session = await getStoredSession()

  const headers: Record<string, string> = { accept: 'application/json' }
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (session?.token) headers.authorization = `Bearer ${session.token}`
  // Named on every request. A native client has no Host that means anything to
  // the backend, so this is the only thing that resolves the school.
  if (session?.tenantSlug) headers['x-tenant-slug'] = session.tenantSlug
  // Explicit headers win: sign-in names a school the stored session does not
  // know about yet, and may be a different one entirely.
  Object.assign(headers, options.headers ?? {})

  // A school on a school's wifi is not always on a fast connection. Without a
  // deadline a request can hang until the OS gives up minutes later, and the
  // screen shows a spinner the whole time.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timeout)
    const aborted = (error as Error)?.name === 'AbortError'
    throw new ApiError(
      0,
      aborted ? 'TIMEOUT' : 'OFFLINE',
      aborted
        ? 'The server took too long to reply. Check your connection and try again.'
        : 'No connection. Check your network and try again.',
    )
  } finally {
    clearTimeout(timeout)
  }

  // A 204, or an HTML error page from a proxy, is not JSON. Guessing at it
  // would surface "Unexpected token <" to a user, which tells them nothing.
  const raw = await response.text()
  let envelope: Envelope<T> | null = null
  if (raw) {
    try {
      envelope = JSON.parse(raw) as Envelope<T>
    } catch {
      envelope = null
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !options.anonymous) {
      await clearStoredSession()
      onUnauthenticated?.()
    }
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'HTTP_ERROR',
      envelope?.error?.message ?? messageForStatus(response.status),
      envelope?.error?.details,
    )
  }

  // A 2xx that is not our envelope means the request never reached the route
  // it was aimed at — almost always a redirect that fetch followed silently to
  // an HTML page. Returning null here would push a TypeError into whichever
  // screen unwrapped it, and the user would read "please try again" forever
  // about something retrying cannot fix. This says what actually happened.
  if (!envelope || typeof envelope !== 'object' || !('data' in envelope)) {
    throw new ApiError(
      response.status,
      'NOT_API',
      `The server did not return data at ${path}. Check the app is pointed at the application server, not the marketing site.`,
    )
  }

  return { data: envelope.data as T, meta: envelope.meta ?? null }
}

/** Said plainly, in words that suggest what to do next. */
function messageForStatus(status: number): string {
  if (status === 401) return 'Your session has ended. Please sign in again.'
  if (status === 403) return 'You do not have permission to view this.'
  if (status === 404) return 'That could not be found.'
  if (status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (status >= 500) return 'The school server is having trouble. Please try again shortly.'
  return 'Something went wrong. Please try again.'
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    apiRequest<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
}
