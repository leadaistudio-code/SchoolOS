import Link from 'next/link'
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Grid3x3,
  History,
  Hourglass,
  LayoutDashboard,
  Lock,
  RefreshCw,
  Send,
  ShieldCheck,
  TableProperties,
  Upload,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react'
import { requireContext } from '@/server/context'
import {
  EXCEPTION_LABELS,
  MARK_SOURCES,
  SHEET_STATUSES,
  marksActivity,
  marksHub,
  marksHubFilterSchema,
  type MarksHubTab,
} from '@/server/modules/exams/marks-hub'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { LinkTabs } from '@/components/ui/tabs'
import { ACCENT, ActionLink, StatCard } from '@/components/ui/stat-card'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { marksRegister, marksRegisterFilterSchema } from '@/server/modules/exams/marks-register'
import { MarksHubFilters } from './hub-filters'
import { RegisterView } from './register-view'
import { SheetActions } from './sheet-actions'
import { ResultReadiness } from './result-readiness'

export const metadata = { title: 'Marks management' }

const ROW_LIMIT = 300

const STATUS_BADGE = {
  OPEN: { tone: 'neutral', label: 'Open' },
  SUBMITTED: { tone: 'info', label: 'Submitted' },
  LOCKED: { tone: 'brand', label: 'Locked' },
} as const

function progressColour(percent: number) {
  if (percent >= 100) return ACCENT.emerald
  if (percent >= 60) return ACCENT.sky
  if (percent >= 25) return ACCENT.amber
  return ACCENT.rose
}

function Progress({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, percent)}%`, background: progressColour(percent) }} />
    </div>
  )
}

function stamp(date: Date | null) {
  return date ? formatDay(date, 'd MMM yyyy, h:mm a') : '—'
}

export default async function MarksHubPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('exams.marks')
  const params = await searchParams
  const filters = marksHubFilterSchema.parse(params)
  const tab: MarksHubTab = filters.tab ?? 'overview'
  const hub = await marksHub(ctx, filters)
  const activity = tab === 'imports' || tab === 'audit' ? await marksActivity(ctx, tab, filters.exam) : []
  const canSeeRegister = ctx.can('exams.manage') || ctx.can('results.view')
  const register = tab === 'register' && canSeeRegister ? await marksRegister(ctx, marksRegisterFilterSchema.parse(params)) : null

  const query = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries({ ...params, ...patch })) if (value) next.set(key, value)
    const s = next.toString()
    return s ? `/exams/marks?${s}` : '/exams/marks'
  }
  const targetExam = filters.exam ?? hub.exams[0]?.id
  const { stats } = hub
  const sourceTotal = hub.sources.TEACHER_MANUAL + hub.sources.ADMIN_MANUAL + hub.sources.CSV_IMPORT

  const tabs: Array<{ key: MarksHubTab; label: string; icon: typeof LayoutDashboard; accent: string; count?: number }> = [
    { key: 'overview', label: 'Overview & completion', icon: LayoutDashboard, accent: ACCENT.indigo },
    ...(canSeeRegister ? [{ key: 'register' as const, label: 'Student marks register', icon: TableProperties, accent: ACCENT.teal }] : []),
    { key: 'sheets', label: 'Marks sheets', icon: FileSpreadsheet, accent: ACCENT.sky, count: stats.sheets },
    { key: 'missing', label: 'Missing marks', icon: UserX, accent: ACCENT.rose, count: stats.missing },
    { key: 'teachers', label: 'Teacher submissions', icon: UserCheck, accent: ACCENT.emerald },
    { key: 'exceptions', label: 'Exceptions & issues', icon: AlertTriangle, accent: ACCENT.amber, count: stats.exceptions },
    { key: 'imports', label: 'CSV imports', icon: Upload, accent: ACCENT.violet },
    { key: 'audit', label: 'Audit trail', icon: History, accent: ACCENT.slate },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Marks management & monitoring hub"
        description="Track marks entry across every exam, class and paper — completion, submissions, gaps and exceptions in one place."
        actions={
          <div className="flex flex-wrap gap-2">
            {targetExam ? (
              <>
                <ActionLink href={`/exams/${targetExam}/marks#bulk-upload`} icon={Upload} accent={ACCENT.violet}>Upload marks CSV</ActionLink>
                <ActionLink href={`/exams/${targetExam}/marks`} icon={Grid3x3} accent={ACCENT.sky}>Marks grid entry</ActionLink>
              </>
            ) : null}
            {ctx.can('results.view') ? <ActionLink href="/exams/results" icon={BarChart3} accent={ACCENT.emerald}>Results hub</ActionLink> : null}
            <ActionLink href={query({})} icon={RefreshCw} accent={ACCENT.slate}>Refresh</ActionLink>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
        <StatCard label="Exams" value={stats.exams} icon={BookOpenCheck} accent={ACCENT.indigo} hint="Not archived" />
        <StatCard label="Total sheets" value={stats.sheets} icon={FileSpreadsheet} accent={ACCENT.sky} hint="Exam papers" href={query({ tab: 'sheets', status: undefined })} />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} accent={ACCENT.emerald} tone="success" href={query({ tab: 'sheets', status: 'COMPLETE' })} />
        <StatCard label="Pending" value={stats.pending} icon={Hourglass} accent={ACCENT.amber} tone={stats.pending ? 'warning' : undefined} href={query({ tab: 'sheets', status: 'PENDING' })} />
        <StatCard label="Submitted" value={stats.submitted} icon={Send} accent={ACCENT.teal} href={query({ tab: 'sheets', status: 'SUBMITTED' })} />
        <StatCard label="Locked" value={stats.locked} icon={Lock} accent={ACCENT.violet} href={query({ tab: 'sheets', status: 'LOCKED' })} />
        <StatCard label="Missing marks" value={stats.missing} icon={UserX} accent={ACCENT.rose} tone={stats.missing ? 'danger' : undefined} href={query({ tab: 'missing' })} />
        <StatCard label="Exceptions" value={stats.exceptions} icon={AlertTriangle} accent={ACCENT.orange} tone={stats.exceptions ? 'warning' : undefined} href={query({ tab: 'exceptions' })} />
      </div>

      <Card>
        <CardContent className="pt-4">
          <MarksHubFilters
            exams={hub.examOptions.map((e) => ({ id: e.id, label: e.name }))}
            classes={hub.classOptions.map((c) => ({ id: c.id, label: c.name }))}
            sections={hub.sectionOptions}
            statuses={SHEET_STATUSES}
            sources={MARK_SOURCES}
          />
        </CardContent>
      </Card>

      <LinkTabs
        label="Marks hub sections"
        items={tabs.map((t) => ({ label: t.label, href: query({ tab: t.key === 'overview' ? undefined : t.key }), active: tab === t.key, icon: t.icon, accent: t.accent, count: t.count }))}
      />

      {(tab === 'overview' || tab === 'sheets') && hub.resultReadiness.length > 0 ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Generate results</CardTitle>
              <CardDescription>
                A class is ready when every paper has all its marks or is closed without marks. Generated results stay drafts until you publish them from the Results hub.
              </CardDescription>
            </div>
          </CardHeader>
          <ResultReadiness groups={hub.resultReadiness} />
        </Card>
      ) : null}

      {tab === 'overview' ? (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Marks entry source distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { key: 'TEACHER_MANUAL' as const, label: 'Teacher manual', icon: Users, accent: ACCENT.emerald, hint: 'Entered by the subject teacher' },
                  { key: 'ADMIN_MANUAL' as const, label: 'School admin manual', icon: ShieldCheck, accent: ACCENT.indigo, hint: 'Entered or corrected by the office' },
                  { key: 'CSV_IMPORT' as const, label: 'CSV import', icon: FileText, accent: ACCENT.violet, hint: 'Uploaded from a spreadsheet' },
                ].map((s) => {
                  const count = hub.sources[s.key]
                  const pct = sourceTotal ? Math.round((count / sourceTotal) * 100) : 0
                  return (
                    <Link key={s.key} href={query({ tab: 'sheets', source: s.key })} className="block">
                      <StatCard label={s.label} value={count.toLocaleString('en-IN')} icon={s.icon} accent={s.accent} hint={`${pct}% of entries · ${s.hint}`} />
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Class-level marks recording progress</CardTitle>
            </CardHeader>
            <CardContent>
              {hub.classProgress.length === 0 ? (
                <EmptyState title="No classes to track" description="Add papers to an exam to start tracking marks entry." />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5">
                  {hub.classProgress.map((row) => (
                    <div
                      key={row.key}
                      className="rounded-xl border border-line p-3"
                      style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${progressColour(row.percent)} 9%, transparent), transparent 60%)` }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{row.label}</p>
                        <p className="text-lg font-bold tnum" style={{ color: progressColour(row.percent) }}>{row.percent}%</p>
                      </div>
                      <div className="mt-2"><Progress percent={row.percent} /></div>
                      <p className="mt-2 text-xs text-ink-subtle tnum">
                        {row.students} students · {row.subjects} subjects · {row.entered}/{row.expected} marks
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {register ? <RegisterView data={register} params={params} /> : null}

      {tab === 'sheets' ? (
        <Card className="overflow-hidden">
          {hub.sheets.length === 0 ? (
            <EmptyState title="No marks sheets match" description="Change the filters or add papers to an exam." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Exam</TH>
                    <TH>Class · subject</TH>
                    <TH>Teacher</TH>
                    <TH className="w-48">Completion</TH>
                    <TH>Status</TH>
                    <TH>Last activity</TH>
                    <TH align="right">Actions</TH>
                  </tr>
                </THead>
                <TBody>
                  {hub.sheets.slice(0, ROW_LIMIT).map((sheet) => (
                    <TR key={sheet.id}>
                      <TD className="text-sm text-ink">{sheet.examName}</TD>
                      <TD>
                        <span className="block text-sm font-medium text-ink">{sheet.className} · {sheet.subjectName}</span>
                        <span className="block text-xs text-ink-subtle">Out of {sheet.maxMarks}{sheet.examDate ? ` · ${formatDay(sheet.examDate)}` : ''}</span>
                      </TD>
                      <TD className="text-sm">{sheet.teacherName || <span className="text-ink-subtle">Unassigned</span>}</TD>
                      <TD>
                        {sheet.closed ? (
                          <span className="block text-xs text-ink-subtle" title={sheet.closedReason ?? undefined}>
                            Not evaluated{sheet.closedReason ? ` · ${sheet.closedReason}` : ''}
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Progress percent={sheet.percent} />
                            <span className="w-16 shrink-0 text-right text-xs tnum text-ink-muted">{sheet.entered}/{sheet.expected}</span>
                          </div>
                        )}
                      </TD>
                      <TD>
                        {sheet.closed ? (
                          <Badge tone="neutral">Closed · no marks</Badge>
                        ) : (
                          <Badge tone={STATUS_BADGE[sheet.status].tone}>{STATUS_BADGE[sheet.status].label}</Badge>
                        )}
                      </TD>
                      <TD className="text-xs text-ink-muted">{stamp(sheet.lastActivity)}</TD>
                      <TD align="right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/exams/${sheet.examId}/marks?subject=${sheet.id}`} className="text-xs font-medium text-[var(--brand-600)] hover:underline">
                            {sheet.status === 'LOCKED' ? 'View' : 'Enter'}
                          </Link>
                          <SheetActions sheetId={sheet.id} status={sheet.status} isAdmin={hub.isAdmin} published={sheet.examStatus === 'PUBLISHED'} canClose={!sheet.complete} />
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {hub.sheets.length > ROW_LIMIT ? <p className="px-3 py-2 text-xs text-ink-subtle">Showing the first {ROW_LIMIT} of {hub.sheets.length} sheets. Narrow the filters to see more.</p> : null}
            </TableWrap>
          )}
        </Card>
      ) : null}

      {tab === 'missing' ? (
        <Card className="overflow-hidden">
          {hub.missing.length === 0 ? (
            <EmptyState title="No missing marks" description="Every student on every matching sheet has a mark or is marked absent." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Student</TH>
                    <TH>Class</TH>
                    <TH>Exam · subject</TH>
                    <TH>Teacher</TH>
                    <TH align="right"><span className="sr-only">Open</span></TH>
                  </tr>
                </THead>
                <TBody>
                  {hub.missing.slice(0, ROW_LIMIT).map((row) => (
                    <TR key={row.key}>
                      <TD>
                        <span className="block text-sm text-ink">{row.rollNumber ? `${row.rollNumber}. ` : ''}{row.studentName}</span>
                        <span className="block text-xs text-ink-subtle tnum">{row.admissionNo}</span>
                      </TD>
                      <TD className="text-sm">{row.className}{row.sectionName ? ` · ${row.sectionName}` : ''}</TD>
                      <TD className="text-sm">{row.examName} · {row.subjectName}</TD>
                      <TD className="text-sm">{row.teacherName || <span className="text-ink-subtle">Unassigned</span>}</TD>
                      <TD align="right">
                        <Link href={`/exams/${row.examId}/marks?subject=${row.sheetId}`} className="text-xs font-medium text-[var(--brand-600)] hover:underline">Enter mark</Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {hub.missing.length > ROW_LIMIT ? <p className="px-3 py-2 text-xs text-ink-subtle">Showing {ROW_LIMIT} of {hub.missing.length} missing entries. Filter by exam or class to see the rest.</p> : null}
            </TableWrap>
          )}
        </Card>
      ) : null}

      {tab === 'teachers' ? (
        <Card className="overflow-hidden">
          {hub.teachers.length === 0 ? (
            <EmptyState title="No teacher assignments" description="Assign subject teachers to class subjects in Academics." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Teacher</TH>
                    <TH align="right">Sheets</TH>
                    <TH align="right">Completed</TH>
                    <TH align="right">Submitted</TH>
                    <TH align="right">Locked</TH>
                    <TH align="right">Missing marks</TH>
                    <TH className="w-40">Progress</TH>
                    <TH>Last activity</TH>
                  </tr>
                </THead>
                <TBody>
                  {hub.teachers.map((t) => {
                    const pct = t.sheets ? Math.floor((t.complete / t.sheets) * 100) : 0
                    return (
                      <TR key={t.key}>
                        <TD className="text-sm font-medium text-ink">{t.name}</TD>
                        <TD align="right" className="tnum">{t.sheets}</TD>
                        <TD align="right" className="tnum text-success">{t.complete}</TD>
                        <TD align="right" className="tnum">{t.submitted}</TD>
                        <TD align="right" className="tnum">{t.locked}</TD>
                        <TD align="right" className={`tnum ${t.missing ? 'text-[var(--danger)] font-semibold' : ''}`}>{t.missing}</TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <Progress percent={pct} />
                            <span className="w-9 shrink-0 text-right text-xs tnum text-ink-muted">{pct}%</span>
                          </div>
                        </TD>
                        <TD className="text-xs text-ink-muted">{stamp(t.lastActivity)}</TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      ) : null}

      {tab === 'exceptions' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(Object.keys(EXCEPTION_LABELS) as Array<keyof typeof EXCEPTION_LABELS>).map((kind) => (
              <StatCard
                key={kind}
                label={EXCEPTION_LABELS[kind].label}
                value={hub.exceptions.filter((e) => e.kind === kind).length}
                hint={EXCEPTION_LABELS[kind].hint}
                accent={EXCEPTION_LABELS[kind].severity === 'high' ? ACCENT.rose : EXCEPTION_LABELS[kind].severity === 'medium' ? ACCENT.amber : ACCENT.slate}
              />
            ))}
          </div>
          <Card className="overflow-hidden">
            {hub.exceptions.length === 0 ? (
              <EmptyState title="No exceptions" description="Marks data looks clean for the selected filters." />
            ) : (
              <TableWrap>
                <Table>
                  <THead>
                    <tr>
                      <TH>Issue</TH>
                      <TH>Exam · paper</TH>
                      <TH>Detail</TH>
                      <TH align="right"><span className="sr-only">Open</span></TH>
                    </tr>
                  </THead>
                  <TBody>
                    {hub.exceptions.slice(0, ROW_LIMIT).map((e) => {
                      const meta = EXCEPTION_LABELS[e.kind]
                      return (
                        <TR key={e.key}>
                          <TD><Badge tone={meta.severity === 'high' ? 'danger' : meta.severity === 'medium' ? 'warning' : 'neutral'}>{meta.label}</Badge></TD>
                          <TD className="text-sm">{e.examName} · {e.className} · {e.subjectName}</TD>
                          <TD className="text-sm text-ink-muted">{e.detail}</TD>
                          <TD align="right">
                            <Link href={`/exams/${e.examId}/marks?subject=${e.sheetId}`} className="text-xs font-medium text-[var(--brand-600)] hover:underline">Open sheet</Link>
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
      ) : null}

      {tab === 'imports' || tab === 'audit' ? (
        <Card className="overflow-hidden">
          {activity.length === 0 ? (
            <EmptyState
              title={tab === 'imports' ? 'No CSV imports yet' : 'No marks activity yet'}
              description={tab === 'imports' ? 'Imports from “Upload marks CSV” appear here with the number of rows saved.' : 'Saves, imports, submissions, locks and result runs are recorded here.'}
            />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>When</TH>
                    <TH>Action</TH>
                    <TH>By</TH>
                    <TH>Summary</TH>
                  </tr>
                </THead>
                <TBody>
                  {activity.map((row) => {
                    const after = (row.after ?? {}) as { students?: number }
                    return (
                      <TR key={row.id}>
                        <TD className="whitespace-nowrap text-xs text-ink-muted">{stamp(row.createdAt)}</TD>
                        <TD><Badge tone={row.action.includes('import') ? 'info' : row.action.includes('lock') || row.action.includes('publish') ? 'brand' : 'neutral'}>{row.action.replace(/^exam\.|^result\./, '').replace(/\./g, ' ')}</Badge></TD>
                        <TD className="text-sm">{row.actorLabel ?? '—'}</TD>
                        <TD className="text-sm text-ink-muted">
                          {row.summary}
                          {typeof after.students === 'number' ? <span className="ml-1 text-xs text-ink-subtle">({after.students} rows)</span> : null}
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </Card>
      ) : null}

      {hub.exams.length === 0 ? (
        <Card>
          <EmptyState
            title="No examinations ready for marks"
            description="Create an exam and add papers, then return here to monitor marks entry."
            action={ctx.can('exams.manage') ? <Link href="/exams/new" className="text-sm text-[var(--brand-600)] hover:underline">Set up an exam</Link> : undefined}
          />
        </Card>
      ) : null}
    </div>
  )
}
