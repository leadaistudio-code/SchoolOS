import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listBooks, listCategories } from '@/server/modules/library/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { AddBookForm } from './forms'
import { parseListQuery } from '@/lib/query'

export const metadata = { title: 'Library' }

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('library.view')
  const params = await searchParams
  const query = parseListQuery(params)
  const [books, categories] = await Promise.all([
    listBooks(ctx, query.q),
    listCategories(ctx),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Library"
        description="Catalogue and availability."
        actions={
          <Link href="/library/loans" className="text-sm text-[var(--brand-600)] hover:underline">
            Loans desk
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Books · {books.length}</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {books.length === 0 ? (
              <EmptyState title="No books yet" description="Add titles from the side form." />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>Title</TH>
                      <TH>Author</TH>
                      <TH>Category</TH>
                      <TH align="right">Available</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {books.map((book) => (
                      <TR key={book.id}>
                        <TD className="text-sm font-medium">{book.title}</TD>
                        <TD className="text-sm text-ink-muted">{book.author ?? '—'}</TD>
                        <TD className="text-sm text-ink-muted">{book.category?.name ?? '—'}</TD>
                        <TD align="right" className="text-sm tnum">
                          {book.availableCopies}/{book.totalCopies}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </CardContent>
        </Card>

        {ctx.can('library.manage') ? (
          <Card>
            <CardHeader>
              <CardTitle>Add book</CardTitle>
            </CardHeader>
            <CardContent>
              <AddBookForm categories={categories} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
