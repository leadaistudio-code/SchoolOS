/** Calls a Tapasya API route and unwraps the `{ data, error }` envelope. */
export async function api<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(json?.error?.message ?? 'Something went wrong. Please try again.') as Error & { code?: string; details?: unknown }
    err.code = json?.error?.code
    err.details = json?.error?.details
    throw err
  }
  return json?.data as T
}

/** Stable random key for idempotent requests. */
export function clientKey(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${rand}`
}
