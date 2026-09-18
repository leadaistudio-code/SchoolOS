import Link from 'next/link'
import { Megaphone, Paperclip, Pin, Plus } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listNotices } from '@/server/modules/notices/service'
import { parseListQuery } from '@/lib/query'
import { formatNumber } from '@/lib/utils'
import {
  ColorBanner,
  ColorTile,
  colorBannerPrimaryBtn,
} from '@/components/dashboard/color-tiles'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SearchBar } from '@/components/search-bar'
import { NoticeList } from './notice-list'

export const metadata = { title: 'Notices' }

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
  const pinned = rows.filter((n) => n.pinned).length
  const drafts = rows.filter((n) => !n.isPublished).length

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="pending"
        eyebrow="Notices"
        title={
          total > 0
            ? `${formatNumber(total)} notices on the board`
            : 'Notice board'
        }
        description={
          canPublish
            ? 'Everything posted, including drafts and expired notices.'
            : 'Announcements for you and your classes.'
        }
        actions={
          ctx.can('notices.create') ? (
            <Link href="/communication/notices/new" className={colorBannerPrimaryBtn()}>
              <Plus aria-hidden />
              Post a notice
            </Link>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Notices"
          value={formatNumber(total)}
          sub="Matching these filters"
          tone="pending"
          href="#notices-list"
          icon={<Megaphone className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Pinned on page"
          value={formatNumber(pinned)}
          sub="Shown at the top"
          tone="admissions"
          href="#notices-list"
          icon={<Pin className="size-5" aria-hidden />}
          delayMs={80}
        />
        {canPublish ? (
          <ColorTile
            label="Drafts on page"
            value={formatNumber(drafts)}
            sub="Not yet published"
            tone="staff"
            href="#notices-list"
            icon={<Paperclip className="size-5" aria-hidden />}
            delayMs={120}
          />
        ) : null}
      </div>

      <Card id="notices-list" variant="elevated" className="scroll-mt-20 overflow-hidden">
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
          <NoticeList
            rows={rows.map((notice) => ({
              ...notice,
              publishOn: notice.publishOn.toISOString(),
            }))}
            total={total}
            page={query.page}
            pageSize={query.pageSize}
            canExport={canPublish}
          />
        )}
      </Card>
    </div>
  )
}
