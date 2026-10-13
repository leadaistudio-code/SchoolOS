import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getClassTree } from '@/server/modules/academics/service'
import {
  listOptionalFeeHeads,
  listStudentsForFeeOption,
} from '@/server/modules/finance/service'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button-variants'
import { OptionalFeesPanel } from './optional-fees-panel'

export const metadata = { title: 'Optional fees' }

export default async function OptionalFeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('fees.structure')
  const params = await searchParams

  const [feeHeads, classes] = await Promise.all([
    listOptionalFeeHeads(ctx),
    getClassTree(ctx),
  ])

  const selectedFeeHeadId = params.feeHeadId || feeHeads[0]?.id || ''
  const classLevelId = params.classLevelId || ''
  const sectionId = params.sectionId || ''

  const roster = selectedFeeHeadId
    ? await listStudentsForFeeOption(ctx, selectedFeeHeadId, {
        classLevelId: classLevelId || undefined,
        sectionId: sectionId || undefined,
      })
    : { optedStudentIds: [], students: [] }
  const billedIn = selectedFeeHeadId
    ? await ctx.db.feeStructureItem.findMany({
        where: {
          feeHeadId: selectedFeeHeadId,
          isOptional: true,
          structure: { deletedAt: null, session: { isCurrent: true } },
        },
        select: { structure: { select: { id: true, name: true } } },
        orderBy: { structure: { name: 'asc' } },
      })
    : []
  const selectedHead = feeHeads.find((head) => head.id === selectedFeeHeadId)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Optional fees"
        description="Mark students who take add-ons like Computer Science. They stay in their normal section and get one invoice with the extra line."
        actions={
          <>
            <BackButton fallbackHref="/finance/structures" />
            <Link
              href="/finance/structures"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Fee structures
            </Link>
            <Link
              href="/finance/invoices"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Generate invoices
            </Link>
          </>
        }
      />

      <Card>
        <CardContent className="pt-4">
          <OptionalFeesPanel
            feeHeads={feeHeads}
            students={roster.students}
            initialOptedIds={roster.optedStudentIds}
            classes={classes.map((c) => ({
              id: c.id,
              name: c.name,
              sections: c.sections.map((s) => ({ id: s.id, name: s.name })),
            }))}
            currency={ctx.tenant.currency}
            selectedFeeHeadId={selectedFeeHeadId}
            classLevelId={classLevelId}
            sectionId={sectionId}
          />
        </CardContent>
      </Card>

      {billedIn.length > 0 && selectedHead ? (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm text-ink">
              Invoice generation and due dates for {selectedHead.name}
            </p>
            <p className="text-xs text-ink-muted">
              Optional fees are billed on the schedule of the structure they belong to. Change the
              dates there, including for invoices already generated.
            </p>
            <div className="flex flex-wrap gap-2">
              {billedIn.map(({ structure }) => (
                <Link
                  key={structure.id}
                  href={`/finance/structures/${structure.id}/dates`}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  Billing dates · {structure.name}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
