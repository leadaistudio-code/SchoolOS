import { requireContext } from '@/server/context'
import { getClassTree } from '@/server/modules/academics/service'
import { listFeeHeads } from '@/server/modules/finance/service'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { FeePlanWizard } from './fee-plan-wizard'

export const metadata = { title: 'Create fee structure' }

export default async function CreateFeeStructurePage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>
}) {
  const ctx = await requireContext('fees.structure')
  const params = await searchParams
  const initialNonClass = params.scope === 'non-class'
  const [sessions, classes, heads] = await Promise.all([
    ctx.db.academicSession.findMany({ orderBy: { startsOn: 'desc' }, select: { id: true, name: true, startsOn: true, endsOn: true, isCurrent: true } }),
    getClassTree(ctx),
    listFeeHeads(ctx),
  ])

  return (
    <div className="space-y-4">
      <PageHeader
        title={initialNonClass ? 'Create non class linked fee' : 'Create fee structure'}
        description={
          initialNonClass
            ? 'Trip, books and other fees not tied to a class — assign to selected students'
            : 'Set the annual plan once; MyCampusView creates the installments'
        }
        breadcrumbs={[
          { label: 'Fees & Collections', href: '/finance' },
          {
            label: initialNonClass ? 'Non class linked fees' : 'Fee Setup',
            href: initialNonClass ? '/finance/non-class-fees' : '/finance/structures',
          },
          { label: 'Create' },
        ]}
        actions={
          <BackButton
            fallbackHref={initialNonClass ? '/finance/non-class-fees' : '/finance/structures'}
          />
        }
      />
      <FeePlanWizard
        currency={ctx.tenant.currency}
        initialNonClass={initialNonClass}
        sessions={sessions.map((session) => ({ ...session, startsOn: session.startsOn.toISOString(), endsOn: session.endsOn.toISOString() }))}
        classes={classes.map((classLevel) => ({
          id: classLevel.id,
          name: classLevel.name,
          sections: classLevel.sections.map((section) => ({ id: section.id, name: section.name })),
        }))}
        heads={heads.map((head) => ({ id: head.id, name: head.name, code: head.code, frequency: head.frequency }))}
        canPublish={ctx.can('fees.structure_publish')}
      />
    </div>
  )
}
