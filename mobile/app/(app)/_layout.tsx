import React from 'react'
import { Redirect, Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/auth/store'
import { tabModules } from '@/navigation/modules'
import { colors, layout, type } from '@/theme'

/**
 * The signed-in shell.
 *
 * Five slots: Home, two modules chosen from what this user can actually open,
 * Notices, and More. A tab the user has no permission for is given `href: null`
 * — expo-router keeps the route reachable (a deep link or a push notification
 * may still land on it, where the API will have the final say) but stops
 * advertising it in the bar.
 */
export default function AppLayout() {
  const status = useAuth((s) => s.status)
  const session = useAuth((s) => s.session)

  if (status !== 'signedIn') return <Redirect href="/(auth)/login" />
  if (session?.mustChangePassword) return <Redirect href="/(auth)/change-password" />

  const held = session?.permissions ?? []
  const tabs = tabModules(held)
  const shows = (key: string) => tabs.some((m) => m.key === key)

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: type.caption.fontSize, fontWeight: '600' },
        tabBarItemStyle: { minHeight: layout.tapTarget },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="students"
        options={{
          title: 'Students',
          href: shows('students') ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          href: shows('attendance') ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="checkbox-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="fees"
        options={{
          title: 'Fees',
          href: shows('fees') ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="card-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notices"
        options={{
          title: 'Notices',
          tabBarIcon: ({ color, size }) => <Ionicons name="megaphone-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />

      {/* Reachable, never a tab: opened from Home, More, search or a link.
          Every route file in this directory needs an entry — one that is
          missing becomes a tab with a broken glyph, which is exactly what
          `student` and `register` did before they were listed here. */}
      <Tabs.Screen name="admissions" options={{ href: null }} />
      <Tabs.Screen name="assistant" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="student" options={{ href: null }} />
      <Tabs.Screen name="register" options={{ href: null }} />
    </Tabs>
  )
}
