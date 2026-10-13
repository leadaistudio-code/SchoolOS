import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { canManageMailboxes } from '@/server/modules/platform/mail/service'
import { listUnsubscribes } from '@/server/modules/platform/mail/campaigns'
import { MailTabs, requireMailContext } from '../../tabs'
import { AddUnsubscribeForm } from './add-form'

export const metadata = { title: 'Unsubscribed · Mail' }

const SOURCE: Record<string, string> = {
  LINK: 'Unsubscribe page',
  ONE_CLICK: 'Mail app button',
  MANUAL: 'Added by team',
}

export default async function UnsubscribesPage() {
  const ctx = await requireMailContext()
  const rows = await listUnsubscribes(ctx)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Unsubscribed"
        description="These addresses are skipped automatically in every bulk email, now and in future lists."
        breadcrumbs={[
          { label: 'Mail', href: '/platform/mail/inbox' },
          { label: 'Bulk email', href: '/platform/mail/campaigns' },
          { label: 'Unsubscribed' },
        ]}
      />
      <MailTabs current="campaigns" showSettings={canManageMailboxes(ctx)} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <EmptyState title="Nobody has unsubscribed" description="When a school clicks Unsubscribe in one of your emails it appears here." />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <TR>
                      <TH>Email</TH>
                      <TH>How</TH>
                      <TH>Reason</TH>
                      <TH className="text-right">When</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map((r) => (
                      <TR key={r.id}>
                        <TD className="font-medium text-ink">{r.email}</TD>
                        <TD>
                          <Badge tone={r.source === 'MANUAL' ? 'neutral' : 'info'}>{SOURCE[r.source] ?? r.source}</Badge>
                        </TD>
                        <TD className="max-w-xs truncate text-ink-muted">{r.reason ?? '—'}</TD>
                        <TD className="whitespace-nowrap text-right text-ink-muted">
                          {r.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add an address</CardTitle>
          </CardHeader>
          <CardContent>
            <AddUnsubscribeForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
