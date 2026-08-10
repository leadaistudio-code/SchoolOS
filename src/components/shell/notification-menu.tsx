'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell,
  BookOpen,
  Bus,
  CalendarCheck,
  CheckCheck,
  Loader2,
  Settings2,
  UserRoundPlus,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Category = 'Attendance' | 'Fees' | 'Admissions' | 'Transport' | 'Academic' | 'System'

type NotificationRow = {
  id: string
  title: string
  body: string
  linkUrl: string | null
  readAt: string | null
  createdAt: string
  category: Category
}

const CATEGORY: Record<Category, { icon: React.ElementType; className: string }> = {
  Attendance: { icon: CalendarCheck, className: 'bg-success-bg text-success' },
  Fees: { icon: Wallet, className: 'bg-info-bg text-info' },
  Admissions: { icon: UserRoundPlus, className: 'bg-[var(--product-50)] text-[var(--product-600)]' },
  Transport: { icon: Bus, className: 'bg-warning-bg text-warning' },
  Academic: { icon: BookOpen, className: 'bg-[var(--product-50)] text-[var(--product-600)]' },
  System: { icon: Settings2, className: 'bg-surface-3 text-ink-muted' },
}

const FILTERS: (Category | 'All')[] = ['All', 'Attendance', 'Fees', 'Academic', 'Transport']

/**
 * The notification bell.
 *
 * Loads on open rather than on mount: an unread count already arrives with the
 * page, and a user who never opens the menu should not pay for a request on
 * every navigation. Clicking an entry marks it read and goes where it points,
 * so the badge reflects what has actually been dealt with.
 */
export function NotificationMenu({ initialUnread }: { initialUnread: number }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [rows, setRows] = React.useState<NotificationRow[] | null>(null)
  const [unread, setUnread] = React.useState(initialUnread)
  const [filter, setFilter] = React.useState<Category | 'All'>('All')
  const [error, setError] = React.useState(false)
  const boxRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false

    const load = async () => {
      setError(false)
      try {
        const response = await fetch('/api/v1/notifications', { cache: 'no-store' })
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as {
          data: { unread: number; rows: NotificationRow[] }
        }
        if (cancelled) return
        setRows(body.data.rows)
        setUnread(body.data.unread)
      } catch {
        if (!cancelled) setError(true)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [open])

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const markAll = async () => {
    setUnread(0)
    setRows((current) =>
      current?.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })) ?? null,
    )
    await fetch('/api/v1/notifications', { method: 'POST', body: '{}' }).catch(() => undefined)
    router.refresh()
  }

  const openRow = async (row: NotificationRow) => {
    setOpen(false)
    if (!row.readAt) {
      setUnread((n) => Math.max(0, n - 1))
      await fetch('/api/v1/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      }).catch(() => undefined)
      router.refresh()
    }
    if (row.linkUrl) router.push(row.linkUrl)
  }

  const visible = rows?.filter((row) => filter === 'All' || row.category === filter) ?? null

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="relative grid size-9 place-items-center rounded-[10px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-semibold tnum text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="pop-in absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-[var(--shadow-pop)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <p className="text-sm font-semibold text-ink">
              Notifications
              {unread > 0 ? <span className="ml-1.5 text-xs text-ink-subtle">{unread} new</span> : null}
            </p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                className="flex items-center gap-1 text-xs text-[var(--product-600)] hover:underline"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="scroll-thin flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
            {FILTERS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                aria-pressed={filter === item}
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  filter === item
                    ? 'bg-[var(--product-500)] text-white'
                    : 'text-ink-muted hover:bg-surface-2',
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="max-h-[22rem] overflow-y-auto scroll-thin">
            {error ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">
                Notifications could not be loaded.
              </p>
            ) : visible === null ? (
              <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-ink-subtle">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading
              </p>
            ) : visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">
                {filter === 'All' ? 'Nothing new. You are all caught up.' : `No ${filter.toLowerCase()} notifications.`}
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {visible.map((row) => {
                  const meta = CATEGORY[row.category]
                  const CategoryIcon = meta.icon
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openRow(row)}
                        className={cn(
                          'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
                          !row.readAt && 'bg-[var(--product-50)]/50',
                        )}
                      >
                        <span className={cn('mt-0.5 grid size-7 shrink-0 place-items-center rounded-full', meta.className)}>
                          <CategoryIcon className="size-3.5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-ink">{row.title}</span>
                            {!row.readAt ? (
                              <span className="size-1.5 shrink-0 rounded-full bg-[var(--product-500)]" aria-label="Unread" />
                            ) : null}
                          </span>
                          <span className="mt-0.5 block line-clamp-2 text-xs text-ink-muted">{row.body}</span>
                          <span className="mt-0.5 block text-[11px] text-ink-subtle">
                            {relativeTime(row.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <Link
            href="/communication/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-3 py-2.5 text-center text-sm text-[var(--product-600)] hover:bg-surface-2"
          >
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  )
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
