import { Paperclip, Pin } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getNotice } from '@/server/modules/notices/service'
import { formatBytes } from '@/lib/format'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const metadata = { title: 'Notice' }

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('notices.view')

  // getNotice applies the same audience filter as the list, so a guessed id
  // cannot be used to read a notice aimed at another class.
  const notice = await getNotice(ctx, id)

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={notice.title}
        description={notice.publishOn.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      />

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {notice.pinned ? (
              <Badge tone="brand">
                <Pin className="size-3" aria-hidden />
                pinned
              </Badge>
            ) : null}
            {notice.priority !== 'NORMAL' ? (
              <Badge tone={notice.priority === 'URGENT' ? 'danger' : 'warning'}>
                {notice.priority.toLowerCase()}
              </Badge>
            ) : null}
            {!notice.isPublished ? <Badge tone="neutral">draft</Badge> : null}
          </div>

          <p className="text-[14px] text-ink whitespace-pre-wrap leading-relaxed">{notice.body}</p>

          {notice.attachments.length > 0 ? (
            <ul className="mt-5 space-y-1.5 border-t border-line pt-4">
              {notice.attachments.map((a) => (
                <li key={a.id}>
                  <a
                    href={`/api/v1/files/${encodeURIComponent(a.storageKey)}`}
                    className="inline-flex items-center gap-2 text-[13px] text-[var(--brand-600)] hover:underline"
                  >
                    <Paperclip className="size-3.5" aria-hidden />
                    {a.fileName}
                    <span className="text-ink-subtle">{formatBytes(a.sizeBytes)}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}

          {notice.expiresOn ? (
            <p className="text-[12px] text-ink-subtle mt-5 border-t border-line pt-3">
              Shown until{' '}
              {notice.expiresOn.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              .
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
