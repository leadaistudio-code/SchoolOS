'use client'

/**
 * Loading the Google Maps JavaScript API.
 *
 * The SDK is not an npm package — it is a script tag that installs a global,
 * and it must be injected exactly once per page no matter how many maps are on
 * it. A module-level promise is the whole mechanism: the first caller creates
 * the tag, every later caller awaits the same promise, and a failure is cached
 * as a rejection so a school on a filtered network fails fast into the fallback
 * map rather than retrying forever.
 *
 * Nothing here runs on the server, and nothing runs at all unless a map is
 * actually rendered — a school with no key configured never contacts Google.
 */

export type MapsStatus = 'idle' | 'loading' | 'ready' | 'failed'

let loader: Promise<typeof google.maps> | null = null

/** Reset between keys is not supported: the SDK cannot be reloaded in a page. */
let loadedKey: string | null = null

export function loadGoogleMaps(apiKey: string): Promise<typeof google.maps> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Maps can only load in a browser'))
  }

  // Already installed by an earlier mount, or by a previous navigation.
  if (window.google?.maps) return Promise.resolve(window.google.maps)

  if (loader && loadedKey === apiKey) return loader

  loadedKey = apiKey
  loader = new Promise<typeof google.maps>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-mcv-maps]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.maps))
      existing.addEventListener('error', () => reject(new Error('Google Maps failed to load')))
      return
    }

    const script = document.createElement('script')
    // `loading=async` is what Google asks for and silences its console warning;
    // `libraries=geometry` is needed for the distance and heading maths the
    // route overlay does.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry&loading=async&v=weekly`
    script.async = true
    script.defer = true
    script.dataset.mcvMaps = 'true'

    script.addEventListener('load', () => {
      if (window.google?.maps) resolve(window.google.maps)
      else reject(new Error('Google Maps loaded without an API'))
    })
    script.addEventListener('error', () =>
      reject(new Error('Google Maps could not be reached from this network')),
    )

    document.head.appendChild(script)
  })

  // A rejected promise left in the module would be retried by every mount and
  // throw an unhandled rejection each time; clearing it lets one later attempt
  // happen without a retry storm.
  loader.catch(() => {
    loader = null
    loadedKey = null
  })

  return loader
}
