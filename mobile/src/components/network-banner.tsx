import React from 'react'
import { View } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Txt } from './ui'
import { colors, spacing } from '@/theme'

/**
 * Says out loud when the device is offline.
 *
 * Without it, a cached screen and a live one look identical, and somebody
 * reads yesterday's outstanding figure as today's. Screens keep showing what
 * they already have — throwing it away would be worse — but the bar makes the
 * staleness visible rather than implied.
 */
export function NetworkBanner() {
  const [offline, setOffline] = React.useState(false)

  React.useEffect(() => {
    return NetInfo.addEventListener((state) => {
      // `isInternetReachable` is null while it is still being determined;
      // treating that as offline would flash the bar on every cold start.
      const reachable = state.isInternetReachable
      setOffline(state.isConnected === false || reachable === false)
    })
  }, [])

  if (!offline) return null

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.warningBg }}>
      <View
        accessibilityRole="alert"
        style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.base, alignItems: 'center' }}
      >
        <Txt variant="smallStrong" color={colors.warning}>
          No connection — showing what was last loaded
        </Txt>
      </View>
    </SafeAreaView>
  )
}
