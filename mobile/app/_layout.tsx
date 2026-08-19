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
import { colors } from '@/theme'

// Held until the session has been restored, so the app never flashes a
// sign-in screen at somebody who is already signed in.
SplashScreen.preventAutoHideAsync().catch(() => {})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Screens are revisited constantly on a phone. A short window means
      // coming back to a list is instant while still being current.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Retrying a 401 or a 403 just burns battery on a request that will
        // fail identically. A dropped connection is worth two more goes.
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
