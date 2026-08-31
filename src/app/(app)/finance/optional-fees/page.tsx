import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getClassTree } from '@/server/modules/academics/service'
import {
  listOptionalFeeHeads,
  listStudentsForFeeOption,
} from '@/server/modules/finance/service'
import { PageHeader } from '@/components/page-header'
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Optional fees"
        description="Mark students who take add-ons like Computer Science. They stay in their normal section and get one invoice with the extra line."
        actions={
          <>
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
    </div>
  )
}
