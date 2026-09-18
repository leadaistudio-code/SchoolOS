'use client'

import Link from 'next/link'
import { FileDown, Paperclip, Pin } from 'lucide-react'
import { BulkSelectionBar, downloadCsv, useBulkSelection } from '@/components/bulk-selection'
import { Badge, humanizeStatus } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/input'
import { Pagination } from '@/components/pagination'

type NoticeRow = {
  id: string
  title: string
  body: string
  audience: string
  publishOn: string
  pinned: boolean
  isPublished: boolean
  isExpired: boolean
  priority: string
  attachmentCount: number
}

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'neutral' | 'info'> = {
  URGENT: 'danger',
  HIGH: 'warning',
  NORMAL: 'neutral',
  LOW: 'info',
}

export function NoticeList({
  rows,
  total,
  page,
  pageSize,
  canExport,
}: {
  rows: NoticeRow[]
  total: number
  page: number
  pageSize: number
  canExport: boolean
}) {
  const selection = useBulkSelection(rows.map((row) => row.id))
  const selectedRows = rows.filter((row) => selection.selected.has(row.id))

  return (
    <>
      {canExport ? (
        <BulkSelectionBar count={selection.selected.size} noun="notice" onClear={selection.clear}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            downloadCsv(
              'notices.csv',
              ['Title', 'Audience', 'Publish date', 'Priority', 'Published', 'Pinned'],
              selectedRows.map((notice) => [
                notice.title,
                notice.audience,
                new Date(notice.publishOn).toLocaleDateString('en-IN'),
                humanizeStatus(notice.priority),
                notice.isPublished ? 'Yes' : 'No',
                notice.pinned ? 'Yes' : 'No',
              ]),
            )
          }
        >
          <FileDown aria-hidden />
          Export
        </Button>
        </BulkSelectionBar>
      ) : null}
      {canExport ? (
        <label className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-ink-muted">
          <Checkbox
            aria-label="Select all notices"
            checked={selection.allSelected}
            onChange={selection.toggleAll}
          />
          Select all notices on this page
        </label>
      ) : null}
      <ul className="divide-y divide-[var(--border)]">
        {rows.map((notice) => (
          <li key={notice.id} className="flex items-start gap-3 p-4 hover:bg-surface-2">
            {canExport ? (
              <Checkbox
                aria-label={`Select ${notice.title}`}
                checked={selection.selected.has(notice.id)}
                onChange={() => selection.toggle(notice.id)}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/communication/notices/${notice.id}`}
                    className="inline-flex items-center gap-1.5 text-base font-medium text-ink hover:text-[var(--brand-600)]"
                  >
                    {notice.pinned ? (
                      <Pin className="size-3.5 text-[var(--brand-600)]" aria-hidden />
                    ) : null}
                    {notice.title}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{notice.body}</p>
                  <p className="mt-1.5 text-xs text-ink-subtle">
                    {new Date(notice.publishOn).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {' · for '}
                    {notice.audience}
                    {notice.attachmentCount > 0 ? (
                      <span className="ml-1.5 inline-flex items-center gap-1">
                        <Paperclip className="size-3" aria-hidden />
                        {notice.attachmentCount}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!notice.isPublished ? <Badge tone="neutral">draft</Badge> : null}
                  {notice.isExpired ? <Badge tone="neutral">expired</Badge> : null}
                  {notice.priority !== 'NORMAL' ? (
                    <Badge tone={PRIORITY_TONE[notice.priority] ?? 'neutral'}>
                      {humanizeStatus(notice.priority)}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Pagination total={total} page={page} pageSize={pageSize} label="notices" />
    </>
  )
}
