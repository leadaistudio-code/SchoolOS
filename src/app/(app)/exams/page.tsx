import Link from 'next/link'
import { Calendar, FileCheck, Plus, ScrollText } from 'lucide-react'
import { requireContext } from '@/server/context'
import { isPortalOnlyRole } from '@/server/scope'
import { listExams } from '@/server/modules/exams/service'
import { parseListQuery } from '@/lib/query'
import { formatDay } from '@/lib/dates'
import { formatNumber } from '@/lib/utils'
import {
  ColorBanner,
  ColorTile,
  colorBannerPrimaryBtn,
} from '@/components/dashboard/color-tiles'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { SearchBar } from '@/components/search-bar'
import { Pagination } from '@/components/pagination'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export const metadata = { title: 'Examinations' }

export default async function ExamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('exams.view')
  const portal = isPortalOnlyRole(ctx.user.roleKeys)
  const params = await searchParams
  const query = parseListQuery(params)
  const { rows, total } = await listExams(ctx, query)
  const activeExams = rows.filter((e) =>
    ['SCHEDULED', 'ONGOING', 'MARKS_ENTRY'].includes(e.status),
  ).length

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="late"
        eyebrow="Exams"
        title={
          total > 0
            ? portal
              ? `${formatNumber(total)} exam${total === 1 ? '' : 's'} for you`
              : `${formatNumber(total)} exams in the catalogue`
            : portal
              ? 'No exams assigned yet'
              : 'No examinations yet'
        }
        description={
          portal
            ? 'See your timetable and download admit cards when they are approved.'
            : 'Schedule papers, enter marks and generate report cards.'
        }
        actions={
          ctx.can('exams.manage') ? (
            <Link href="/exams/new" className={colorBannerPrimaryBtn()}>
              <Plus aria-hidden />
              New exam
            </Link>
          ) : portal ? (
            <Link href="/exams/my-admit-cards" className={colorBannerPrimaryBtn()}>
              My admit cards
            </Link>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label={portal ? 'Your exams' : 'Total exams'}
          value={formatNumber(total)}
          sub={portal ? 'Assigned to your class' : 'All examination records'}
          tone="late"
          href="#exams-list"
          icon={<FileCheck className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Upcoming / active"
          value={formatNumber(activeExams)}
          sub="On this page of results"
          tone="admissions"
          href="#exams-list"
          icon={<Calendar className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label={portal ? 'Admit cards' : 'Report cards'}
          value="Open"
          sub={portal ? 'Download approved cards' : 'Generate and print cards'}
          tone="students"
          href={portal ? '/exams/my-admit-cards' : '/exams/report-cards'}
          icon={<ScrollText className="size-5" aria-hidden />}
          delayMs={120}
        />
      </div>

      <Card id="exams-list" variant="elevated" className="scroll-mt-20 overflow-hidden">
        <SearchBar placeholder="Search exams" />

        {rows.length === 0 ? (
          <EmptyState
            title={
              params.q
                ? 'No exams match that search'
                : portal
                  ? 'No exams assigned yet'
                  : 'No examinations yet'
            }
            description={
              portal
                ? 'When your school schedules an exam for your class, it will show here.'
                : 'Set up an examination to schedule papers and enter marks.'
            }
            action={
              ctx.can('exams.manage') ? (
                <Link href="/exams/new" className={buttonVariants({ size: 'sm' })}>
                  Set up an exam
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Examination</TH>
                    <TH>Type</TH>
                    <TH>Starts</TH>
                    <TH align="right">Classes</TH>
                    <TH align="right">Papers</TH>
                    <TH>Status</TH>
                    <TH align="right">
                      <span className="sr-only">Actions</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((exam) => (
                    <TR key={exam.id}>
                      <TD>
                        <Link
                          href={`/exams/${exam.id}`}
                          className="text-sm font-medium text-ink hover:text-[var(--brand-600)]"
                        >
                          {exam.name}
                        </Link>
                      </TD>
                      <TD className="first-letter:uppercase">
                        {exam.kind.replaceAll('_', ' ').toLowerCase()}
                      </TD>
                      <TD>{exam.startsOn ? formatDay(exam.startsOn, 'd MMM yyyy') : '—'}</TD>
                      <TD align="right">{exam._count.classes}</TD>
                      <TD align="right">{exam._count.subjects}</TD>
                      <TD>
                        <StatusBadge status={exam.status} />
                      </TD>
                      <TD align="right">
                        {portal ? (
                          <Link
                            href={`/exams/${exam.id}`}
                            className="text-sm text-[var(--brand-600)] hover:underline"
                          >
                            View
                          </Link>
                        ) : ctx.can('exams.marks') ? (
                          <Link
                            href={`/exams/${exam.id}/marks`}
                            className="text-sm text-[var(--brand-600)] hover:underline"
                          >
                            Enter marks
                          </Link>
                        ) : (
                          <Link
                            href={`/exams/${exam.id}`}
                            className="text-sm text-[var(--brand-600)] hover:underline"
                          >
                            Open
                          </Link>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
            <Pagination total={total} page={query.page} pageSize={query.pageSize} label="exams" />
          </>
        )}
      </Card>
    </div>
  )
}
