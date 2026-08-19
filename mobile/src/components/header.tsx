import React from 'react'
import { Pressable, StatusBar, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Avatar, Txt } from './ui'
import { colors, radius, spacing } from '@/theme'

/**
 * The coloured band every screen starts with.
 *
 * This is what stops the app reading as a spreadsheet. A grey page with black
 * headings gives the eye no anchor and no sense of place; a saturated band
 * with the content curving over it tells you instantly which app you are in
 * and where the screen begins.
 *
 * The colour is the *school's* own `primaryHex` where one is set, not ours.
 * The platform already promises white-labelling — the school's logo and
 * colours on the documents and the website — and this is the same promise
 * kept on the phone. Two schools' staff should not be looking at identical
 * violet apps.
 *
 * `curve` is the radius the white sheet lifts over the band by. It is the
 * whole trick: a flat join reads as two stacked rectangles, a curved one as
 * one designed surface.
 */

/** Slightly darker and lighter stops either side of the school's colour. */
function ramp(hex: string): [string, string] {
  const clean = hex.replace('#', '')
  const n = parseInt(clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255

  const shift = (amount: number) => {
    const to = (channel: number) =>
      Math.max(0, Math.min(255, Math.round(channel + (amount > 0 ? (255 - channel) : channel) * amount)))
    return `#${[to(r), to(g), to(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  }

  // Light at the top, deeper at the bottom: the same direction daylight comes
  // from, so it reads as depth rather than as a gradient for its own sake.
  return [shift(0.16), shift(-0.18)]
}

export function ScreenHeader({
  title,
  subtitle,
  tint = colors.brand,
  person,
  onAction,
  actionIcon,
  actionLabel,
  badge,
  onBack,
  children,
  curve = 26,
  style,
}: {
  title: string
  subtitle?: string
  tint?: string
  /** Shows an avatar on the left, for screens that greet somebody. */
  person?: string
  onAction?: () => void
  actionIcon?: React.ComponentProps<typeof Ionicons>['name']
  actionLabel?: string
  /** A dot on the action, for unread things. */
  badge?: boolean
  onBack?: () => void
  /** Anything that should sit inside the band, under the title. */
  children?: React.ReactNode
  curve?: number
  style?: StyleProp<ViewStyle>
}) {
  const insets = useSafeAreaInsets()
  const [from, to] = ramp(tint)

  return (
    <View style={style}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingTop: insets.top + spacing.md,
          paddingHorizontal: spacing.base,
          // The extra bottom padding is eaten by the sheet that curves over it,
          // so the visible band stays the height it looks.
          paddingBottom: curve + spacing.base,
          marginBottom: -curve,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
              style={{ width: 36, height: 44, justifyContent: 'center' }}
            >
              <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
            </Pressable>
          ) : person ? (
            <View style={{ marginRight: spacing.md }}>
              <Avatar name={person} size={44} onLight />
            </View>
          ) : null}

          <View style={{ flex: 1 }}>
            <Txt variant="h1" color="#FFFFFF" numberOfLines={1} accessibilityRole="header">
              {title}
            </Txt>
            {subtitle ? (
              <Txt variant="small" color="rgba(255,255,255,0.82)" numberOfLines={1} style={{ marginTop: 1 }}>
                {subtitle}
              </Txt>
            ) : null}
          </View>

          {onAction && actionIcon ? (
            <Pressable
              onPress={onAction}
              accessibilityRole="button"
              accessibilityLabel={actionLabel ?? 'Action'}
              hitSlop={10}
              style={({ pressed }) => [
                {
                  width: 42,
                  height: 42,
                  borderRadius: radius.pill,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name={actionIcon} size={21} color="#FFFFFF" />
              {badge ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 9,
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: colors.overdue,
                    borderWidth: 1.5,
                    borderColor: '#FFFFFF',
                  }}
                />
              ) : null}
            </Pressable>
          ) : null}
        </View>

        {children ? <View style={{ marginTop: spacing.base }}>{children}</View> : null}
      </LinearGradient>

      {/* The sheet. Nothing but a curved lid — the screen's own content sits
          below it and scrolls under nothing. */}
      <View
        style={{
          height: curve,
          backgroundColor: colors.bg,
          borderTopLeftRadius: curve,
          borderTopRightRadius: curve,
        }}
      />
    </View>
  )
}

/**
 * A section title inside the page.
 *
 * Coloured rather than black: in the reference designs these headings are what
 * break a long scroll into parts you can find your place in, and a black
 * heading at the same weight as the body does not do that.
 */
export function SectionTitle({
  children,
  tint = colors.brandDeep,
  action,
}: {
  children: React.ReactNode
  tint?: string
  action?: React.ReactNode
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.md }}>
      <Txt variant="h2" color={tint} style={{ flex: 1 }}>
        {children}
      </Txt>
      {action}
    </View>
  )
}
