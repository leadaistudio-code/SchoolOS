import Link from 'next/link'
import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getPlatformTicket } from '@/server/modules/platform/support'
import { replyTicketAction, updateTicketAction } from '../../actions'

export const metadata = { title: 'Ticket · Platform' }

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requirePlatformContext('platform.support')
  const ticket = await getPlatformTicket(ctx, id)

  return (
    <div className="space-y-4">
      <PageHeader
        title={ticket.subject}
        description={`${ticket.tenant.name} · ${ticket.status.toLowerCase()}`}
        actions={
          <Link href="/platform/support" className="text-sm text-[var(--brand-600)] hover:underline">
            Back to queue
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader>
            <CardTitle>Thread</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ticket.messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-[var(--radius-sm)] p-3 text-sm ${
                  m.authorKind === 'PLATFORM' ? 'bg-surface-2' : 'border border-line'
                }`}
              >
                <p className="text-xs text-ink-subtle mb-1">
                  {m.authorKind === 'PLATFORM' ? 'Platform' : 'School'} ·{' '}
                  {format(m.createdAt, 'd MMM yyyy HH:mm')}
                </p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
            <form action={replyTicketAction.bind(null, id)} className="space-y-2 pt-2 border-t border-line">
              <textarea
                name="body"
                required
                rows={4}
                className="w-full rounded-[var(--radius-sm)] border border-line bg-surface p-2 text-sm"
                placeholder="Reply to school…"
              />
              <Button type="submit">Send reply</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Triage</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateTicketAction.bind(null, id)} className="space-y-3">
              <label className="block space-y-1 text-sm">
                Status
                <select
                  name="status"
                  defaultValue={ticket.status}
                  className="w-full h-9 rounded-[var(--radius-sm)] border border-line px-2"
                >
                  {['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                Priority
                <select
                  name="priority"
                  defaultValue={ticket.priority}
                  className="w-full h-9 rounded-[var(--radius-sm)] border border-line px-2"
                >
                  {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="secondary" className="w-full">
                Update
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
