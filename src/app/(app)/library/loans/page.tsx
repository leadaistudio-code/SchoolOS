import Link from 'next/link'
import { requireContext } from '@/server/context'
import { libraryIssueSetup, listLoans } from '@/server/modules/library/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IssueForm } from '../forms'
import { LoanList } from './loan-list'

export const metadata = { title: 'Library loans' }

export default async function LibraryLoansPage() {
  const ctx = await requireContext('library.view')
  const [issued, overdue, setup] = await Promise.all([
    listLoans(ctx, 'ISSUED'),
    listLoans(ctx, 'OVERDUE'),
    ctx.can('library.issue') ? libraryIssueSetup(ctx) : null,
  ])

  const open = [...overdue, ...issued.filter((l) => !overdue.some((o) => o.id === l.id))]

  return (
    <div className="space-y-6">
      <PageHeader
        title={ctx.can('library.issue') ? 'Loans desk' : 'My loans'}
        description={
          ctx.can('library.issue')
            ? 'Issue and return books. Overdue returns accrue ₹5/day.'
            : 'Books currently issued to you or your children.'
        }
        actions={
          <Link href="/library" className="text-sm text-[var(--brand-600)] hover:underline">
            Catalogue
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Open loans · {open.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <LoanList
              canReturn={ctx.can('library.issue')}
              rows={open.map((loan) => ({
                id: loan.id,
                title: loan.book.title,
                dueOn: loan.dueOn.toISOString(),
                studentName: loan.student
                  ? `${loan.student.firstName} ${loan.student.lastName}`
                  : null,
                isOverdue: overdue.some((candidate) => candidate.id === loan.id),
              }))}
            />
          </CardContent>
        </Card>

        {setup ? (
          <Card>
            <CardHeader>
              <CardTitle>Issue book</CardTitle>
            </CardHeader>
            <CardContent>
              <IssueForm books={setup.books} students={setup.students} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
