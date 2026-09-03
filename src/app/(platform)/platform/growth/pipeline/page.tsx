import Link from 'next/link'
import { requirePlatformContext } from '@/server/context'
import { listPipeline } from '@/server/modules/platform/growth/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { GrowthBoard } from '../pipeline-board'

export const metadata = { title: 'Pipeline · Growth CRM' }

export default async function GrowthPipelinePage() {
  const ctx = await requirePlatformContext('platform.crm')
  const { cards } = await listPipeline(ctx)
  const canEdit = ctx.user.permissions.has('platform.crm_edit')

  const board: Record<string, typeof cards> = {}
  for (const card of cards) {
    ;(board[card.stage] ??= []).push(card)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        description={`${cards.length} opportunities`}
        breadcrumbs={[{ label: 'Growth CRM', href: '/platform/growth' }, { label: 'Pipeline' }]}
        actions={
          <Link href="/platform/growth/schools/new" className={buttonVariants({ size: 'sm' })}>
            Add school
          </Link>
        }
      />
      <Card>
        <CardContent className="pt-4">
          <GrowthBoard board={board} canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
  )
}
