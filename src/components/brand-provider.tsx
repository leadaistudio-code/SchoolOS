import * as React from 'react'
import { contrastOn, shade } from '@/lib/utils'

export type BrandPalette = {
  primaryHex: string
  secondaryHex: string
  accentHex: string
  radius: string
}

/**
 * White-label theme engine.
 *
 * Emits the tenant palette as CSS custom properties so every component picks
 * up the school's identity without a rebuild, a Tailwind config change or a
 * single hardcoded colour in a component. Rendered server-side, so a branded
 * page never flashes the default first.
 *
 * The derived ramp (hover, tint, contrast, gradient) is computed here rather
 * than stored, so a school only ever has to choose one colour.
 */
export function BrandStyle({ palette }: { palette: BrandPalette }) {
  const p = palette.primaryHex
  const a = palette.accentHex

  const css = `:root{
--brand-500:${p};
--brand-600:${shade(p, -0.15)};
--brand-700:${shade(p, -0.3)};
--brand-100:${shade(p, 0.72)};
--brand-50:${shade(p, 0.92)};
--brand-contrast:${contrastOn(p)};
--brand-rgb:${toRgb(p)};
--accent-500:${a};
--accent-600:${shade(a, -0.12)};
--accent-50:${shade(a, 0.92)};
--radius:${palette.radius};
--grad-brand:linear-gradient(180deg, ${p} 0%, ${shade(p, 0.28)} 100%);
}`

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}

function toRgb(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '0, 0, 0'
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)).join(', ')
}
