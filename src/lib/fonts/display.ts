import { Manrope } from 'next/font/google'

/**
 * The public display face, declared once.
 *
 * The marketing site and the Academy both use it. next/font must see a single
 * declaration: two identical `Manrope()` calls in separate layouts resolved
 * `--font-display` to the fallback faces only, and every headline set in Arial.
 */
export const displayFont = Manrope({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
})
