import * as React from 'react'
import Link from 'next/link'
import { Icon } from '@/components/shell/icon'
import { cn } from '@/lib/utils'
import { seriesToneClass } from '@/lib/chart-tones'
import type { SeriesKey } from './charts'

export type QuickAction = {
  label: string
  href: string
  icon: string
  tone: SeriesKey
  /** Permission required to reach the destination. */
  permission: string
}

/**
 * The eight things an administrator starts a task with.
 *
 * Every tile is a link to a screen that exists and that this user is allowed
 * to open — the list is filtered by permission on the server, so a teacher
 * never sees a fee-collection tile that would bounce them off a 403. A tile
 * that cannot do anything has no business being here.
 */
export const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Add student', href: '/students/new', icon: 'UserPlus', tone: 'students', permission: 'students.create' },
  { label: 'Add staff', href: '/staff', icon: 'Briefcase', tone: 'staff', permission: 'staff.create' },
  { label: 'Mark attendance', href: '/attendance', icon: 'CalendarCheck', tone: 'attendance', permission: 'attendance.mark' },
  { label: 'Collect fee', href: '/finance/collect', icon: 'BadgeIndianRupee', tone: 'fees', permission: 'fees.collect' },
  { label: 'Add notice', href: '/communication/notices/new', icon: 'Megaphone', tone: 'overdue', permission: 'notices.manage' },
  { label: 'Set homework', href: '/academics/homework/new', icon: 'ClipboardList', tone: 'admissions', permission: 'homework.manage' },
  { label: 'New exam', href: '/exams/new', icon: 'FileCheck', tone: 'late', permission: 'exams.manage' },
  { label: 'Transport', href: '/transport/tracking', icon: 'Bus', tone: 'transport', permission: 'transport.track' },
]

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null

  return (
    <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-8">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="widget lift group flex w-24 shrink-0 flex-col items-center gap-2 px-2 py-3 text-center sm:w-auto"
        >
          <span
            className={cn(
              'grid size-10 place-items-center rounded-[12px] transition-transform duration-150 group-hover:scale-105',
              seriesToneClass(action.tone),
            )}
          >
            <Icon name={action.icon} className="size-5" />
          </span>
          <span className="text-xs font-medium leading-tight text-ink-muted group-hover:text-ink">
            {action.label}
          </span>
        </Link>
      ))}
    </div>
  )
}
