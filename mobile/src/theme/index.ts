/**
 * The mobile design system.
 *
 * Every value here is lifted from the web application's own tokens
 * (src/styles/globals.css) or the brand master, so the two clients cannot
 * drift into looking like different products. Nothing in a screen file should
 * contain a raw hex code, a magic pixel number or a font size — if something
 * is missing, it belongs here first.
 *
 * A school's own colours are a separate concern: `primaryHex` arrives per
 * tenant from the API and is applied at runtime, so this palette describes
 * MyCampusView, not the school.
 */

/* ------------------------------------------------------------------ colour */

export const colors = {
  /** Product identity. Deliberately not tenant-controlled — see globals.css. */
  brand: '#635BFF',
  brandDeep: '#4338CA',
  brandSoft: '#F1F0FF',

  /** The logo's own navy. Used for the app bar ground, splash and icon. */
  navy: '#0A1A3F',
  navySoft: '#16295A',

  /** Text. */
  text: '#101828',
  textMuted: '#4A5568',
  textSubtle: '#737F93',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: '#AFBBD4',

  /** Surfaces. A cool tint rather than grey: white cards need something to sit on. */
  bg: '#F6F8FC',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F9FD',
  surfaceSunken: '#EEF1F8',

  border: '#E4E8F1',
  borderStrong: '#D2D8E6',

  /** Semantic. */
  success: '#17734A',
  successBg: '#E9F4EE',
  warning: '#93590A',
  warningBg: '#FBF2E3',
  danger: '#B42318',
  dangerBg: '#FDECEB',
  info: '#175CD3',
  infoBg: '#EAF1FD',

  /**
   * Series colours. Fixed across tenants on purpose: "students are purple" has
   * to mean the same thing on every school's screen, or a shared screenshot
   * lies.
   */
  students: '#7C5CFC',
  staff: '#F59E0B',
  attendance: '#10B981',
  fees: '#2563EB',
  pending: '#F59E0B',
  overdue: '#F43F5E',
  admissions: '#6366F1',
  transport: '#06B6D4',
} as const

/* ----------------------------------------------------------------- spacing */

/** A 4pt grid. Screens use the named steps, never arbitrary numbers. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

/* ------------------------------------------------------------------ radius */

export const radius = {
  sm: 8,
  base: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const

/* -------------------------------------------------------------- typography */

/**
 * Sizes track the web scale but start one step larger: a phone is held further
 * from the eye than a monitor is, and 13px body text that reads as "dense and
 * professional" on a desktop reads as "I cannot read this" at arm's length.
 */
export const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  h1: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  h2: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  smallStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: '500' },
  /** Figures on cards. Tabular so a changing number does not jitter. */
  metric: { fontSize: 24, lineHeight: 29, fontWeight: '700' },
} as const

/* ----------------------------------------------------------------- shadows */

/**
 * Soft and low. A card is separated by a hairline; the shadow only says "this
 * floats above the page". Android reads `elevation` and ignores the rest.
 */
export const shadow = {
  card: {
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#101828',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const

/* ------------------------------------------------------------------ layout */

export const layout = {
  /**
   * Android's own guidance is 48dp for a touch target, and it is a floor, not
   * a target. Every pressable in the app is measured against this.
   */
  tapTarget: 48,
  screenPadding: spacing.base,
  /** Tablets: content stops widening rather than stretching a list to 1000pt. */
  maxContentWidth: 640,
} as const

export const theme = { colors, spacing, radius, type, shadow, layout } as const
export type Theme = typeof theme
