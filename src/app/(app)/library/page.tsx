import Link from 'next/link'
import { BookOpen, Library as LibraryIcon, Tags } from 'lucide-react'
import { requireContext } from '@/server/context'
import { listBooks, listCategories } from '@/server/modules/library/service'
import {
  ColorBanner,
  ColorTile,
  colorBannerSecondaryBtn,
} from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { AddBookForm } from './forms'
import { parseListQuery } from '@/lib/query'
import { formatNumber } from '@/lib/utils'

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

  const available = books.reduce((sum, b) => sum + b.availableCopies, 0)

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="students"
        eyebrow="Library"
        title={
          books.length > 0
            ? `${formatNumber(books.length)} titles in the catalogue`
            : 'Library catalogue'
        }
        description="Catalogue and availability."
        actions={
          <Link href="/library/loans" className={colorBannerSecondaryBtn()}>
            {ctx.can('library.issue') ? 'Loans desk' : 'My loans'}
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Books"
          value={formatNumber(books.length)}
          sub="Titles listed"
          tone="students"
          href="#books"
          icon={<BookOpen className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Available copies"
          value={formatNumber(available)}
          sub="Ready to loan"
          tone="attendance"
          href="/library/loans"
          icon={<LibraryIcon className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="Categories"
          value={formatNumber(categories.length)}
          sub="Shelving groups"
          tone="admissions"
          href="#books"
          icon={<Tags className="size-5" aria-hidden />}
          delayMs={120}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card id="books" variant="elevated" className="scroll-mt-20 overflow-hidden">
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
          <Card variant="elevated">
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
