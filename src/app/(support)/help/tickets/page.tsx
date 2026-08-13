import Link from 'next/link'
import { format } from 'date-fns'
import { requireSupportContext } from '@/server/context'
import { PageHeader } from '@/components/page-header'
import { Badge, humanizeStatus } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/states'
import { listTenantTickets } from '@/server/modules/platform/support'
import { createTicketAction } from './actions'

export const metadata = { title: 'Help & Support' }

export default async function HelpTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const ctx = await requireSupportContext('support.view')
  const sp = await searchParams
  const tickets = await listTenantTickets(ctx)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Help & Support"
        description="Raise a ticket for platform assistance."
      />

      {sp.error ? (
        <p className="rounded-[var(--radius-sm)] border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
          {sp.error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Your tickets</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {tickets.length === 0 ? (
              <EmptyState
                title="No tickets yet"
                description="Submit a ticket and our platform team will respond here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/help/tickets/${t.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-ink truncate">{t.subject}</p>
                        <p className="text-xs text-ink-subtle">
                          Updated {format(t.updatedAt, 'd MMM yyyy')}
                        </p>
                      </div>
                      <Badge tone={t.status === 'OPEN' ? 'warning' : 'neutral'}>
                        {humanizeStatus(t.status)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {ctx.can('support.create') ? (
          <Card>
            <CardHeader>
              <CardTitle>New ticket</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createTicketAction} className="space-y-3">
                <Input name="subject" placeholder="Subject" required />
                <select
                  name="priority"
                  className="w-full h-9 rounded-[var(--radius-sm)] border border-line px-2 text-sm"
                  defaultValue="NORMAL"
                >
                  {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <textarea
                  name="body"
                  required
                  rows={6}
                  placeholder="Describe the issue…"
                  className="w-full rounded-[var(--radius-sm)] border border-line bg-surface p-2 text-sm"
                />
                <Button type="submit" className="w-full">
                  Submit ticket
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
