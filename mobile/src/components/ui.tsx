import React from 'react'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { colors, layout, radius, shadow, spacing, type } from '@/theme'

/**
 * The shared pieces every screen is built from.
 *
 * Kept to the components that actually recur. A wrapper around a single View
 * with one style is not a component, it is indirection — so there isn't one.
 */

/* ------------------------------------------------------------------- text */

type TextVariant = keyof typeof type

export function Txt({
  variant = 'body',
  color = colors.text,
  style,
  children,
  numberOfLines,
  ...rest
}: {
  variant?: TextVariant
  color?: string
  style?: StyleProp<TextStyle>
  children: React.ReactNode
  numberOfLines?: number
  accessibilityRole?: 'header' | 'text'
}) {
  const preset = type[variant]
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontSize: preset.fontSize,
          lineHeight: preset.lineHeight,
          fontWeight: preset.fontWeight as TextStyle['fontWeight'],
          color,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  )
}

/* ----------------------------------------------------------------- screen */

/**
 * The frame every screen sits in.
 *
 * Owns the safe areas and the tablet width cap so no screen has to think about
 * either. `scroll` is opt-in: a screen whose body is a FlatList must not be
 * inside a ScrollView, which is the most common way a mobile list ends up
 * rendering all 900 rows at once.
 */
export function Screen({
  children,
  scroll = false,
  refreshing,
  onRefresh,
  padded = true,
  header,
  style,
}: {
  children: React.ReactNode
  scroll?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  padded?: boolean
  /**
   * The coloured band. Rendered full width, outside the screen padding and
   * above the scroll, and it handles its own top inset — so a screen with one
   * must not also claim the top safe area or the status bar is paid for twice.
   */
  header?: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const inner = (
    <View style={[{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', flex: scroll ? 0 : 1 }, padded && { paddingHorizontal: layout.screenPadding }, style]}>
      {children}
    </View>
  )

  const edges = header ? ([] as const) : (['top'] as const)

  if (!scroll) {
    return (
      <SafeAreaView edges={edges} style={s.screen}>
        {header}
        {inner}
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={edges} style={s.screen}>
      {header}
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />
          ) : undefined
        }
      >
        {inner}
      </ScrollView>
    </SafeAreaView>
  )
}

/* ------------------------------------------------------------------- card */

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  onPress?: () => void
  accessibilityLabel?: string
}) {
  const body = <View style={[s.card, style]}>{children}</View>
  if (!onPress) return body
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
    >
      {body}
    </Pressable>
  )
}

/* ----------------------------------------------------------------- button */

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const inactive = disabled || loading

  const ground =
    variant === 'primary' ? colors.brand
    : variant === 'danger' ? colors.danger
    : variant === 'secondary' ? colors.surface
    : 'transparent'

  const ink =
    variant === 'primary' || variant === 'danger' ? colors.textOnDark : colors.text

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: ground, opacity: inactive ? 0.55 : pressed ? 0.85 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.borderStrong },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ink} size="small" />
      ) : (
        <Txt variant="bodyStrong" color={ink}>{label}</Txt>
      )}
    </Pressable>
  )
}

/* ------------------------------------------------------------------ input */

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string | null
  hint?: string
  children: React.ReactNode
}) {
  return (
    <View style={{ marginBottom: spacing.base }}>
      <Txt variant="smallStrong" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
        {label}
      </Txt>
      {children}
      {error ? (
        <Txt variant="small" color={colors.danger} style={{ marginTop: spacing.xs }}>{error}</Txt>
      ) : hint ? (
        <Txt variant="small" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>{hint}</Txt>
      ) : null}
    </View>
  )
}

export const Input = React.forwardRef<TextInput, React.ComponentProps<typeof TextInput> & { invalid?: boolean }>(
  function Input({ invalid, style, ...rest }, ref) {
    return (
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textSubtle}
        style={[s.input, invalid && { borderColor: colors.danger }, style]}
        {...rest}
      />
    )
  },
)

/* -------------------------------------------------------------- statuses */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={s.centered} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.brand} />
      <Txt variant="small" color={colors.textSubtle} style={{ marginTop: spacing.md }}>{label}</Txt>
    </View>
  )
}

/**
 * Skeleton rows. Shown instead of a spinner where the shape of what is coming
 * is already known — it reads as "nearly there" rather than "nothing yet".
 */
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <View accessibilityLabel="Loading" style={{ paddingTop: spacing.sm }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: spacing.md }]}>
          <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken }} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <View style={{ height: 12, width: '55%', borderRadius: 4, backgroundColor: colors.surfaceSunken }} />
            <View style={{ height: 10, width: '35%', borderRadius: 4, backgroundColor: colors.surfaceSunken }} />
          </View>
        </View>
      ))}
    </View>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <View style={s.centered}>
      <Txt variant="h3" style={{ textAlign: 'center' }}>{title}</Txt>
      {body ? (
        <Txt variant="small" color={colors.textSubtle} style={{ textAlign: 'center', marginTop: spacing.sm, maxWidth: 320 }}>
          {body}
        </Txt>
      ) : null}
      {action ? <View style={{ marginTop: spacing.lg }}>{action}</View> : null}
    </View>
  )
}

/**
 * A failure the user can act on. Always offers the retry — an error screen
 * with no way forward is a dead end, and the commonest cause here is a tunnel.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={s.centered}>
      <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' }}>
        <Txt variant="h2" color={colors.danger}>!</Txt>
      </View>
      <Txt variant="bodyStrong" style={{ textAlign: 'center', marginTop: spacing.md }}>Could not load this</Txt>
      <Txt variant="small" color={colors.textSubtle} style={{ textAlign: 'center', marginTop: spacing.xs, maxWidth: 320 }}>
        {message}
      </Txt>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} style={{ marginTop: spacing.lg, minWidth: 160 }} /> : null}
    </View>
  )
}

/* ------------------------------------------------------------------ badge */

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  const map = {
    neutral: [colors.surfaceSunken, colors.textMuted],
    success: [colors.successBg, colors.success],
    warning: [colors.warningBg, colors.warning],
    danger: [colors.dangerBg, colors.danger],
    info: [colors.infoBg, colors.info],
  } as const
  const [bg, fg] = map[tone]
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' }}>
      <Txt variant="caption" color={fg}>{label}</Txt>
    </View>
  )
}

/* ----------------------------------------------------------------- avatar */

/**
 * Eight hues a name can land on.
 *
 * Chosen to be distinguishable at 40pt and to sit at a similar weight, so a
 * list reads as one thing in several colours rather than a bag of sweets.
 */
const AVATAR_HUES = [
  '#7C5CFC', '#2563EB', '#0891B2', '#10B981',
  '#F59E0B', '#F43F5E', '#EC4899', '#8B5CF6',
] as const

/**
 * Initials on a colour derived from the name.
 *
 * Deterministic, so the same child is the same colour on every screen and on
 * every phone — which is what makes it useful rather than decorative: you
 * start recognising a row before you have read it. A directory of 120 grey
 * circles gives the eye nothing to hold on to.
 */
export function Avatar({
  name,
  size = 40,
  onLight = false,
}: {
  name: string
  size?: number
  /** Sitting on the coloured header, where a tinted circle would disappear. */
  onLight?: boolean
}) {
  const clean = name.trim()
  const initials = clean.split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase()

  let hash = 0
  for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0
  const tint = AVATAR_HUES[hash % AVATAR_HUES.length]!

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: onLight ? 'rgba(255,255,255,0.22)' : `${tint}1F`,
        borderWidth: onLight ? 1.5 : 0,
        borderColor: 'rgba(255,255,255,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt variant="smallStrong" color={onLight ? '#FFFFFF' : tint} style={{ fontSize: size * 0.34 }}>
        {initials || '?'}
      </Txt>
    </View>
  )
}

/* ------------------------------------------------------------------ rows */

/** One tappable row in a list. The whole row is the target, not a chevron. */
export function ListRow({
  title,
  subtitle,
  right,
  left,
  onPress,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
  left?: React.ReactNode
  onPress?: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => [s.row, pressed && onPress ? { backgroundColor: colors.surfaceAlt } : null]}
    >
      {left}
      <View style={{ flex: 1, marginLeft: left ? spacing.md : 0 }}>
        <Txt variant="bodyStrong" numberOfLines={1}>{title}</Txt>
        {subtitle ? (
          <Txt variant="small" color={colors.textSubtle} numberOfLines={1} style={{ marginTop: 2 }}>{subtitle}</Txt>
        ) : null}
      </View>
      {right}
    </Pressable>
  )
}

/* ----------------------------------------------------------------- styles */

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  button: {
    minHeight: layout.tapTarget,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
  },
  input: {
    minHeight: layout.tapTarget,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 16, // 16 or Android zooms the field on focus.
    color: colors.text,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, minHeight: 220 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.tapTarget + 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
})

/* ------------------------------------------------------------------ tiles */

/**
 * A pressable that answers.
 *
 * A tap on a phone has no cursor and no hover, so without a visible reaction
 * the only feedback is the next screen appearing — and on a slow connection
 * that is a second of wondering whether the tap registered. This dips to 96%
 * on press-in and returns on release, with a light haptic, so the answer is
 * immediate and the same everywhere.
 *
 * The spring is `useNativeDriver`, so it runs on the UI thread and stays
 * smooth while JavaScript is busy fetching whatever was just asked for.
 */
export function Springy({
  onPress,
  children,
  style,
  accessibilityLabel,
  disabled,
}: {
  onPress: () => void
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
  disabled?: boolean
}) {
  const scale = React.useRef(new Animated.Value(1)).current

  const to = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start()

  return (
    <Pressable
      onPressIn={() => { if (!disabled) { to(0.96); Haptics.selectionAsync().catch(() => {}) } }}
      onPressOut={() => to(1)}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.5 : 1 }}>
        {children}
      </Animated.View>
    </Pressable>
  )
}

/**
 * The coloured square an icon sits in.
 *
 * Solid rather than tinted-at-10%: a wash of pastel reads as decoration, and
 * the point of the colour is that it identifies the module. `soft` is for
 * places where a full-strength block would shout — a list row rather than a
 * grid tile.
 */
export function IconTile({
  icon,
  tint,
  size = 52,
  soft = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  tint: string
  size?: number
  soft?: boolean
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: soft ? `${tint}1A` : tint,
      }}
    >
      <Ionicons name={icon} size={size * 0.46} color={soft ? tint : '#FFFFFF'} />
    </View>
  )
}

/** One module in a grid: coloured tile, label under it, whole thing tappable. */
export function ModuleTile({
  icon,
  label,
  tint,
  onPress,
  width,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  label: string
  tint: string
  onPress: () => void
  width: string | number
}) {
  return (
    <Springy onPress={onPress} accessibilityLabel={label} style={{ width } as ViewStyle}>
      <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
        <IconTile icon={icon} tint={tint} />
        <Txt
          variant="caption"
          color={colors.textMuted}
          numberOfLines={2}
          style={{ marginTop: spacing.sm, textAlign: 'center', lineHeight: 14 }}
        >
          {label}
        </Txt>
      </View>
    </Springy>
  )
}
