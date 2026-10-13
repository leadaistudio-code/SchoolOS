import Link from 'next/link'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { listParentQueries } from '@/server/modules/whatsapp-bot/service'
import { ColorBanner } from '@/components/dashboard/color-tiles'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LinkTabs } from '@/components/ui/tabs'
import { EmptyState } from '@/components/ui/states'
import { maskPhone } from '@/lib/phone'
import { ReplyBox } from './reply-box'

export const metadata = { title: 'Parent queries' }

const STATUSES = ['OPEN', 'RESOLVED', 'ALL'] as const

export default async function ParentQueriesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireContext('messages.parent_queries')
  const sp = await searchParams
  const status = STATUSES.find((s) => s === sp.status) ?? 'OPEN'
  const queries = await listParentQueries(ctx, status)

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="parents"
        eyebrow="Front office"
        title="Parent messages from WhatsApp"
        description="Questions the WhatsApp assistant could not answer. Your reply goes back to the parent's WhatsApp."
      />
      <LinkTabs
        label="Message status"
        items={[
          { href: '/front-office/parent-queries', label: 'Waiting', active: status === 'OPEN' },
          { href: '/front-office/parent-queries?status=RESOLVED', label: 'Resolved', active: status === 'RESOLVED' },
          { href: '/front-office/parent-queries?status=ALL', label: 'All', active: status === 'ALL' },
        ]}
      />
      {queries.length === 0 ? (
        <Card variant="elevated">
          <CardContent className="pt-5">
            <EmptyState
              title={status === 'OPEN' ? 'Nothing waiting' : 'No messages'}
              description="When a parent picks “Message the school office” on WhatsApp, it lands here."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {queries.map((q) => {
            const e = q.student?.enrollments[0]
            const from = q.parent ? `${q.parent.firstName} ${q.parent.lastName}`.trim() : q.senderName ?? 'Parent'
            return (
              <Card key={q.id} variant="elevated">
                <CardContent className="space-y-3 pt-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{from}</p>
                    <span className="text-xs text-ink-subtle">{maskPhone(q.phone)}</span>
                    {q.student ? (
                      <Link href={`/students/${q.student.id}`} className="text-xs text-brand hover:underline">
                        re {q.student.firstName} {q.student.lastName}
                        {e ? ` · ${e.classLevel.name} ${e.section.name}` : ''}
                      </Link>
                    ) : null}
                    <span className="ml-auto text-xs text-ink-subtle">{format(q.createdAt, 'd MMM, HH:mm')}</span>
                    <Badge tone={q.status === 'OPEN' ? 'warning' : 'success'}>{q.status === 'OPEN' ? 'Waiting' : 'Resolved'}</Badge>
                  </div>
                  <p className="whitespace-pre-wrap rounded-[var(--radius-sm)] bg-bg p-3 text-sm text-ink">{q.message}</p>
                  {q.reply ? (
                    <p className="whitespace-pre-wrap rounded-[var(--radius-sm)] border-l-2 border-brand pl-3 text-sm text-ink-muted">
                      {q.reply}
                      {q.repliedAt ? <span className="mt-1 block text-xs text-ink-subtle">Replied {format(q.repliedAt, 'd MMM, HH:mm')}</span> : null}
                    </p>
                  ) : null}
                  {q.status === 'OPEN' ? <ReplyBox id={q.id} /> : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
