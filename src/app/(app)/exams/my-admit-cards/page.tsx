import Link from 'next/link'
import { Download } from 'lucide-react'
import { redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
import { isPortalOnlyRole } from '@/server/scope'
import { listPortalAdmitCards } from '@/server/modules/exams/admit-cards'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'

export const metadata = { title: 'My admit cards' }

export default async function MyAdmitCardsPage() {
  const ctx = await requireContext('exams.view')
  if (!isPortalOnlyRole(ctx.user.roleKeys)) {
    redirect(ctx.can('exams.admit_cards') ? '/exams/admit-cards' : '/exams')
  }

  const { rows } = await listPortalAdmitCards(ctx)
  const isParent = ctx.user.roleKeys.includes('PARENT')

  return (
    <div className="space-y-4">
      <PageHeader
        title="My admit cards"
        description={
          isParent
            ? 'Download approved admit cards for your children.'
            : 'Download your approved admit cards for scheduled exams.'
        }
      />

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="No admit cards yet"
            description="When the school issues and approves your admit card, it will appear here for download."
            action={
              <Link href="/exams" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
                View my exams
              </Link>
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Examination</TH>
                  {isParent ? <TH>Student</TH> : null}
                  <TH>Class</TH>
                  <TH>Starts</TH>
                  <TH>Status</TH>
                  <TH align="right">
                    <span className="sr-only">Download</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((card) => {
                  const enrollment = card.student.enrollments[0]
                  const classLabel = enrollment
                    ? `${enrollment.classLevel.name}${enrollment.section ? ` ${enrollment.section.name}` : ''}`
                    : '—'
                  const canDownload = card.status === 'APPROVED'
                  return (
                    <TR key={card.id}>
                      <TD>
                        <Link
                          href={`/exams/${card.exam.id}`}
                          className="text-sm font-medium text-ink hover:text-[var(--brand-600)]"
                        >
                          {card.exam.name}
                        </Link>
                      </TD>
                      {isParent ? (
                        <TD>
                          {card.student.firstName} {card.student.lastName}
                          <span className="block text-xs text-ink-muted">{card.student.admissionNo}</span>
                        </TD>
                      ) : null}
                      <TD>{classLabel}</TD>
                      <TD>
                        {card.exam.startsOn ? formatDay(card.exam.startsOn, 'd MMM yyyy') : '—'}
                      </TD>
                      <TD>
                        <StatusBadge status={card.status} />
                      </TD>
                      <TD align="right">
                        {canDownload ? (
                          <Link
                            href={`/exams/admit-cards/${card.id}`}
                            className={buttonVariants({ size: 'sm' })}
                          >
                            <Download className="size-4" aria-hidden />
                            Download
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-muted">Awaiting approval</span>
                        )}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
