'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Registers the service worker and optionally a Web Push subscription.
 * Push delivery still needs VAPID keys on the server; this stores the
 * browser endpoint so devices can receive pushes once keys are configured.
 */
export function PwaRegister() {
  const toast = useToast()
  const [ready, setReady] = React.useState(false)
  const [subscribed, setSubscribed] = React.useState(false)

  React.useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => setReady(true))
      .catch(() => setReady(false))
  }, [])

  const enablePush = async () => {
    if (!('Notification' in window) || !('PushManager' in window)) {
      toast.push({
        tone: 'info',
        title: 'Push not supported',
        description: 'This browser cannot register for push notifications.',
      })
      return
    }
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      toast.push({ tone: 'error', title: 'Permission denied', description: 'Notifications were blocked.' })
      return
    }

    const reg = await navigator.serviceWorker.ready
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    let sub = await reg.pushManager.getSubscription()
    if (!sub && vapid) {
      const key = urlBase64ToUint8Array(vapid)
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      })
    }

    if (!sub) {
      toast.push({
        tone: 'info',
        title: 'Service worker ready',
        description:
          'Offline shell is active. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY to enable push subscriptions.',
      })
      setReady(true)
      return
    }

    const json = sub.toJSON()
    const res = await fetch('/api/v1/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
      }),
    })
    if (!res.ok) {
      toast.push({ tone: 'error', title: 'Could not save subscription' })
      return
    }
    setSubscribed(true)
    toast.push({ tone: 'success', title: 'Notifications enabled' })
  }

  if (!ready) return null

  return (
    <div className="fixed bottom-4 right-4 z-40 hidden sm:block">
      {!subscribed ? (
        <Button size="sm" variant="secondary" onClick={enablePush}>
          Enable app alerts
        </Button>
      ) : null}
    </div>
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}
