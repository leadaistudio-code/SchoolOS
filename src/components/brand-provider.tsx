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
 * The derived ramp (hover, tint, contrast) is computed here rather than
 * stored, so a school only ever has to choose one colour.
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
--accent-500:${a};
--accent-600:${shade(a, -0.12)};
--radius:${palette.radius};
}`

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
