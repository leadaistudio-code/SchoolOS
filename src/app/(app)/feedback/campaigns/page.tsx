import { requireContext } from '@/server/context'
import { ensureDefaultTemplate, listCampaigns, listTemplates } from '@/server/modules/feedback/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { ActivateCampaign, CampaignDialog, SyncCampaign } from './campaign-dialog'

export const metadata = { title: 'Feedback campaigns' }

export default async function CampaignsPage() {
  const ctx = await requireContext('feedback.campaign_manage')
  await ensureDefaultTemplate(ctx)
  const [campaigns, templates] = await Promise.all([listCampaigns(ctx), listTemplates(ctx)])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Feedback campaigns"
        description="Activate a campaign to send forms to students or parents about the teachers who teach them. Assigned must be greater than 0 before portal users see Give feedback."
        actions={<CampaignDialog templates={templates} />}
      />
      <Card className="overflow-hidden">
        {campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create a student→teacher or parent→teacher campaign, then activate it to assign forms."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Campaign</TH>
                  <TH>Template</TH>
                  <TH>Frequency</TH>
                  <TH align="right">Assigned</TH>
                  <TH>Status</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {campaigns.map((campaign) => (
                  <TR key={campaign.id}>
                    <TD className="text-sm font-medium text-ink">{campaign.name}</TD>
                    <TD className="text-sm text-ink-muted">
                      {campaign.template.name}
                      <span className="mt-0.5 block text-xs text-ink-subtle">
                        {campaign.audience.toLowerCase()} → {campaign.target.toLowerCase()}
                      </span>
                    </TD>
                    <TD className="text-sm text-ink-muted">
                      {campaign.frequency.replace('_', ' ').toLowerCase()}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {campaign._count.assignments}
                    </TD>
                    <TD>
                      <Badge
                        tone={
                          campaign.status === 'ACTIVE'
                            ? campaign._count.assignments > 0
                              ? 'success'
                              : 'warning'
                            : campaign.status === 'DRAFT'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {campaign.status.toLowerCase()}
                        {campaign.status === 'ACTIVE' && campaign._count.assignments === 0
                          ? ' · no forms'
                          : ''}
                      </Badge>
                    </TD>
                    <TD align="right">
                      {campaign.status === 'DRAFT' ? (
                        <ActivateCampaign id={campaign.id} />
                      ) : campaign.status === 'ACTIVE' ? (
                        <SyncCampaign id={campaign.id} />
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
