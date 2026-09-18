import { Platform } from 'react-native'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { router } from 'expo-router'
import { api } from '@/api/client'

/**
 * Push registration and deep-link handling.
 *
 * Tokens go to POST /push/subscribe as Expo tokens. The worker delivers via
 * Expo's gateway whenever notify() runs for a user who has a device registered.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

let registeredToken: string | null = null

function projectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
  )
}

export async function registerPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'School alerts',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      })
    }

    const current = await Notifications.getPermissionsAsync()
    let status = current.status
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync()
      status = asked.status
    }
    if (status !== 'granted') return null

    const opts = projectId() ? { projectId: projectId() } : undefined
    const tokenResult = await Notifications.getExpoPushTokenAsync(opts)
    const token = tokenResult.data
    if (!token || token === registeredToken) return token

    await api.post('/push/subscribe', { provider: 'expo', token })
    registeredToken = token
    return token
  } catch (err) {
    console.warn('[push] registration failed', err)
    return null
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  if (!registeredToken) return
  const token = registeredToken
  registeredToken = null
  await api.delete('/push/subscribe', { endpoint: token }).catch(() => {})
}

/** Map a notification payload to an in-app route and navigate. */
export function openFromPushData(data: Record<string, unknown> | undefined) {
  const href =
    (typeof data?.href === 'string' && data.href) ||
    (typeof data?.url === 'string' && data.url) ||
    null
  if (!href) return
  // Strip custom scheme if present: mycampusview:///(app)/leave
  const path = href.replace(/^mycampusview:\/\//, '').replace(/^\/+/, '/')
  try {
    router.push(path as never)
  } catch {
    router.push('/(app)' as never)
  }
}

/** Call once while signed in. Returns a cleanup that removes listeners. */
export function attachPushListeners(): () => void {
  const received = Notifications.addNotificationResponseReceivedListener((response) => {
    openFromPushData(response.notification.request.content.data as Record<string, unknown>)
  })

  // Cold start: user opened the app by tapping a notification.
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      openFromPushData(response.notification.request.content.data as Record<string, unknown>)
    }
  })

  return () => {
    received.remove()
  }
}
