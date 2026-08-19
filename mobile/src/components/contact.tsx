import React from 'react'
import { Alert, Linking, Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Txt } from './ui'
import { colors, radius, spacing } from '@/theme'

/**
 * Call, WhatsApp, email — the three things a school actually does with a
 * contact record.
 *
 * These are the reason a phone beats a laptop for this work: the office looks
 * a guardian up and rings them, and on a desktop that means reading digits
 * aloud. Each button is absent rather than disabled when the detail is
 * missing, because a greyed-out "Call" tells you nothing you did not already
 * see.
 */
export function CallRow({
  phone,
  email,
  whatsapp = true,
}: {
  phone?: string | null
  email?: string | null
  whatsapp?: boolean
}) {
  const digits = (phone ?? '').replace(/[^\d]/g, '')

  if (!phone && !email) {
    return (
      <Txt variant="small" color={colors.textSubtle}>
        No phone number or email on this record.
      </Txt>
    )
  }

  async function open(url: string, missing: string) {
    try {
      const can = await Linking.canOpenURL(url)
      if (!can) throw new Error('no handler')
      await Linking.openURL(url)
    } catch {
      // A tablet with no dialler, or WhatsApp not installed. Saying so beats a
      // button that silently does nothing.
      Alert.alert('Cannot open', missing)
    }
  }

  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {phone ? (
        <Action
          icon="call-outline"
          label="Call"
          tint={colors.attendance}
          onPress={() => open(`tel:${phone}`, 'This device has no phone app.')}
        />
      ) : null}
      {phone && whatsapp ? (
        <Action
          icon="logo-whatsapp"
          label="WhatsApp"
          tint="#25D366"
          onPress={() => open(`https://wa.me/${digits}`, 'WhatsApp is not installed.')}
        />
      ) : null}
      {email ? (
        <Action
          icon="mail-outline"
          label="Email"
          tint={colors.fees}
          onPress={() => open(`mailto:${email}`, 'No email app is set up on this device.')}
        />
      ) : null}
    </View>
  )
}

function Action({
  icon,
  label,
  tint,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  tint: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          minHeight: 42,
          borderRadius: radius.sm,
          backgroundColor: `${tint}14`,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={16} color={tint} />
      <Txt variant="smallStrong" color={tint}>{label}</Txt>
    </Pressable>
  )
}
