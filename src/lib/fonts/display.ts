import localFont from 'next/font/local'

/**
 * The public display face, declared once and self-hosted.
 *
 * The marketing site and the Academy both use it. next/font must see a single
 * declaration: two identical `Manrope()` calls in separate layouts resolved
 * `--font-display` to the fallback faces only, and every headline set in Arial.
 *
 * The file is committed rather than fetched through `next/font/google`
 * because the Google loader in Next 15.5 crashes when Google Fonts returns a
 * file URL without an extension, which failed the production build. This is
 * Manrope's variable latin subset, so one file covers both weights.
 */
export const displayFont = localFont({
  src: './manrope-latin.woff2',
  weight: '600 700',
  variable: '--font-display',
  display: 'swap',
})
