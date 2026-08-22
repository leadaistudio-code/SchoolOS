import { env } from '@/lib/env'

/**
 * The map key, if this deployment has one.
 *
 * A Google Maps JavaScript key is public by design — it travels to the browser
 * and is protected by an HTTP-referrer restriction on the Google Cloud project,
 * not by secrecy. It is still handed out through this one function rather than
 * a `NEXT_PUBLIC_` variable, so it ships only in the pages that actually draw a
 * map instead of in every bundle the app serves.
 *
 * Returns null unless a driver is configured AND a key exists, which is what
 * makes the drawn fallback the default rather than something to switch on.
 */
export function mapsClientKey(): string | null {
  const e = env()
  if (e.MAPS_DRIVER !== 'google') return null
  return e.MAPS_API_KEY?.trim() ? e.MAPS_API_KEY : null
}

/** Whether a tile provider is configured, without exposing the key. */
export function mapsConfigured(): boolean {
  return mapsClientKey() !== null
}
