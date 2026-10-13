import Link from 'next/link'
import { Paperclip, PenSquare } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Notice } from '@/components/ui/states'
import { SearchInput, Select } from '@/components/ui/input'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { canManageMailboxes, listEmails } from '@/server/modules/platform/mail/service'
import { MailTabs, requireMailContext } from './tabs'

export const metadata = { title: 'Mail · Platform' }

function when(date: Date) {
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay
    ? date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>
}) {
  const ctx = await requireMailContext()
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const [result, mailboxCount] = await Promise.all([
    listEmails(ctx, { q: sp.q, status: sp.status, page }),
    ctx.db.platformMailbox.count(),
  ])
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize))
  const manage = canManageMailboxes(ctx)

  const pageHref = (p: number) => {
    const params = new URLSearchParams()
    if (sp.q) params.set('q', sp.q)
    if (sp.status) params.set('status', sp.status)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/platform/mail${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sent from console"
        description={`${result.counts.sent} sent${result.counts.failed ? ` · ${result.counts.failed} failed` : ''} · with the school each email was linked to`}
        breadcrumbs={[{ label: 'Mail', href: '/platform/mail/inbox' }, { label: 'Sent from console' }]}
        actions={
          <Link href="/platform/mail/compose" className={buttonVariants({ size: 'sm' })}>
            <PenSquare aria-hidden /> Compose
          </Link>
        }
      />
      <MailTabs current="sent" showSettings={manage} />

      {mailboxCount === 0 ? (
        <Notice tone="warning" title="No mailbox connected">
          {manage ? (
            <>
              Connect your Hostinger mailbox in{' '}
              <Link href="/platform/mail/settings" className="font-medium underline">
                Mailbox
              </Link>{' '}
              to start sending from your own address.
            </>
          ) : (
            'Ask the Super Admin to connect the company mailbox before sending.'
          )}
        </Notice>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-3">
          <form className="flex flex-wrap items-center gap-2" action="/platform/mail">
            <SearchInput name="q" defaultValue={sp.q ?? ''} placeholder="Search subject, recipient or school" aria-label="Search sent mail" />
            <Select name="status" defaultValue={sp.status ?? ''} aria-label="Status" className="w-36">
              <option value="">All</option>
              <option value="SENT">Sent</option>
              <option value="FAILED">Failed</option>
            </Select>
            <button type="submit" className={buttonVariants({ variant: 'secondary', size: 'md' })}>
              Filter
            </button>
          </form>

          {result.rows.length === 0 ? (
            <EmptyState
              title={sp.q || sp.status ? 'No emails match' : 'Nothing sent yet'}
              description={
                sp.q || sp.status
                  ? 'Try a different search.'
                  : 'Emails and proposals you send from the console appear here, with their attachments.'
              }
              action={
                <Link href="/platform/mail/compose" className={buttonVariants({ size: 'sm' })}>
                  Write the first email
                </Link>
              }
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>To</TH>
                    <TH>Subject</TH>
                    <TH>School</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Sent</TH>
                  </TR>
                </THead>
                <TBody>
                  {result.rows.map((row) => {
                    const recipients = [...row.to, ...row.cc]
                    return (
                      <TR key={row.id}>
                        <TD className="max-w-56">
                          <Link href={`/platform/mail/${row.id}`} className="block truncate font-medium text-ink hover:underline">
                            {recipients[0]}
                          </Link>
                          {recipients.length > 1 ? (
                            <span className="text-xs text-ink-subtle">+{recipients.length - 1} more</span>
                          ) : null}
                        </TD>
                        <TD className="max-w-md">
                          <Link href={`/platform/mail/${row.id}`} className="flex items-center gap-1.5 text-ink hover:underline">
                            <span className="truncate">{row.subject}</span>
                            {row._count.attachments ? (
                              <Paperclip className="size-3.5 shrink-0 text-ink-subtle" aria-label={`${row._count.attachments} attachments`} />
                            ) : null}
                          </Link>
                          <span className="text-xs text-ink-subtle">
                            {row.fromEmail}
                            {row.actorLabel ? ` · by ${row.actorLabel}` : ''}
                          </span>
                        </TD>
                        <TD className="max-w-48 truncate text-ink-muted">
                          {row.crmSchool ? (
                            <Link href={`/platform/growth/schools/${row.crmSchool.id}`} className="hover:underline">
                              {row.crmSchool.name}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </TD>
                        <TD>
                          {row.status === 'SENT' ? (
                            <Badge tone="success">Sent</Badge>
                          ) : (
                            <Badge tone="danger">Failed</Badge>
                          )}
                        </TD>
                        <TD className="whitespace-nowrap text-right text-ink-muted tnum">{when(row.createdAt)}</TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
          )}

          {pages > 1 ? (
            <div className="flex items-center justify-between pt-1 text-sm text-ink-muted">
              <span>
                Page {result.page} of {pages}
              </span>
              <div className="flex gap-2">
                {result.page > 1 ? (
                  <Link href={pageHref(result.page - 1)} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Previous
                  </Link>
                ) : null}
                {result.page < pages ? (
                  <Link href={pageHref(result.page + 1)} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
