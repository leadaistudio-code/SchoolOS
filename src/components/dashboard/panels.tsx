import * as React from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  Bus,
  CalendarDays,
  ClipboardList,
  FileCheck,
  Mail,
  MessageSquare,
  Phone,
  Radio,
  UserRoundPlus,
  Wallet,
  WifiOff,
} from 'lucide-react'
import { formatDay } from '@/lib/dates'
import { formatMoney, formatNumber } from '@/lib/utils'
import { Avatar } from '@/components/ui/identity'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyCalendarScene } from '@/components/illustrations/school-scene'
import { cn } from '@/lib/utils'
import type { TransportDashboardBus } from '@/server/modules/transport/service'

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

export type ActivityRow = {
  id: string
  action: string
  summary: string | null
  actorLabel: string | null
  createdAt: Date
}

/** Maps an audit action onto the icon a reader will recognise it by. */
function activityIcon(action: string) {
  const domain = action.split('.')[0]
  if (domain === 'payment' || domain === 'invoice' || domain === 'fee') return Wallet
  if (domain === 'attendance') return CalendarDays
  if (domain === 'homework' || domain === 'classwork') return ClipboardList
  if (domain === 'exam' || domain === 'result') return FileCheck
  if (domain === 'student' || domain === 'lead') return UserRoundPlus
  if (domain === 'bus' || domain === 'route' || domain === 'trip' || domain === 'transport') return Bus
  return MessageSquare
}

/**
 * What has happened in the school today, newest first.
 *
 * Read from the audit log rather than assembled from each module, so it cannot
 * fall out of step with what was actually recorded — and so an entry here is
 * evidence, not a summary written twice.
 */
export function RecentActivity({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return <PanelEmpty title="Nothing recorded yet" description="Activity appears here as staff work through the day." />
  }

  return (
    <ol className="relative space-y-0">
      {rows.map((row, index) => {
        const ActivityIcon = activityIcon(row.action)
        const last = index === rows.length - 1
        return (
          <li key={row.id} className="relative flex gap-3 pb-3.5 last:pb-0">
            {/* The rail is drawn per row so it stops cleanly at the last one. */}
            {!last ? (
              <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-line" aria-hidden />
            ) : null}
            <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-muted ring-1 ring-[var(--border)]">
              <ActivityIcon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-sm text-ink">{row.summary ?? row.action}</p>
              <p className="text-xs text-ink-subtle">
                <span className="tnum">{format(row.createdAt, 'HH:mm')}</span>
                {' · '}
                {row.actorLabel ?? 'System'}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Upcoming events
// ---------------------------------------------------------------------------

export type UpcomingItem = {
  id: string
  title: string
  kind: string
  at: Date
  href: string
}

/** Term dates, examinations and school events on one list. */
export function UpcomingEvents({ items }: { items: UpcomingItem[] }) {
  if (items.length === 0) {
    return (
      <PanelEmpty
        title="Your calendar is clear"
        description="Examinations and school events appear here as they are scheduled."
        art={<EmptyCalendarScene className="mx-auto h-20 w-24" />}
      />
    )
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="flex items-center gap-3 rounded-[var(--radius-sm)] p-1.5 transition-colors hover:bg-surface-2"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-[var(--product-50)] text-center leading-none">
              <span className="block text-[15px] font-bold tnum text-[var(--product-600)]">
                {format(item.at, 'd')}
              </span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--product-600)]/70">
                {format(item.at, 'MMM')}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
              <span className="block truncate text-xs text-ink-subtle first-letter:uppercase">
                {item.kind.toLowerCase().replaceAll('_', ' ')}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Staff directory
// ---------------------------------------------------------------------------

export type StaffRow = {
  id: string
  firstName: string
  lastName: string
  photoUrl: string | null
  designation: string | null
  department: string | null
  email: string | null
  phone: string | null
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null
}

/**
 * The people behind the numbers.
 *
 * An uploaded photograph wins where one exists. Where it does not — which is
 * most records — the card draws an illustrated portrait keyed to the person's
 * name and gender, so the directory can be scanned by face rather than read
 * letter by letter. Email and phone are real links: on a phone, tapping the
 * handset dials.
 */
export function StaffDirectory({ rows }: { rows: StaffRow[] }) {
  if (rows.length === 0) {
    return <PanelEmpty title="No staff records" description="Add staff to see them here." />
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((person) => (
        <div
          key={person.id}
          className="lift rounded-[var(--radius)] border border-line bg-surface p-3.5"
        >
          <div className="flex items-center gap-2.5">
            <Avatar
              firstName={person.firstName}
              lastName={person.lastName}
              avatarUrl={person.photoUrl}
              gender={person.gender}
              className="size-11"
            />
            <div className="min-w-0">
              <Link
                href={`/staff/${person.id}`}
                className="block truncate text-sm font-semibold text-ink hover:text-[var(--product-600)]"
              >
                {person.firstName} {person.lastName}
              </Link>
              <p className="truncate text-xs text-ink-subtle">
                {person.designation ?? 'Staff'}
                {person.department ? ` · ${person.department}` : ''}
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-1 border-t border-line pt-2.5">
            {person.email ? (
              <a
                href={`mailto:${person.email}`}
                className="flex items-center gap-1.5 truncate text-xs text-ink-muted hover:text-[var(--product-600)]"
              >
                <Mail className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                <span className="truncate">{person.email}</span>
              </a>
            ) : null}
            {person.phone ? (
              <a
                href={`tel:${person.phone}`}
                className="flex items-center gap-1.5 truncate text-xs tnum text-ink-muted hover:text-[var(--product-600)]"
              >
                <Phone className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
                {person.phone}
              </a>
            ) : null}
            {!person.email && !person.phone ? (
              <p className="text-xs text-ink-subtle">No contact details on record</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

const TRANSPORT_STATUS: Record<TransportDashboardBus['status'], { label: string; tone: BadgeTone }> = {
  RUNNING: { label: 'On the road', tone: 'success' },
  NO_SIGNAL: { label: 'No signal', tone: 'warning' },
  PARKED: { label: 'Parked', tone: 'neutral' },
}

/**
 * Fleet status.
 *
 * The case worth catching is a bus that is out on a run but has stopped
 * reporting — children are travelling and nobody can see where — so that state
 * gets its own colour rather than being folded into "not running".
 */
export function TransportSnapshot({
  rows,
  running,
  noSignal,
  riders,
}: {
  rows: TransportDashboardBus[]
  running: number
  noSignal: number
  riders: number
}) {
  if (rows.length === 0) {
    return <PanelEmpty title="No buses in service" description="Add a bus and a route to track it here." />
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-sm)] bg-line">
        <Stat label="On the road" value={String(running)} icon={<Radio className="size-3.5" aria-hidden />} />
        <Stat
          label="No signal"
          value={String(noSignal)}
          icon={<WifiOff className="size-3.5" aria-hidden />}
          alarm={noSignal > 0}
        />
        <Stat label="Travelling" value={formatNumber(riders)} icon={<Bus className="size-3.5" aria-hidden />} />
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {rows.map((bus) => {
          const status = TRANSPORT_STATUS[bus.status]
          return (
            <li key={bus.id}>
              <Link
                href="/transport/tracking"
                className="flex items-center gap-2.5 py-2 transition-colors hover:bg-surface-2"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-[var(--chart-transport)]/12 text-[var(--chart-transport)]">
                  <Bus className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{bus.code}</span>
                  <span className="block truncate text-xs text-ink-subtle">
                    {bus.routeName ?? 'No route'}
                  </span>
                </span>
                <Badge tone={status.tone} dot={bus.status === 'RUNNING'}>
                  {status.label}
                </Badge>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
  alarm,
}: {
  label: string
  value: string
  icon: React.ReactNode
  alarm?: boolean
}) {
  return (
    <div className="bg-surface px-2.5 py-2">
      <p className="flex items-center gap-1 text-[11px] text-ink-subtle">
        {icon}
        {label}
      </p>
      <p className={cn('text-lg font-semibold tnum', alarm ? 'text-warning' : 'text-ink')}>{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Admission enquiries
// ---------------------------------------------------------------------------

export type LeadRow = {
  id: string
  studentName: string
  parentName: string
  phone: string
  source: string | null
  stage: string
  className: string | null
  createdAt: Date
  nextFollowUpOn: Date | null
}

/**
 * Newest enquiries.
 *
 * Priority is derived from how long a lead has been waiting rather than stored:
 * an enquiry nobody has answered today is the one that needs a call, and a
 * field nobody maintains would say nothing.
 */
function leadPriority(lead: LeadRow): { label: string; tone: BadgeTone } {
  const hours = (Date.now() - lead.createdAt.getTime()) / 3_600_000
  const overdueFollowUp = lead.nextFollowUpOn !== null && lead.nextFollowUpOn.getTime() < Date.now()

  if (overdueFollowUp || hours > 48) return { label: 'High', tone: 'danger' }
  if (hours > 6) return { label: 'Medium', tone: 'warning' }
  return { label: 'New', tone: 'success' }
}

export function InquiriesSnapshot({ rows }: { rows: LeadRow[] }) {
  if (rows.length === 0) {
    return (
      <PanelEmpty
        title="No open enquiries"
        description="New admission enquiries appear here as they are captured."
      />
    )
  }

  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((lead) => {
        const priority = leadPriority(lead)
        return (
          <li key={lead.id} className="flex items-center gap-3 py-2.5">
            <Avatar
              firstName={lead.studentName.split(' ')[0] ?? lead.studentName}
              lastName={lead.studentName.split(' ')[1] ?? lead.parentName}
              className="size-9"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{lead.studentName}</p>
              <p className="truncate text-xs text-ink-subtle">
                {lead.className ? `${lead.className} admission` : 'General enquiry'}
                {lead.source ? ` · ${lead.source.replaceAll('_', ' ').toLowerCase()}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Badge tone={priority.tone}>{priority.label}</Badge>
              <p className="mt-0.5 text-[11px] text-ink-subtle">{sinceLabel(lead.createdAt)}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function sinceLabel(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return formatDay(date, 'd MMM')
}

// ---------------------------------------------------------------------------
// Fee legend
// ---------------------------------------------------------------------------

export function FeeLegend({
  rows,
  currency,
}: {
  rows: { label: string; amountMinor: number; color: string }[]
  currency: string
}) {
  const total = rows.reduce((sum, row) => sum + row.amountMinor, 0)

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-2.5">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: row.color }}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-ink-subtle">{row.label}</span>
            <span className="block text-sm font-semibold tnum text-ink">
              {formatMoney(row.amountMinor, currency)}
            </span>
          </span>
          <span className="shrink-0 text-sm font-medium tnum text-ink-muted">
            {total > 0 ? Math.round((row.amountMinor / total) * 100) : 0}%
          </span>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Shared empty state
// ---------------------------------------------------------------------------

export function PanelEmpty({
  title,
  description,
  art,
  action,
}: {
  title: string
  description?: string
  art?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="grid place-items-center px-4 py-8 text-center">
      <div>
        {art ? <div className="mb-2 opacity-80">{art}</div> : null}
        <p className="text-sm font-medium text-ink">{title}</p>
        {description ? (
          <p className="mx-auto mt-1 max-w-[22rem] text-xs text-ink-muted">{description}</p>
        ) : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  )
}
