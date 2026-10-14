import Link from 'next/link'
import { requireContext } from '@/server/context'
import { env } from '@/lib/env'
import { tenantUrl } from '@/server/tenant'
import { PageHeader } from '@/components/page-header'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState, Notice } from '@/components/ui/states'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, THead, TH, TBody, TR, TD } from '@/components/ui/table'
import {
  ConsentButton,
  ReceiptConfigForm,
  ReceiptsToggle,
  RetryOutboxButton,
  RotateWebhookButton,
} from '@/components/accounting/whatsapp-receipt-forms'
import { accountingEnvSwitches } from '@/server/modules/accounting/service'
import { getReceiptSettings, listOutbox, listRecipients, OUTBOX_FILTERS } from '@/server/modules/whatsapp-receipts/service'
import { liveSendAllowed } from '@/server/modules/whatsapp-receipts/providers'
import { LINK_TTL_DAYS, TEMPLATE_GUIDE } from '@/server/modules/whatsapp-receipts/pure'
import { AccountsTabs } from '../ui'
import { stamp } from '../analytics/audit-pane'

export const metadata = { title: 'WhatsApp fee receipts' }

const VIEWS = [
  { key: 'messages', label: 'Messages' },
  { key: 'consent', label: 'Parent consent' },
  { key: 'settings', label: 'Settings' },
] as const

const STATUS_COPY: Record<string, { label: string; tone: BadgeTone }> = {
  QUEUED: { label: 'Queued', tone: 'info' },
  SENDING: { label: 'Sending', tone: 'info' },
  SENT: { label: 'Sent', tone: 'brand' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  READ: { label: 'Read', tone: 'success' },
  FAILED: { label: 'Retrying', tone: 'warning' },
  DEAD: { label: 'Not sent', tone: 'danger' },
  SKIPPED: { label: 'Skipped', tone: 'neutral' },
}

export default async function WhatsAppReceiptsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireContext('accounts.view')
  const params = await searchParams
  const view = VIEWS.some((v) => v.key === params.view) ? (params.view as (typeof VIEWS)[number]['key']) : 'messages'
  const settings = await getReceiptSettings(ctx)
  const { flags, check, config } = settings

  if (!flags.module) {
    return (
      <div className="space-y-4">
        <PageHeader title="WhatsApp fee receipts" />
        <AccountsTabs active="/accounts/whatsapp-receipts" />
        <Notice tone="info" title="Not enabled">The accounting module is switched off for this school.</Notice>
      </div>
    )
  }

  const available = accountingEnvSwitches().whatsappReceipts
  const live = liveSendAllowed({ nodeEnv: process.env.NODE_ENV, vitest: process.env.VITEST, dryRun: env().WHATSAPP_RECEIPTS_DRY_RUN })
  const viewHref = (key: string, extra: Record<string, string> = {}) =>
    `/accounts/whatsapp-receipts?${new URLSearchParams({ view: key, ...extra })}`

  return (
    <div className="space-y-4">
      <PageHeader
        title="WhatsApp fee receipts"
        description="When a fee payment is settled, the primary guardian gets a WhatsApp message with the receipt details and a 7-day link to view it, if they have agreed to receive it."
      />
      <AccountsTabs active="/accounts/whatsapp-receipts" />

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-subtle">Status</dt>
              <dd className="font-medium text-ink">
                {flags.whatsappReceipts ? 'On' : 'Off'}
                {!available ? ' (not available on this deployment)' : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Provider</dt>
              <dd className="font-medium text-ink">
                {config ? (config.provider === 'META_CLOUD' ? 'Meta WhatsApp Cloud API' : 'AiSensy') : 'Not set up'}
                {config && !check.complete ? <span className="ml-1 text-xs font-normal text-warning">missing {check.missing.join(', ')}</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Sending</dt>
              <dd className="font-medium text-ink">{live ? 'Live: messages go to parents' : 'Dry run: messages are recorded, nothing is sent'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-subtle">Receipt links</dt>
              <dd className="font-medium text-ink">Valid {LINK_TTL_DAYS} days; stop working if the payment is cancelled or refunded</dd>
            </div>
          </dl>
          {settings.canToggle ? <ReceiptsToggle enabled={flags.whatsappReceipts} available={available} ready={check.complete} /> : null}
        </div>
      </Card>

      <nav aria-label="WhatsApp receipt views" className="flex gap-1 border-b border-line">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={viewHref(v.key)}
            aria-current={v.key === view ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${v.key === view ? 'border-[var(--brand-600)] font-medium text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {view === 'messages' ? <MessagesView params={params} viewHref={viewHref} /> : null}
      {view === 'consent' ? <ConsentView params={params} /> : null}
      {view === 'settings' ? (
        <SettingsView
          canConfigure={settings.canConfigure}
          config={config}
          buttonUrl={`${tenantUrl(ctx.tenant.slug, '/r/')}{{1}}`}
          exampleUrl={tenantUrl(ctx.tenant.slug, '/r/…')}
        />
      ) : null}
    </div>
  )
}

async function MessagesView({ params, viewHref }: { params: Record<string, string | undefined>; viewHref: (key: string, extra?: Record<string, string>) => string }) {
  const ctx = await requireContext('accounts.view')
  const data = await listOutbox(ctx, { status: params.status, page: params.page })
  const total = Object.values(data.counts).reduce((s, n) => s + (n ?? 0), 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Messages</CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {OUTBOX_FILTERS.map((s) => {
            const n = s === 'all' ? total : data.counts[s] ?? 0
            if (s !== 'all' && n === 0) return null
            const active = data.status === s
            return (
              <Link
                key={s}
                href={viewHref('messages', s === 'all' ? {} : { status: s })}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${active ? 'border-[var(--brand-600)] bg-[var(--brand-50)] text-[var(--brand-600)]' : 'border-line text-ink-muted hover:text-ink'}`}
              >
                {s === 'all' ? 'All' : STATUS_COPY[s]!.label} <span className="tnum">{n}</span>
              </Link>
            )
          })}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {data.rows.length === 0 ? (
          <EmptyState title="No messages yet" description="Messages appear here when a fee payment is settled while WhatsApp receipts are switched on." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Queued</TH>
                  <TH>Student</TH>
                  <TH>Receipt</TH>
                  <TH>To</TH>
                  <TH>Status</TH>
                  <TH>Detail</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {data.rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap text-xs text-ink-muted">{stamp(r.createdAt)}</TD>
                    <TD>{r.student ?? '—'}</TD>
                    <TD className="tnum">
                      {r.receipt ? <Link href={`/finance/payments/${r.receipt.paymentId}`} className="text-[var(--brand-600)] hover:underline">{r.receipt.number}</Link> : '—'}
                    </TD>
                    <TD className="tnum text-xs">{r.to}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={STATUS_COPY[r.status]!.tone}>{STATUS_COPY[r.status]!.label}</Badge>
                        {r.dryRun ? <Badge tone="neutral">Dry run</Badge> : null}
                      </div>
                    </TD>
                    <TD className="max-w-xs text-xs text-ink-muted">
                      {r.lastError ??
                        (r.readAt ? `Read ${stamp(r.readAt)}` : r.deliveredAt ? `Delivered ${stamp(r.deliveredAt)}` : r.sentAt ? `Sent ${stamp(r.sentAt)}` : '')}
                      {r.attempts > 1 ? <span className="block">{r.attempts} attempts</span> : null}
                    </TD>
                    <TD className="text-right">
                      {data.canRetry && r.retryable ? <RetryOutboxButton id={r.id} interrupted={!!r.lastError?.startsWith('Interrupted')} /> : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
        <Pagination total={data.total} page={data.page} pageSize={data.pageSize} label="messages" />
      </CardContent>
    </Card>
  )
}

async function ConsentView({ params }: { params: Record<string, string | undefined> }) {
  const ctx = await requireContext('accounts.view')
  const data = await listRecipients(ctx, { q: params.q, page: params.page })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parent consent</CardTitle>
        <p className="text-sm text-ink-muted">
          Receipts go only to numbers with recorded consent. The primary guardian receives them; if they have no number, the next guardian with one does.
          Parents can reply STOP to opt out or START to opt back in.
        </p>
        <form method="get" className="mt-2 flex flex-wrap gap-2">
          <input type="hidden" name="view" value="consent" />
          <Input name="q" defaultValue={params.q ?? ''} placeholder="Student name or admission number" className="w-72" maxLength={80} />
          <Button type="submit" variant="secondary" size="sm">Search</Button>
        </form>
      </CardHeader>
      <CardContent className="p-0">
        {data.rows.length === 0 ? (
          <EmptyState title="No students found" description={params.q ? 'Try a different name or admission number.' : 'There are no active students.'} />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Student</TH>
                  <TH>Receives receipts</TH>
                  <TH>Number</TH>
                  <TH>Consent</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {data.rows.map((r) => (
                  <TR key={r.studentId}>
                    <TD>
                      <span className="block text-ink">{r.studentName}</span>
                      <span className="text-xs text-ink-subtle tnum">{r.admissionNo}</span>
                    </TD>
                    <TD>{r.recipient?.name ?? <span className="text-ink-subtle">No guardian number</span>}</TD>
                    <TD className="tnum text-xs">{r.recipient?.masked ?? '—'}</TD>
                    <TD>
                      {r.consent ? (
                        <>
                          <Badge tone={r.consent.status === 'OPTED_IN' ? 'success' : 'warning'}>{r.consent.status === 'OPTED_IN' ? 'Opted in' : 'Opted out'}</Badge>
                          <span className="mt-0.5 block text-xs text-ink-subtle">{r.consent.source}{r.consent.at ? ` · ${stamp(r.consent.at)}` : ''}</span>
                        </>
                      ) : r.recipient ? (
                        <span className="text-xs text-ink-subtle">Not recorded</span>
                      ) : null}
                    </TD>
                    <TD className="text-right">
                      {data.canEdit && r.recipient ? (
                        <ConsentButton phone={r.recipient.phone} masked={r.recipient.masked} guardian={r.recipient.name} optedIn={r.consent?.status === 'OPTED_IN'} />
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
        <Pagination total={data.total} page={data.page} pageSize={data.pageSize} label="students" />
      </CardContent>
    </Card>
  )
}

function SettingsView({
  canConfigure,
  config,
  buttonUrl,
  exampleUrl,
}: {
  canConfigure: boolean
  config: Awaited<ReturnType<typeof getReceiptSettings>>['config']
  buttonUrl: string
  exampleUrl: string
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Provider</CardTitle>
          <p className="text-sm text-ink-muted">The school&apos;s own WhatsApp account. Secrets are stored encrypted and never shown again.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {canConfigure ? (
            <ReceiptConfigForm value={config} />
          ) : (
            <Notice tone="info">Only people who manage integrations can change these settings.</Notice>
          )}
          {config?.webhookUrl ? (
            <div className="space-y-2 border-t border-line pt-4">
              <p className="text-sm font-medium text-ink">Delivery-status URL</p>
              <p className="text-xs text-ink-muted">
                {config.provider === 'META_CLOUD'
                  ? 'In your Meta app → WhatsApp → Configuration, set this as the callback URL, use the last part of it (after /status/) as the verify token, and subscribe to the "messages" field.'
                  : 'In AiSensy, add this as the webhook URL for message status events. Keep it private: it is the password for these updates.'}
              </p>
              <Input readOnly value={config.webhookUrl} className="font-mono text-xs" aria-label="Delivery-status URL" />
              <RotateWebhookButton />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Template to get approved</CardTitle>
          <p className="text-sm text-ink-muted">
            Submit this as a <strong>{TEMPLATE_GUIDE.category}</strong> template. Meta decides the category when it reviews it; if it is approved as
            Marketing instead, messages cost more and need marketing consent.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs font-semibold text-ink-muted">Body</p>
            <p className="mt-1 rounded-[var(--radius-sm)] bg-surface-2 p-3 text-ink">{TEMPLATE_GUIDE.body}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-ink-muted">Sample values</p>
            <ol className="mt-1 list-decimal pl-5 text-ink">
              {TEMPLATE_GUIDE.example.map((v, i) => <li key={i}>{`{{${i + 1}}}`} {v}</li>)}
            </ol>
          </div>
          <div>
            <p className="text-xs font-semibold text-ink-muted">Button</p>
            <p className="mt-1 text-ink">
              Meta: a &quot;Visit website&quot; button titled &quot;{TEMPLATE_GUIDE.buttonText}&quot; with a dynamic URL:
            </p>
            <code className="mt-1 block break-all rounded-[var(--radius-sm)] bg-surface-2 p-2 text-xs">{buttonUrl}</code>
            <p className="mt-2 text-ink">
              AiSensy: add a fifth body parameter {'{{5}}'} for the full receipt link, e.g. <span className="break-all text-xs">{exampleUrl}</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
