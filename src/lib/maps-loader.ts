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
 * The one non-obvious part is the callback. With `loading=async` — which Google
 * asks for — the script tag only fetches a bootstrap, and its `load` event
 * fires while `google.maps` still holds nothing but `importLibrary`. Resolving
 * there hands callers a namespace whose `Map` is undefined, and the first
 * `new maps.Map(...)` throws "Map is not a constructor". The `callback`
 * parameter is what actually signals a fully populated namespace, so that is
 * what this waits for.
 *
 * Nothing here runs on the server, and nothing runs at all unless a map is
 * actually rendered — a school with no key configured never contacts Google.
 */

export type MapsStatus = 'idle' | 'loading' | 'ready' | 'failed'

/** Google calls this by name off `window`, so it cannot be a closure. */
const CALLBACK = '__mcvGoogleMapsReady'

/** Google is reachable but silent: better to fall back than to spin forever. */
const LOAD_TIMEOUT_MS = 15_000

type CallbackWindow = Window & { [CALLBACK]?: () => void }

let loader: Promise<typeof google.maps> | null = null
let loadedKey: string | null = null

/** The API is only usable once the classes are actually on the namespace. */
function isReady(): boolean {
  return typeof window !== 'undefined' && typeof window.google?.maps?.Map === 'function'
}

export function loadGoogleMaps(apiKey: string): Promise<typeof google.maps> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Maps can only load in a browser'))
  }

  // Already installed by an earlier mount, or by a previous navigation.
  if (isReady()) return Promise.resolve(window.google.maps)

  if (loader && loadedKey === apiKey) return loader

  loadedKey = apiKey
  loader = new Promise<typeof google.maps>((resolve, reject) => {
    const scope = window as CallbackWindow
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('Google Maps did not finish loading in time'))
    }, LOAD_TIMEOUT_MS)

    const succeed = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      delete scope[CALLBACK]
      // Belt and braces: the callback is Google's own signal that the API is
      // ready, but a namespace without `Map` is unusable whatever fired it.
      if (isReady()) resolve(window.google.maps)
      else reject(new Error('Google Maps loaded without a usable API'))
    }

    const fail = (message: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      delete scope[CALLBACK]
      reject(new Error(message))
    }

    scope[CALLBACK] = succeed

    // A second mount while the first script is still in flight: wait on the
    // same callback rather than injecting the tag twice, which Google warns
    // about and which would load the API a second time.
    if (document.querySelector('script[data-mcv-maps]')) return

    const script = document.createElement('script')
    // `callback` is what makes this safe with `loading=async`; `libraries` is
    // the legacy loader's way of asking for extras up front, and geometry is
    // what the distance and heading maths needs.
    script.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(apiKey)}` +
      '&libraries=geometry' +
      '&loading=async' +
      '&v=weekly' +
      `&callback=${CALLBACK}`
    script.async = true
    script.defer = true
    script.dataset.mcvMaps = 'true'

    script.addEventListener('error', () =>
      fail('Google Maps could not be reached from this network'),
    )

    document.head.appendChild(script)
  })

  // A rejected promise left in the module would be retried by every mount and
  // throw an unhandled rejection each time; clearing it lets one later attempt
  // happen without a retry storm.
  loader.catch(() => {
    loader = null
    loadedKey = null
    document.querySelector('script[data-mcv-maps]')?.remove()
  })

  return loader
}
