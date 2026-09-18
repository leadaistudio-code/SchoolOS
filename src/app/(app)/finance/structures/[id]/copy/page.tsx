import { requireContext } from '@/server/context'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { CopyFeePlanForm } from './copy-fee-plan-form'

export const metadata = { title: 'Copy fee structure' }

export default async function CopyFeeStructurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext('fees.structure')
  const [structure, sessions] = await Promise.all([
    ctx.db.feeStructure.findFirst({ where: { id, deletedAt: null }, include: { items: true, _count: { select: { assignments: true } } } }),
    ctx.db.academicSession.findMany({ orderBy: { startsOn: 'desc' }, select: { id: true, name: true } }),
  ])
  if (!structure) notFound()
  const currentMinor = structure.items.reduce((sum, item) => sum + item.amountMinor, 0)

  return (
    <div className="space-y-4">
      <PageHeader title="Copy to next academic session" description={structure.name} breadcrumbs={[{ label: 'Fee Setup', href: '/finance/structures' }, { label: 'Copy' }]} />
      <CopyFeePlanForm
        structureId={structure.id}
        sourceName={structure.name}
        currentMinor={currentMinor}
        studentCount={structure._count.assignments}
        currency={ctx.tenant.currency}
        sessions={sessions.filter((session) => session.id !== structure.sessionId)}
      />
    </div>
  )
}
