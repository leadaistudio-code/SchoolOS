import Link from 'next/link'
import { requireContext } from '@/server/context'
import { scoreStaff } from '@/server/modules/score/staff'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LinkTabs } from '@/components/ui/tabs'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { BandBar, ScoreDial, ScorePill } from '../score-ui'
import { scoreTabs } from '../tabs'

export const metadata = { title: 'Staff scores' }

/**
 * Staff scores.
 *
 * Guarded by `staff.view` as well as `score.view`: the school's health card is
 * management information, but a ranked list of named colleagues is personnel
 * data, and the two do not carry the same right to be seen.
 */
export default async function StaffScorePage() {
  const ctx = await requireContext('score.view')
  if (!ctx.can('staff.view')) {
    return (
      <div>
        <PageHeader title="Staff scores" />
        <Card>
          <CardContent>
            <EmptyState
              title="Not yours to see"
              description="Staff scores need permission to view staff records, which this account does not have."
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  const summary = await scoreStaff(ctx)

  return (
    <div>
      <PageHeader
        title="Staff scores"
        description={`${summary.counted} of ${summary.staff.length} scored`}
        breadcrumbs={[{ label: 'Health score', href: '/score' }, { label: 'Staff' }]}
      />

      <LinkTabs label="Health score views" className="mb-3" items={scoreTabs('/score/staff', ctx)} />

      <Notice tone="warning" title="Read this as a prompt, not a ranking" className="mb-3">
        These figures are attendance and appraisals the school already holds. Nothing here measures
        teaching quality, and nothing here should stand in for a conversation — a teacher given a
        difficult class must never score badly for it.
      </Notice>

      {summary.staff.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState title="No staff on record" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
          <Card>
            <CardContent className="space-y-4">
              <ScoreDial score={summary.score} band={summary.band} caption="Across all staff" />
              <div className="border-t border-line pt-3">
                <BandBar counts={summary.bands} total={summary.staff.length} />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Everyone</CardTitle>
            </CardHeader>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Name</TH>
                    <TH>Role</TH>
                    <TH>Score</TH>
                    <TH>Weakest area</TH>
                  </tr>
                </THead>
                <TBody>
                  {summary.staff.map((person) => {
                    const weakest = person.composed.parts
                      .filter((p) => p.score !== null)
                      .sort((a, b) => a.score! - b.score!)[0]

                    return (
                      <TR key={person.staffId}>
                        <TD>
                          <Link
                            href={`/staff/${person.staffId}`}
                            className="font-medium text-ink hover:underline"
                          >
                            {person.firstName} {person.lastName}
                          </Link>
                          <span className="block text-xs text-ink-subtle">
                            {person.employeeCode}
                          </span>
                        </TD>
                        <TD>
                          {person.designation ?? '—'}
                          {person.department ? (
                            <span className="block text-xs text-ink-subtle">
                              {person.department}
                            </span>
                          ) : null}
                        </TD>
                        <TD>
                          <ScorePill score={person.composed.score} band={person.composed.band} />
                        </TD>
                        <TD>
                          {weakest ? (
                            <>
                              <span className="text-ink">{weakest.label}</span>
                              <span className="block text-xs text-ink-subtle">
                                {weakest.detail}
                              </span>
                            </>
                          ) : (
                            <span className="text-ink-subtle">Nothing measured yet</span>
                          )}
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
          </Card>
        </div>
      )}
    </div>
  )
}
