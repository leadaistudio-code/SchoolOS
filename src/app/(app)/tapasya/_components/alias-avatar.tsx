import { Bird, Cat, Feather, Flower2, Lamp, Mountain, Sparkles, TreeDeciduous, Waves, Wind, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export const AVATAR_ICON: Record<string, LucideIcon> = {
  lotus: Flower2,
  owl: Bird,
  mountain: Mountain,
  comet: Sparkles,
  banyan: TreeDeciduous,
  peacock: Feather,
  river: Waves,
  lamp: Lamp,
  tiger: Cat,
  kite: Wind,
}

/** Alias avatars are drawn from a fixed set: no uploaded photos on a public board. */
export function AliasAvatar({ avatarKey, className }: { avatarKey: string; className?: string }) {
  const I = AVATAR_ICON[avatarKey] ?? Flower2
  return (
    <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-50)] text-[var(--brand-600)]', className)}>
      <I className="size-4" aria-hidden />
    </span>
  )
}
