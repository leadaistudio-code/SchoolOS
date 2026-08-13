import Link from 'next/link'
import { format } from 'date-fns'
import { requireSupportContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getTenantTicket } from '@/server/modules/platform/support'
import { replyTicketAction } from '../actions'

export const metadata = { title: 'Support ticket' }

export default async function HelpTicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await requireSupportContext('support.view')
  const ticket = await getTenantTicket(ctx, id)

  return (
    <div className="space-y-4">
      <PageHeader
        title={ticket.subject}
        description={`${ticket.status.toLowerCase()} · opened ${format(ticket.createdAt, 'd MMM yyyy')}`}
        actions={
          <Link href="/help/tickets" className="text-sm text-[var(--brand-600)] hover:underline">
            All tickets
          </Link>
        }
      />

      {sp.error ? (
        <p className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {sp.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ticket.messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-[var(--radius-sm)] p-3 text-sm ${
                m.authorKind === 'TENANT' ? 'bg-surface-2' : 'border border-line'
              }`}
            >
              <p className="text-xs text-ink-subtle mb-1">
                {m.authorKind === 'TENANT' ? 'You' : 'Support'} ·{' '}
                {format(m.createdAt, 'd MMM yyyy HH:mm')}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}

          {ticket.status !== 'CLOSED' && ctx.can('support.create') ? (
            <form action={replyTicketAction.bind(null, id)} className="space-y-2 pt-2 border-t border-line">
              <textarea
                name="body"
                required
                rows={4}
                className="w-full rounded-[var(--radius-sm)] border border-line bg-surface p-2 text-sm"
                placeholder="Add a reply…"
              />
              <Button type="submit">Send</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
