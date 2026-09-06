import Link from 'next/link'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { libraryIssueSetup, listLoans } from '@/server/modules/library/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { IssueForm, ReturnButton } from '../forms'

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
          <CardContent className="space-y-3">
            {open.length === 0 ? (
              <EmptyState title="No open loans" description="Issue a book from the side form." />
            ) : (
              open.map((loan) => {
                const isOverdue = overdue.some((o) => o.id === loan.id)
                return (
                  <div key={loan.id} className="rounded-[var(--radius-sm)] border border-line p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-ink">{loan.book.title}</p>
                      <Badge tone={isOverdue ? 'danger' : 'neutral'}>
                        {isOverdue ? 'Overdue' : 'Issued'}
                      </Badge>
                    </div>
                    <p className="text-xs text-ink-subtle">
                      Due {format(loan.dueOn, 'd MMM yyyy')}
                      {loan.student
                        ? ` · ${loan.student.firstName} ${loan.student.lastName}`
                        : ''}
                    </p>
                    {ctx.can('library.issue') ? <ReturnButton id={loan.id} /> : null}
                  </div>
                )
              })
            )}
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
