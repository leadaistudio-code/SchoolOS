import { cn } from '@/lib/utils'

const BAND = {
  ready: { label: 'Ready', color: 'var(--success)' },
  nearly: { label: 'Nearly there', color: 'var(--warning)' },
  'not-ready': { label: 'Not ready', color: 'var(--danger)' },
} as const

/** Circular lab readiness score. */
export function ReadinessMeter({
  score,
  band,
  size = 76,
  className,
}: {
  score: number
  band: keyof typeof BAND
  size?: number
  className?: string
}) {
  const r = 30
  const c = 2 * Math.PI * r
  const { label, color } = BAND[band]
  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <svg width={size} height={size} viewBox="0 0 76 76" role="img" aria-label={`Readiness ${score}%, ${label}`}>
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          transform="rotate(-90 38 38)"
        />
        <text x="38" y="43" textAnchor="middle" className="fill-[var(--ink)] text-[17px] font-semibold">
          {score}%
        </text>
      </svg>
      <span className="text-xs font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  )
}
