import Link from 'next/link'
import { CheckCircle2, CircleAlert, CircleDashed } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { listMailboxes } from '@/server/modules/platform/mail/service'
import { HOSTINGER_PRESET } from '@/lib/platform-mail'
import { MailTabs, requireMailContext } from '../tabs'
import { DeleteMailboxButton, MailboxForm, TestMailboxPanel } from './mailbox-forms'

export const metadata = { title: 'Mailbox · Mail' }

export default async function MailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string }>
}) {
  const ctx = await requireMailContext({ manage: true })
  const sp = await searchParams
  const mailboxes = await listMailboxes(ctx)
  const editing = sp.edit ? mailboxes.find((m) => m.id === sp.edit) ?? null : null
  const showForm = !!editing || sp.new === '1' || mailboxes.length === 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mailbox"
        description="Connect your own email account so proposals and emails go out from your address and appear in its Sent folder."
        breadcrumbs={[{ label: 'Mail', href: '/platform/mail' }, { label: 'Mailbox' }]}
        actions={
          mailboxes.length > 0 && !showForm ? (
            <Link href="/platform/mail/settings?new=1" className={buttonVariants({ size: 'sm' })}>
              Connect another mailbox
            </Link>
          ) : null
        }
      />
      <MailTabs current="settings" showSettings />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          {mailboxes.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <EmptyState
                  title="No mailbox connected yet"
                  description="Fill in the form to connect your Hostinger mailbox. It takes about a minute."
                />
              </CardContent>
            </Card>
          ) : (
            mailboxes.map((box) => (
              <Card key={box.id}>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-ink">{box.fromName}</p>
                        {box.isDefault ? <Badge tone="brand">Default</Badge> : null}
                        {box.verifiedAt ? (
                          <Badge tone="success">
                            <CheckCircle2 className="size-3" aria-hidden /> Connected
                          </Badge>
                        ) : box.lastError ? (
                          <Badge tone="danger">
                            <CircleAlert className="size-3" aria-hidden /> Needs attention
                          </Badge>
                        ) : (
                          <Badge tone="warning">
                            <CircleDashed className="size-3" aria-hidden /> Not tested
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-ink-muted">{box.fromEmail}</p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/platform/mail/settings?edit=${box.id}`}
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                      >
                        Edit
                      </Link>
                      <DeleteMailboxButton id={box.id} email={box.fromEmail} />
                    </div>
                  </div>

                  {box.lastError ? (
                    <p className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-danger-bg px-3 py-2 text-sm text-[var(--danger)]">
                      {box.lastError}
                    </p>
                  ) : null}

                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    {box.sendVia === 'RESEND' ? (
                      <Detail label="Sending" value={`Resend (HTTPS)${box.hasResendKey ? '' : ' · server key'}`} />
                    ) : (
                      <Detail label="Sending (SMTP)" value={`${box.smtpHost}:${box.smtpPort} · ${box.smtpSecure ? 'SSL' : 'STARTTLS'}`} />
                    )}
                    <Detail
                      label="Copy to Sent folder"
                      value={box.imapEnabled ? `${box.imapHost}:${box.imapPort}${box.sentFolder ? ` · “${box.sentFolder}”` : ''}` : 'Off'}
                    />
                    <Detail label="Reply-to" value={box.replyTo ?? 'Same as sender'} />
                    <Detail
                      label="Last verified"
                      value={box.verifiedAt ? box.verifiedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                    />
                    <Detail
                      label="Signature"
                      value={[box.signatureName, box.signatureTitle].filter(Boolean).join(', ') || 'Email address only'}
                    />
                  </dl>

                  <TestMailboxPanel id={box.id} defaultTo={box.fromEmail} />
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-4">
          {showForm ? (
            <Card>
              <CardHeader>
                <CardTitle>{editing ? `Edit ${editing.fromEmail}` : 'Connect a Hostinger mailbox'}</CardTitle>
              </CardHeader>
              <CardContent>
                <MailboxForm key={editing?.id ?? 'new'} mailbox={editing} />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Where to find these details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-ink-muted">
              <p>
                In Hostinger <strong className="text-ink">hPanel → Emails → Email accounts</strong>, open your
                address. Use that mailbox’s password — not your hPanel login. Reset it there if you are unsure.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Outgoing (SMTP): <span className="font-mono text-ink">{HOSTINGER_PRESET.smtpHost}</span>, port{' '}
                  {HOSTINGER_PRESET.smtpPort}, SSL
                </li>
                <li>
                  Incoming (IMAP): <span className="font-mono text-ink">{HOSTINGER_PRESET.imapHost}</span>, port{' '}
                  {HOSTINGER_PRESET.imapPort}, SSL — used only to place a copy in your Sent folder
                </li>
              </ul>
              <p>
                The password and any API key are encrypted before they are stored, are never shown again, and never
                appear in logs. Only the Super Admin can change mailboxes.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sending through Resend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-ink-muted">
              <p>
                Use this when sending times out — some hosts, including Railway below the Pro plan, block email ports.
                Free up to 3,000 emails a month (100 a day).
              </p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  Sign up at <span className="font-mono text-ink">resend.com</span> and open{' '}
                  <strong className="text-ink">Domains → Add domain</strong>. Enter your domain, e.g. mycampusview.com.
                </li>
                <li>
                  In Hostinger <strong className="text-ink">hPanel → Domains → DNS / Nameservers</strong>, add each
                  record Resend lists (a DKIM TXT, plus an MX and SPF TXT on the <span className="font-mono">send</span>{' '}
                  subdomain). These don’t affect your existing Hostinger inbox.
                </li>
                <li>Back in Resend press Verify. It usually turns green within minutes.</li>
                <li>
                  Create an API key under <strong className="text-ink">API Keys</strong>, then Edit the mailbox here,
                  choose “Through Resend” and paste it. Keep the mailbox password — the inbox and Sent copy still use it.
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="truncate text-ink">{value}</dd>
    </div>
  )
}
