'use client'

import * as icons from 'lucide-react'
import type { LucideProps } from 'lucide-react'

/**
 * Resolves an icon by name so the navigation tree can stay plain data that is
 * safe to send from a server component.
 */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = (icons as unknown as Record<string, React.ComponentType<LucideProps>>)[name]
  const Fallback = icons.Circle
  const C = Cmp ?? Fallback
  return <C aria-hidden {...props} />
}
