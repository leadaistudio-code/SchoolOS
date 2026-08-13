/* MyCampusView offline shell — caches the app shell for offline reopen. */
const CACHE = 'mycampusview-shell-v1'
const SHELL = ['/', '/offline', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone()
        if (response.ok && (url.pathname === '/' || url.pathname.startsWith('/_next/static'))) {
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        if (request.mode === 'navigate') {
          const offline = await caches.match('/offline')
          if (offline) return offline
        }
        return Response.error()
      }),
  )
})

self.addEventListener('push', (event) => {
  let payload = { title: 'MyCampusView', body: 'You have a new notification', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url },
      icon: '/favicon.ico',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(self.clients.openWindow(url))
})
