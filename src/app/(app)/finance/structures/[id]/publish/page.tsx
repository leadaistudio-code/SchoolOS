import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireContext } from '@/server/context'
import { getClassTree } from '@/server/modules/academics/service'
import { listStructures } from '@/server/modules/finance/service'
import { PageHeader } from '@/components/page-header'
import { buttonVariants } from '@/components/ui/button-variants'
import { PublishFeePlanForm } from './publish-fee-plan-form'

export const metadata = { title: 'Publish fee structure' }

export default async function PublishFeeStructurePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireContext('fees.structure_publish')
  const { id } = await params
  const [structures, classes] = await Promise.all([
    listStructures(ctx),
    getClassTree(ctx),
  ])
  const structure = structures.find((item) => item.id === id)
  if (!structure || structure.status !== 'DRAFT') notFound()
  const selectedClass = classes.find((item) => item.id === structure.classLevelId)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Publish fee structure"
        description="Confirm who should receive this fee plan before invoices are created."
        actions={
          <Link
            href="/finance/structures"
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            Back to structures
          </Link>
        }
      />
      <PublishFeePlanForm
        structure={{
          id: structure.id,
          name: structure.name,
          className: structure.className,
          totalMinor: structure.totalMinor,
        }}
        sections={selectedClass?.sections.map((section) => ({
          id: section.id,
          name: section.name,
        })) ?? []}
        currency={ctx.tenant.currency}
      />
    </div>
  )
}
