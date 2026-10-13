import Link from 'next/link'
import { CheckCircle2, CircleDashed, FileDown, Hourglass, Printer, Users } from 'lucide-react'
import { SECTION_STATUS_LABEL, type MarksRegister } from '@/server/modules/exams/marks-register'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { ACCENT, StatCard } from '@/components/ui/stat-card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button-variants'
import { RegisterTable } from './register-table'

const STATUS_TONE = { COMPLETED: 'success', IN_PROGRESS: 'warning', NOT_STARTED: 'neutral' } as const

export function RegisterView({
  data,
  params,
}: {
  data: MarksRegister
  params: Record<string, string | undefined>
}) {
  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...params, exam: params.exam ?? data.exam?.id, ...patch })) if (v && k !== 'tab') next.set(k, v)
    return next.toString()
  }
  const pageHref = (patch: Record<string, string | undefined>) => `/exams/marks?${new URLSearchParams({ tab: 'register', ...Object.fromEntries(new URLSearchParams(qs(patch))) }).toString()}`

  if (!data.exam) {
    return (
      <Card>
        <EmptyState title="No exam with papers yet" description="Add papers to an exam to see the marks register." />
      </Card>
    )
  }

  const exportBar = (
    <div className="flex flex-wrap gap-2">
      <a href={`/api/v1/exams/marks-register/export?${qs({})}`} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
        <FileDown aria-hidden /> Excel
      </a>
      <Link href={`/exams/marks/register/print?${qs({})}`} target="_blank" className={buttonVariants({ size: 'sm' })}>
        <Printer aria-hidden /> PDF / Print
      </Link>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Class-sections" value={data.totals.sections} icon={Users} accent={ACCENT.indigo} hint={`${data.totals.students} students in ${data.exam.name}`} />
        <StatCard label="Completed" value={data.totals.completed} icon={CheckCircle2} accent={ACCENT.emerald} tone="success" href={pageHref({ status: 'COMPLETE', classLevelId: undefined, sectionId: undefined })} hint={`${data.totals.completeStudents} students with all marks`} />
        <StatCard label="In progress" value={data.totals.inProgress} icon={Hourglass} accent={ACCENT.amber} href={pageHref({ status: 'PENDING', classLevelId: undefined, sectionId: undefined })} />
        <StatCard label="Not started" value={data.totals.notStarted} icon={CircleDashed} accent={ACCENT.rose} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Class & section status · {data.exam.name}</CardTitle>
          {data.register ? null : exportBar}
        </CardHeader>
        {data.sections.length === 0 ? (
          <EmptyState title="No class-sections match" description="Change the exam, class or status filter." />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Class · section</TH>
                  <TH align="right">Students</TH>
                  <TH align="right">Subjects</TH>
                  <TH className="w-44">Marks entered</TH>
                  <TH align="right">All marks in</TH>
                  <TH align="right">Locked papers</TH>
                  <TH align="right">Pass / fail</TH>
                  <TH align="right">Class avg</TH>
                  <TH>Status</TH>
                  <TH align="right"><span className="sr-only">Open</span></TH>
                </tr>
              </THead>
              <TBody>
                {data.sections.map((s) => (
                  <TR key={s.key}>
                    <TD className="font-medium text-ink">{s.className} · {s.sectionName}</TD>
                    <TD align="right" className="tnum">{s.students}</TD>
                    <TD align="right" className="tnum">{s.subjects}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${s.percent}%`, background: s.percent >= 100 ? ACCENT.emerald : s.percent >= 50 ? ACCENT.sky : ACCENT.amber }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs tnum text-ink-muted">{s.percent}%</span>
                      </div>
                    </TD>
                    <TD align="right" className="tnum">{s.completeStudents}/{s.students}</TD>
                    <TD align="right" className="tnum">{s.sheetsLocked}/{s.subjects}</TD>
                    <TD align="right" className="tnum">
                      <span className="text-success">{s.passed}</span> / <span className={s.failed ? 'text-[var(--danger)]' : ''}>{s.failed}</span>
                    </TD>
                    <TD align="right" className="tnum">{s.average !== null ? `${s.average}%` : '—'}</TD>
                    <TD><Badge tone={STATUS_TONE[s.status]}>{SECTION_STATUS_LABEL[s.status]}</Badge></TD>
                    <TD align="right">
                      <Link
                        href={pageHref({ classLevelId: s.classLevelId, sectionId: s.sectionId })}
                        className="text-xs font-medium text-[var(--brand-600)] hover:underline"
                      >
                        View marks
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {data.register ? (
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>
                Marks register · {data.register.className}
                {data.register.sectionName ? ` · ${data.register.sectionName}` : ' · all sections'}
              </CardTitle>
              <p className="mt-0.5 text-xs text-ink-subtle">
                {data.register.rows.length} students · AB = absent · red = below pass marks · grade, result and rank appear once every mark is in
              </p>
            </div>
            {exportBar}
          </CardHeader>
          {data.register.rows.length === 0 ? (
            <EmptyState title="No students match" description="Try a different status filter." />
          ) : (
            <div className="overflow-x-auto px-4 pb-4">
              <RegisterTable register={data.register} />
            </div>
          )}
        </Card>
      ) : (
        <p className="text-sm text-ink-muted">Pick a class (and section) in the filters above, or click “View marks”, to see every student’s marks.</p>
      )}
    </div>
  )
}
