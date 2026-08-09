import Link from 'next/link'
import { Paperclip, Pin, Plus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listNotices } from '@/server/modules/notices/service'
import { parseListQuery } from '@/lib/query'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { buttonVariants } from '@/components/ui/button-variants'

export const metadata = { title: 'Notices' }

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'neutral' | 'info'> = {
  URGENT: 'danger',
  HIGH: 'warning',
  NORMAL: 'neutral',
  LOW: 'info',
}

export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('notices.view')
  const params = await searchParams
  const query = parseListQuery(params)

  const { rows, total } = await listNotices(ctx, query, { priority: params.priority })
  const canPublish = ctx.can('notices.publish')

  return (
    <div>
      <PageHeader
        title="Notice board"
        description={
          canPublish
            ? 'Everything posted, including drafts and expired notices.'
            : 'Announcements for you and your classes.'
        }
        actions={
          ctx.can('notices.create') ? (
            <Link href="/communication/notices/new" className={buttonVariants({ size: 'sm' })}>
              <Plus className="size-4" aria-hidden />
              Post a notice
            </Link>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        <SearchBar placeholder="Search notices" />

        {rows.length === 0 ? (
          <EmptyState
            title={params.q ? 'No notices match that search' : 'No notices'}
            description={
              canPublish
                ? 'Post a notice and choose who should see it.'
                : 'Announcements from the school will appear here.'
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-[var(--border)]">
              {rows.map((n) => (
                <li key={n.id} className="p-4 hover:bg-surface-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/communication/notices/${n.id}`}
                        className="text-[14px] font-medium text-ink hover:text-[var(--brand-600)] inline-flex items-center gap-1.5"
                      >
                        {n.pinned ? (
                          <Pin className="size-3.5 text-[var(--brand-600)]" aria-hidden />
                        ) : null}
                        {n.title}
                      </Link>
                      <p className="text-[13px] text-ink-muted mt-1 line-clamp-2">{n.body}</p>
                      <p className="text-[12px] text-ink-subtle mt-1.5">
                        {n.publishOn.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {' · for '}
                        {n.audience}
                        {n.attachmentCount > 0 ? (
                          <span className="inline-flex items-center gap-1 ml-1.5">
                            <Paperclip className="size-3" aria-hidden />
                            {n.attachmentCount}
                          </span>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!n.isPublished ? <Badge tone="neutral">draft</Badge> : null}
                      {n.isExpired ? <Badge tone="neutral">expired</Badge> : null}
                      {n.priority !== 'NORMAL' ? (
                        <Badge tone={PRIORITY_TONE[n.priority] ?? 'neutral'}>
                          {n.priority.toLowerCase()}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination total={total} page={query.page} pageSize={query.pageSize} label="notices" />
          </>
        )}
      </Card>
    </div>
  )
}
