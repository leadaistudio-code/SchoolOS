import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Ban, CheckCircle2, Clock, Paperclip, Users, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/states'
import { StatCard } from '@/components/ui/stat-card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { canManageMailboxes } from '@/server/modules/platform/mail/service'
import { campaignPreviewHtml, getCampaign, type RecipientFilter } from '@/server/modules/platform/mail/campaigns'
import { CAMPAIGN_STATUS_LABEL } from '@/lib/bulk-mail'
import { formatBytes } from '@/lib/platform-mail'
import { cn } from '@/lib/utils'
import { MailTabs, requireMailContext } from '../../tabs'
import { SendPanel } from './send-panel'

export const metadata = { title: 'Bulk email · Mail' }

const FILTERS: { key: RecipientFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'PENDING', label: 'Waiting' },
  { key: 'SENT', label: 'Sent' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'SKIPPED', label: 'Skipped' },
  { key: 'UNSUBSCRIBED', label: 'Unsubscribed' },
]

const RECIPIENT_LABEL: Record<string, string> = {
  PENDING: 'Waiting',
  SENDING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
}

function when(date: Date) {
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ show?: string; created?: string }>
}) {
  const ctx = await requireMailContext()
  const { id } = await params
  const sp = await searchParams
  const filter = (FILTERS.find((f) => f.key === sp.show)?.key ?? 'all') as RecipientFilter
  const data = await getCampaign(ctx, id, filter).catch(() => null)
  if (!data) notFound()
  const { campaign, recipients, counts, documents } = data
  const preview = await campaignPreviewHtml(ctx, id)
  const target = counts.total - counts.skipped
  const open = campaign.status !== 'COMPLETED' && campaign.status !== 'CANCELLED'

  return (
    <div className="space-y-5">
      <PageHeader
        title={campaign.name}
        description={`${campaign.subject} · ${counts.total} school${counts.total === 1 ? '' : 's'}${campaign.sourceFileName ? ` from ${campaign.sourceFileName}` : ''}`}
        breadcrumbs={[
          { label: 'Mail', href: '/platform/mail/inbox' },
          { label: 'Bulk email', href: '/platform/mail/campaigns' },
          { label: campaign.name },
        ]}
        actions={
          <StatusBadge
            status={campaign.status}
            label={CAMPAIGN_STATUS_LABEL[campaign.status]}
            tone={campaign.status === 'SENDING' ? 'info' : campaign.status === 'PAUSED' ? 'warning' : undefined}
          />
        }
      />
      <MailTabs current="campaigns" showSettings={canManageMailboxes(ctx)} />

      {sp.created === '1' && counts.sent === 0 ? (
        <Notice tone="success" title="Campaign created">
          Nothing has been sent yet. Choose a batch size and press “Send next” — or “Send all” to keep going batch after
          batch until the list is done.
        </Notice>
      ) : null}
      {campaign.lastError ? (
        <Notice tone="danger" title="Sending stopped">
          {campaign.lastError}
        </Notice>
      ) : null}
      {!campaign.mailbox ? (
        <Notice tone="warning" title="The mailbox for this campaign was disconnected">
          Reconnect it under Mail → Mailbox before sending.
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Schools" value={counts.total} icon={Users} accent="#0ea5e9" hint={counts.skipped ? `${counts.skipped} skipped` : undefined} />
        <StatCard label="Sent" value={counts.sent} icon={CheckCircle2} accent="#10b981" hint={target ? `${Math.round((counts.sent / target) * 100)}% of the list` : undefined} />
        <StatCard label="Waiting" value={counts.pending} icon={Clock} accent="#7c3aed" />
        <StatCard label="Failed" value={counts.failed} icon={XCircle} accent="#f43f5e" tone={counts.failed ? 'danger' : undefined} />
        <StatCard label="Unsubscribed" value={counts.unsubscribed} icon={Ban} accent="#64748b" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <SendPanel
            campaignId={campaign.id}
            open={open && !!campaign.mailbox}
            sent={counts.sent}
            pending={counts.pending}
            failed={counts.failed}
            target={target}
            fromEmail={campaign.mailbox?.fromEmail ?? null}
          />

          <Card>
            <CardContent className="space-y-3 p-3">
              <nav className="flex flex-wrap gap-1" aria-label="Filter schools">
                {FILTERS.map((f) => (
                  <Link
                    key={f.key}
                    href={`/platform/mail/campaigns/${campaign.id}${f.key === 'all' ? '' : `?show=${f.key}`}`}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                      filter === f.key ? 'bg-ink text-surface' : 'bg-surface-2 text-ink-muted hover:text-ink',
                    )}
                  >
                    {f.label}
                  </Link>
                ))}
              </nav>
              {recipients.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-muted">No schools in this view.</p>
              ) : (
                <TableWrap className="max-h-[560px] overflow-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH>School</TH>
                        <TH>Email</TH>
                        <TH>Status</TH>
                        <TH className="text-right">When</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {recipients.map((r) => (
                        <TR key={r.id}>
                          <TD className="max-w-64">
                            {r.crmSchoolId ? (
                              <Link href={`/platform/growth/schools/${r.crmSchoolId}`} className="block truncate font-medium text-ink hover:underline">
                                {r.schoolName ?? r.email}
                              </Link>
                            ) : (
                              <span className="block truncate font-medium text-ink">{r.schoolName ?? '—'}</span>
                            )}
                            <span className="block truncate text-xs text-ink-subtle">
                              {[r.contactName, r.area].filter(Boolean).join(' · ') || '\u00a0'}
                            </span>
                          </TD>
                          <TD className="max-w-60 truncate text-ink-muted">{r.email}</TD>
                          <TD>
                            <div className="flex flex-wrap items-center gap-1">
                              <StatusBadge
                                status={r.status}
                                label={RECIPIENT_LABEL[r.status]}
                                tone={r.status === 'SENT' ? 'success' : r.status === 'FAILED' ? 'danger' : r.status === 'SENDING' ? 'info' : 'neutral'}
                              />
                              {r.unsubscribedAt ? <Badge tone="danger">Unsubscribed</Badge> : null}
                              {r.crmSchoolId ? <Badge tone="info">CRM</Badge> : null}
                            </div>
                            {r.error || r.skipReason ? (
                              <p className="mt-0.5 max-w-xs truncate text-xs text-ink-subtle" title={r.error ?? r.skipReason ?? ''}>
                                {r.error ?? r.skipReason}
                              </p>
                            ) : null}
                          </TD>
                          <TD className="whitespace-nowrap text-right text-xs text-ink-muted">
                            {r.unsubscribedAt ? when(r.unsubscribedAt) : r.sentAt ? when(r.sentAt) : '—'}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Email</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <dl className="space-y-1.5 text-sm">
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-ink-subtle">From</dt>
                  <dd className="min-w-0 truncate text-ink">{campaign.mailbox ? `${campaign.mailbox.fromName} <${campaign.mailbox.fromEmail}>` : '—'}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-ink-subtle">Subject</dt>
                  <dd className="min-w-0 text-ink">{campaign.subject}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-16 shrink-0 text-ink-subtle">By</dt>
                  <dd className="min-w-0 text-ink">
                    {campaign.actorLabel ?? '—'} · {when(campaign.createdAt)}
                  </dd>
                </div>
              </dl>
              {documents.length ? (
                <ul className="space-y-1">
                  {documents.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 text-sm text-ink">
                      <Paperclip className="size-3.5 text-ink-subtle" aria-hidden />
                      <span className="truncate">{d.title}</span>
                      <span className="text-xs text-ink-subtle">{formatBytes(d.sizeBytes)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {preview ? (
                <div className="overflow-hidden rounded-[var(--radius-sm)] border border-line">
                  <p className="border-b border-line bg-surface-2 px-3 py-1.5 text-xs text-ink-subtle">As the first school receives it</p>
                  <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[560px] w-full bg-white" />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
