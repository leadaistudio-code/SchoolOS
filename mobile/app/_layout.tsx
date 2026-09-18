import React from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/store'
import { NetworkBanner } from '@/components/network-banner'
import { attachPushListeners } from '@/notifications/push'
import { colors } from '@/theme'

SplashScreen.preventAutoHideAsync().catch(() => {})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return failureCount < 2
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: { retry: false },
  },
})

export default function RootLayout() {
  const status = useAuth((s) => s.status)
  const restore = useAuth((s) => s.restore)

  React.useEffect(() => {
    restore()
  }, [restore])

  React.useEffect(() => {
    if (status !== 'starting') SplashScreen.hide()
  }, [status])

  React.useEffect(() => {
    if (status !== 'signedIn') return
    return attachPushListeners()
  }, [status])

  if (status === 'starting') return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <NetworkBanner />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
