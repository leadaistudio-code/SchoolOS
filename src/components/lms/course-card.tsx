import * as React from 'react'
import Link from 'next/link'
import { Bot, BrainCircuit, CircuitBoard, Code2, Cpu, Plane, Wifi, type LucideIcon } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { gradeRange, lmsCategory, lmsLevelLabel } from '@/lib/lms/options'

const CATEGORY_ICON: Record<string, LucideIcon> = {
  ROBOTICS: Bot,
  AI: BrainCircuit,
  CODING: Code2,
  ELECTRONICS: CircuitBoard,
  IOT: Wifi,
  DRONES: Plane,
  OTHER: Cpu,
}

export function CourseCard({
  href,
  title,
  subtitle,
  category,
  level,
  gradeFrom,
  gradeTo,
  lessons,
  minutes,
  badge,
  footer,
  percent,
}: {
  href: string
  title: string
  subtitle?: string | null
  category: string
  level: string
  gradeFrom?: number | null
  gradeTo?: number | null
  lessons: number
  minutes?: number
  badge?: React.ReactNode
  footer?: React.ReactNode
  /** Shows a progress bar when set. */
  percent?: number
}) {
  const c = lmsCategory(category)
  const Icon = CATEGORY_ICON[c.value] ?? Cpu
  const grades = gradeRange(gradeFrom ?? null, gradeTo ?? null)
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface transition-shadow hover:shadow-md focus-visible:shadow-md"
    >
      <div
        className="relative flex h-24 items-end justify-between px-4 pb-3"
        style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${c.colour} 22%, transparent), color-mix(in srgb, ${c.colour} 6%, transparent))` }}
      >
        <span className="grid size-11 place-items-center rounded-xl text-white shadow-sm" style={{ background: c.colour }}>
          <Icon className="size-6" aria-hidden />
        </span>
        {badge ? <div className="flex flex-wrap justify-end gap-1">{badge}</div> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="text-xs font-medium" style={{ color: c.colour }}>
          {c.label} · {lmsLevelLabel(level)}
        </p>
        <h3 className="text-base font-semibold text-ink group-hover:text-[var(--brand-600)] line-clamp-2">{title}</h3>
        {subtitle ? <p className="text-sm text-ink-muted line-clamp-2">{subtitle}</p> : null}
        <p className="mt-auto pt-2 text-xs text-ink-subtle">
          {lessons} lesson{lessons === 1 ? '' : 's'}
          {minutes ? ` · ${minutes} min` : ''}
          {grades ? ` · ${grades}` : ''}
        </p>
        {percent !== undefined ? (
          <div className="flex items-center gap-2 pt-1">
            <Progress value={percent} tone={percent >= 100 ? 'success' : 'brand'} />
            <span className="text-xs font-medium tnum text-ink-muted w-9 text-right">{percent}%</span>
          </div>
        ) : null}
        {footer ? <div className="pt-1 text-xs text-ink-muted">{footer}</div> : null}
      </div>
    </Link>
  )
}
