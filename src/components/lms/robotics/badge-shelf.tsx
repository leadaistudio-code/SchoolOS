import { Code, Compass, Eye, Lock, Trophy, Wrench, Zap, type LucideIcon } from 'lucide-react'
import { earnedBadges } from '@/lib/lms/robotics101'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  'robot-explorer': Compass,
  'sensor-detective': Eye,
  'circuit-builder': Zap,
  'code-creator': Code,
  'robot-engineer': Wrench,
  'line-follower-champion': Trophy,
}

export function BadgeShelf({ completedSlugs }: { completedSlugs: Set<string> }) {
  const badges = earnedBadges(completedSlugs)
  const earned = badges.filter((b) => b.earned).length
  return (
    <section aria-labelledby="badges-heading" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 id="badges-heading" className="text-sm font-semibold text-ink">
          Badges
        </h2>
        <span className="text-xs text-ink-muted tnum">
          {earned} of {badges.length} earned
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {badges.map((b) => {
          const Icon = b.earned ? ICONS[b.id] ?? Trophy : Lock
          return (
            <li
              key={b.id}
              className={cn(
                'rounded-lg border p-2.5 text-xs',
                b.earned ? 'border-amber-300 bg-amber-50 text-ink' : 'border-line bg-surface-2 text-ink-muted',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'mb-1.5 grid size-8 place-items-center rounded-full',
                  b.earned ? 'bg-amber-400 text-amber-950' : 'bg-line text-ink-subtle',
                )}
              >
                <Icon className="size-4" />
              </span>
              <p className="font-semibold">{b.name}</p>
              <p className="mt-0.5 leading-snug">
                {b.earned ? b.description : `${b.done} of ${b.lessons.length} lessons done`}
              </p>
              <span className="sr-only">{b.earned ? 'Earned' : 'Not earned yet'}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
