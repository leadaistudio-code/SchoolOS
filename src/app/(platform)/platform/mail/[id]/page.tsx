import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, Copy, FileText, Inbox } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { canManageMailboxes, getEmail } from '@/server/modules/platform/mail/service'
import { formatBytes } from '@/lib/platform-mail'
import { MailTabs, requireMailContext } from '../tabs'

export const metadata = { title: 'Email · Mail' }

export default async function EmailDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sent?: string }>
}) {
  const ctx = await requireMailContext()
  const { id } = await params
  const sp = await searchParams
  const email = await getEmail(ctx, id).catch(() => null)
  if (!email) notFound()

  return (
    <div className="space-y-5">
      <PageHeader
        title={email.subject}
        description={email.createdAt.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}
        breadcrumbs={[{ label: 'Mail', href: '/platform/mail' }, { label: 'Email' }]}
        actions={
          <Link href={`/platform/mail/compose?draft=${email.id}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            <Copy aria-hidden /> Use as new draft
          </Link>
        }
      />
      <MailTabs current="sent" showSettings={canManageMailboxes(ctx)} />

      {sp.sent === '1' && email.status === 'SENT' ? (
        <Notice tone="success" title="Email sent">
          Delivered to the mail server for {email.to.length + email.cc.length + email.bcc.length} recipient
          {email.to.length + email.cc.length + email.bcc.length === 1 ? '' : 's'}
          {email.savedToSent ? ', and a copy is in your Sent folder.' : '.'}
        </Notice>
      ) : null}
      {email.status === 'FAILED' ? (
        <Notice tone="danger" title="Not sent">
          {email.error}
        </Notice>
      ) : null}
      {email.status === 'SENT' && email.sentCopyError ? (
        <Notice tone="warning" title="Sent, but no copy in the Sent folder">
          {email.sentCopyError}
        </Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <iframe
            title="Email as sent"
            sandbox=""
            srcDoc={email.html}
            className="h-[78vh] min-h-[560px] w-full bg-white"
          />
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <Item label="Status">
                  {email.status === 'SENT' ? <Badge tone="success">Sent</Badge> : <Badge tone="danger">Failed</Badge>}
                  {email.savedToSent ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-ink-muted">
                      <Inbox className="size-3.5" aria-hidden /> In Sent folder
                    </span>
                  ) : null}
                </Item>
                <Item label="From">
                  {email.fromName} &lt;{email.fromEmail}&gt;
                </Item>
                <Item label="To">{email.to.join(', ')}</Item>
                {email.cc.length ? <Item label="Cc">{email.cc.join(', ')}</Item> : null}
                {email.bcc.length ? <Item label="Bcc">{email.bcc.join(', ')}</Item> : null}
                {email.crmSchool ? (
                  <Item label="School">
                    <Link href={`/platform/growth/schools/${email.crmSchool.id}`} className="font-medium text-[var(--brand-600)] hover:underline">
                      {email.crmSchool.name}
                    </Link>
                  </Item>
                ) : null}
                {email.actorLabel ? <Item label="Sent by">{email.actorLabel}</Item> : null}
                <Item label="Design">{email.layout === 'PLAIN' ? 'Plain' : 'Branded'}</Item>
                {email.messageId ? (
                  <Item label="Message-ID">
                    <span className="break-all font-mono text-xs text-ink-muted">{email.messageId}</span>
                  </Item>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attachments · {email.attachments.length}</CardTitle>
            </CardHeader>
            <CardContent>
              {email.attachments.length === 0 ? (
                <p className="text-sm text-ink-muted">No attachments.</p>
              ) : (
                <ul className="space-y-2">
                  {email.attachments.map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-line p-2">
                      <FileText className="size-4 shrink-0 text-[#f45a1e]" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <a
                          href={`/api/v1/platform/mail/attachments/${a.id}?view=1`}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-medium text-ink hover:underline"
                        >
                          {a.fileName}
                        </a>
                        <span className="text-xs text-ink-subtle">{formatBytes(a.sizeBytes)}</span>
                      </div>
                      <a
                        href={`/api/v1/platform/mail/attachments/${a.id}`}
                        className="text-xs font-medium text-ink-muted hover:text-ink"
                      >
                        Download
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {email.status === 'SENT' ? (
            <p className="flex items-start gap-1.5 text-xs text-ink-subtle">
              <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden />
              Accepted by {email.fromEmail.split('@')[1]}’s mail server. Delivery to each inbox is then up to the
              recipient’s provider.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-ink">{children}</dd>
    </div>
  )
}
