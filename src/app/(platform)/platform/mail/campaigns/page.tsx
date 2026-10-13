import Link from 'next/link'
import { Ban, CheckCircle2, Megaphone, Plus, Send, Users } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Progress } from '@/components/ui/progress'
import { StatCard } from '@/components/ui/stat-card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { canManageMailboxes } from '@/server/modules/platform/mail/service'
import { listCampaigns } from '@/server/modules/platform/mail/campaigns'
import { CAMPAIGN_STATUS_LABEL } from '@/lib/bulk-mail'
import { MailTabs, requireMailContext } from '../tabs'

export const metadata = { title: 'Bulk email · Mail' }

export default async function CampaignsPage() {
  const ctx = await requireMailContext()
  const [campaigns, unsubscribes] = await Promise.all([listCampaigns(ctx), ctx.db.platformUnsubscribe.count()])
  const totals = campaigns.reduce(
    (t, c) => ({ sent: t.sent + c.sent, schools: t.schools + c.total, unsub: t.unsub + c.unsubscribed }),
    { sent: 0, schools: 0, unsub: 0 },
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bulk email"
        description="Upload a list of schools and send each one its own personalised email, in batches, with an unsubscribe link."
        breadcrumbs={[{ label: 'Mail', href: '/platform/mail/inbox' }, { label: 'Bulk email' }]}
        actions={
          <div className="flex gap-2">
            <Link href="/platform/mail/campaigns/unsubscribes" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              <Ban aria-hidden /> Unsubscribed ({unsubscribes})
            </Link>
            <Link href="/platform/mail/campaigns/new" className={buttonVariants({ size: 'sm' })}>
              <Plus aria-hidden /> New bulk email
            </Link>
          </div>
        }
      />
      <MailTabs current="campaigns" showSettings={canManageMailboxes(ctx)} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Campaigns" value={campaigns.length} icon={Megaphone} accent="#7c3aed" />
        <StatCard label="Schools on lists" value={totals.schools} icon={Users} accent="#0ea5e9" />
        <StatCard label="Emails delivered" value={totals.sent} icon={CheckCircle2} accent="#10b981" />
        <StatCard
          label="Unsubscribed"
          value={unsubscribes}
          hint={totals.unsub ? `${totals.unsub} from these campaigns` : 'Never emailed again'}
          icon={Ban}
          accent="#f43f5e"
          href="/platform/mail/campaigns/unsubscribes"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {campaigns.length === 0 ? (
            <EmptyState
              title="No bulk emails yet"
              description="Upload a CSV of schools — the email, school name and contact columns are picked up automatically — then write one message and send it to every school individually."
              action={
                <Link href="/platform/mail/campaigns/new" className={buttonVariants({ size: 'sm' })}>
                  <Send aria-hidden /> Start the first one
                </Link>
              }
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Campaign</TH>
                    <TH>Status</TH>
                    <TH className="w-56">Progress</TH>
                    <TH className="text-right">Failed</TH>
                    <TH className="text-right">Unsubscribed</TH>
                    <TH className="text-right">Created</TH>
                  </TR>
                </THead>
                <TBody>
                  {campaigns.map((c) => {
                    const target = c.total - c.skipped
                    const pct = target ? (c.sent / target) * 100 : 0
                    return (
                      <TR key={c.id}>
                        <TD className="max-w-md">
                          <Link href={`/platform/mail/campaigns/${c.id}`} className="block truncate font-medium text-ink hover:underline">
                            {c.name}
                          </Link>
                          <span className="block truncate text-xs text-ink-subtle">
                            {c.subject}
                            {c.mailbox ? ` · from ${c.mailbox.fromEmail}` : ''}
                          </span>
                        </TD>
                        <TD>
                          <StatusBadge
                            status={c.status}
                            label={CAMPAIGN_STATUS_LABEL[c.status]}
                            tone={c.status === 'SENDING' ? 'info' : c.status === 'PAUSED' ? 'warning' : undefined}
                          />
                        </TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <Progress value={pct} tone={c.status === 'COMPLETED' ? 'success' : 'brand'} className="flex-1" label={`${c.name} progress`} />
                            <span className="w-16 shrink-0 text-right text-xs text-ink-muted tnum">
                              {c.sent}/{target}
                            </span>
                          </div>
                        </TD>
                        <TD className="text-right tnum">{c.failed ? <span className="text-[var(--danger)]">{c.failed}</span> : <span className="text-ink-subtle">0</span>}</TD>
                        <TD className="text-right tnum text-ink-muted">{c.unsubscribed}</TD>
                        <TD className="whitespace-nowrap text-right text-ink-muted">
                          {c.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {c.actorLabel ? <span className="block text-xs text-ink-subtle">{c.actorLabel}</span> : null}
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
