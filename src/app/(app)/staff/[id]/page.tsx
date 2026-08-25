import Link from 'next/link'
import { format } from 'date-fns'
import { requireContext } from '@/server/context'
import { getStaff, teacherOptions } from '@/server/modules/people/service'
import { listPayslips, salaryHistory, monthName } from '@/server/modules/staff/payroll'
import { listAppraisals, COMPETENCIES } from '@/server/modules/staff/appraisals'
import { staffFeedback, staffPerformance } from '@/server/modules/staff/performance'
import { formatDay } from '@/lib/dates'
import { formatMoney, formatNumber } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { LinkTabs } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DescriptionItem,
  DescriptionList,
} from '@/components/ui/card'
import { Badge, humanizeStatus, type BadgeTone } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState, Notice } from '@/components/ui/states'
import { Metric, MetricRow } from '@/components/ui/metric'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Avatar } from '@/components/ui/identity'
import { EditableAvatar } from '@/components/ui/editable-avatar'
import { BarList } from '@/components/reports/primitives'
import { GeneratePayslipButton, OpenAppraisalButton, PayslipStatusControl, SetSalaryButton } from './panels'
import { AppraisalEditor } from '../appraisal-editor'
import { Staff360 } from './staff-360'
import { uploadStaffPhotoAction, removeStaffPhotoAction } from './photo-actions'

export const metadata = { title: 'Staff profile' }

const TABS = ['360', 'overview', 'salary', 'performance', 'feedback', 'appraisals'] as const
type Tab = (typeof TABS)[number]

const PAYSLIP_TONE: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'info',
  PAID: 'success',
}

const APPRAISAL_TONE: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  SELF_REVIEW: 'info',
  MANAGER_REVIEW: 'warning',
  COMPLETED: 'success',
}

/**
 * One person's whole record.
 *
 * Tabs rather than one long scroll, and a query parameter rather than nested
 * routes: the tabs share the header, the person and the permission check, and
 * splitting them into five routes would repeat all three. Each tab only
 * queries what it shows.
 */
export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const ctx = await requireContext('staff.view')
  const staff = await getStaff(ctx, id)

  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : '360'
  const canPayroll = ctx.can('staff.payroll')
  const canPayrollManage = ctx.can('staff.payroll_manage')
  const canAppraise = ctx.can('staff.appraise')
  const currency = ctx.tenant.currency
  const money = (minor: number) => formatMoney(minor, currency)

  const name = `${staff.firstName} ${staff.lastName}`.trim()
  const href = (t: Tab) => `/staff/${id}?tab=${t}`

  return (
    <div className="space-y-4">
      <PageHeader
        title={name}
        description={`${staff.employeeCode}${staff.designation ? ` · ${staff.designation}` : ''}${staff.department ? ` · ${staff.department}` : ''}`}
        breadcrumbs={[{ label: 'Teachers & staff', href: '/staff' }, { label: name }]}
        media={
          <EditableAvatar
            firstName={staff.firstName}
            lastName={staff.lastName}
            photoUrl={staff.photoUrl}
            canEdit={ctx.can('staff.edit')}
            uploadAction={uploadStaffPhotoAction.bind(null, id)}
            removeAction={removeStaffPhotoAction.bind(null, id)}
          />
        }
        actions={
          ctx.can('staff.edit') ? (
            <Link href={`/staff/${id}/edit`} className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
              Edit profile
            </Link>
          ) : null
        }
      />

      {query.welcome ? (
        <Notice tone="success" title="Portal login created">
          One-time password: <strong className="tnum">{query.welcome}</strong>. Share it with{' '}
          {staff.firstName} now — it is not stored and cannot be shown again. They will be asked to
          change it at first sign-in.
        </Notice>
      ) : null}

      <LinkTabs
        label="Staff record"
        items={[
          { label: '360°', href: href('360'), active: tab === '360' },
          { label: 'Overview', href: href('overview'), active: tab === 'overview' },
          ...(canPayroll ? [{ label: 'Salary', href: href('salary'), active: tab === 'salary' }] : []),
          { label: 'Performance', href: href('performance'), active: tab === 'performance' },
          { label: 'Feedback', href: href('feedback'), active: tab === 'feedback' },
          { label: 'Appraisals', href: href('appraisals'), active: tab === 'appraisals' },
        ]}
      />

      {tab === '360' ? <Staff360 ctx={ctx} staff={staff} /> : null}
      {tab === 'overview' ? <Overview staff={staff} money={money} canPayroll={canPayroll} /> : null}
      {tab === 'salary' && canPayroll ? (
        <SalaryTab
          staffId={id}
          money={money}
          canManage={canPayrollManage}
          history={await salaryHistory(ctx, id)}
          payslips={await listPayslips(ctx, { staffId: id })}
        />
      ) : null}
      {tab === 'performance' ? (
        <PerformanceTab data={await staffPerformance(ctx, id)} />
      ) : null}
      {tab === 'feedback' ? <FeedbackTab data={await staffFeedback(ctx, id)} /> : null}
      {tab === 'appraisals' ? (
        <AppraisalsTab
          staffId={id}
          name={name}
          money={money}
          canAppraise={canAppraise}
          appraisals={await listAppraisals(ctx, { staffId: id })}
          reviewers={(await teacherOptions(ctx))
            .filter((t) => t.id !== id)
            .map((t) => ({ id: t.id, label: `${t.firstName} ${t.lastName}` }))}
        />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ tabs */

type StaffRecord = Awaited<ReturnType<typeof getStaff>>

function Overview({
  staff,
  money,
  canPayroll,
}: {
  staff: StaffRecord
  money: (m: number) => string
  canPayroll: boolean
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardContent>
          <div className="flex items-center gap-3">
            <Avatar firstName={staff.firstName} lastName={staff.lastName} avatarUrl={staff.photoUrl} />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink">
                {staff.firstName} {staff.lastName}
              </p>
              <p className="text-sm text-ink-subtle first-letter:uppercase">
                {staff.staffType.toLowerCase()}
              </p>
            </div>
          </div>

          <DescriptionList className="mt-4">
            <DescriptionItem label="Department">{staff.department ?? '—'}</DescriptionItem>
            <DescriptionItem label="Qualification">{staff.qualification ?? '—'}</DescriptionItem>
            <DescriptionItem label="Experience">
              {staff.experienceYears ? `${staff.experienceYears} years` : '—'}
            </DescriptionItem>
            <DescriptionItem label="Phone">{staff.phone ?? '—'}</DescriptionItem>
            <DescriptionItem label="Email">{staff.email ?? '—'}</DescriptionItem>
            <DescriptionItem label="Joined">
              {staff.joinedOn ? formatDay(staff.joinedOn, 'd MMM yyyy') : '—'}
            </DescriptionItem>
            <DescriptionItem label="Address">
              {staff.addressLine1
                ? [staff.addressLine1, staff.city, staff.state, staff.postalCode]
                    .filter(Boolean)
                    .join(', ')
                : '—'}
            </DescriptionItem>
            {canPayroll ? (
              <DescriptionItem label="Salary">
                {staff.salaryMinor ? money(staff.salaryMinor) : '—'}
              </DescriptionItem>
            ) : null}
            <DescriptionItem label="Portal login">
              {staff.user
                ? `${staff.user.email ?? 'linked'} (${staff.user.status.toLowerCase()})`
                : 'None'}
            </DescriptionItem>
            <DescriptionItem label="Last sign-in">
              {staff.user?.lastLoginAt
                ? format(staff.user.lastLoginAt, 'd MMM yyyy, HH:mm')
                : 'Never'}
            </DescriptionItem>
          </DescriptionList>
        </CardContent>
      </Card>

      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Teaching assignments</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            {staff.classSubjects.length === 0 && staff.classTeacherOf.length === 0 ? (
              <EmptyState
                title="No assignments"
                description="Attach a subject to a class under Subjects, naming this person as its teacher."
              />
            ) : (
              <>
                {staff.classTeacherOf.length > 0 ? (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {staff.classTeacherOf.map((s) => (
                      <Badge key={s.id} tone="brand">
                        Class teacher · {s.classLevel.name} {s.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <ul className="divide-y divide-[var(--border)]">
                  {staff.classSubjects.map((cs) => (
                    <li key={cs.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-sm text-ink">{cs.subject.name}</span>
                      <span className="text-xs text-ink-subtle">{cs.classLevel.name}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent leave</CardTitle>
            <Link href="/staff/approvals" className="text-xs font-medium text-[var(--brand-600)] hover:underline">
              Approvals queue
            </Link>
          </CardHeader>
          <CardContent className="py-1">
            {staff.leaveRequests.length === 0 ? (
              <EmptyState title="No leave requests" description="Leave applied for will appear here." />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {staff.leaveRequests.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-sm text-ink">
                        {formatDay(l.fromDate)} – {formatDay(l.toDate)}
                      </span>
                      <span className="block truncate text-xs text-ink-subtle">{l.reason}</span>
                    </span>
                    <Badge
                      tone={
                        l.status === 'APPROVED'
                          ? 'success'
                          : l.status === 'REJECTED'
                            ? 'danger'
                            : l.status === 'PENDING'
                              ? 'warning'
                              : 'neutral'
                      }
                    >
                      {l.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SalaryTab({
  staffId,
  money,
  canManage,
  history,
  payslips,
}: {
  staffId: string
  money: (m: number) => string
  canManage: boolean
  history: Awaited<ReturnType<typeof salaryHistory>>
  payslips: Awaited<ReturnType<typeof listPayslips>>
}) {
  const current = history[0] ?? null

  return (
    <div className="space-y-4">
      <MetricRow>
        <Metric
          label="Gross salary"
          value={current ? money(current.grossMinor) : 'Not set'}
          sub={current ? `Effective ${formatDay(current.effectiveFrom)}` : 'No salary on record'}
        />
        <Metric
          label="Deductions"
          value={current ? money(current.deductionsMinor) : '—'}
          sub="Provident fund, tax, insurance"
        />
        <Metric
          label="Take home"
          value={current ? money(current.netMinor) : '—'}
          sub="Before loss of pay"
        />
        <Metric
          label="Payslips"
          value={String(payslips.length)}
          sub={`${payslips.filter((p) => p.status === 'PAID').length} paid`}
        />
      </MetricRow>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Salary revisions</CardTitle>
          {canManage ? (
            <SetSalaryButton
              staffId={staffId}
              current={current}
              label={current ? 'Revise salary' : 'Set salary'}
            />
          ) : null}
        </CardHeader>
        {history.length === 0 ? (
          <EmptyState
            title="No salary on record"
            description={
              canManage
                ? 'Set the components once and every payslip is worked out from them.'
                : 'Nobody has recorded a salary for this person yet.'
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Effective from</TH>
                  <TH align="right">Basic</TH>
                  <TH align="right">HRA</TH>
                  <TH align="right">Allowances</TH>
                  <TH align="right">Deductions</TH>
                  <TH align="right">Take home</TH>
                  <TH>Note</TH>
                </tr>
              </THead>
              <TBody>
                {history.map((row, i) => (
                  <TR key={row.id}>
                    <TD className="text-sm text-ink">
                      {formatDay(row.effectiveFrom)}
                      {i === 0 ? <Badge tone="success" className="ml-2">current</Badge> : null}
                    </TD>
                    <TD align="right" className="text-sm">{money(row.basicMinor)}</TD>
                    <TD align="right" className="text-sm">{money(row.hraMinor)}</TD>
                    <TD align="right" className="text-sm">{money(row.allowancesMinor)}</TD>
                    <TD align="right" className="text-sm">{money(row.deductionsMinor)}</TD>
                    <TD align="right" className="text-sm font-medium text-ink">
                      {money(row.netMinor)}
                    </TD>
                    <TD className="text-xs text-ink-subtle">{row.notes ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Payslips</CardTitle>
          {canManage ? <GeneratePayslipButton staffId={staffId} disabled={!current} /> : null}
        </CardHeader>
        {payslips.length === 0 ? (
          <EmptyState
            title="No payslips yet"
            description="Generate one for a month and it is worked out from the salary in force that month."
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Month</TH>
                  <TH align="right">Days paid</TH>
                  <TH align="right">Gross</TH>
                  <TH align="right">Loss of pay</TH>
                  <TH align="right">Net</TH>
                  <TH>Status</TH>
                  {canManage ? <TH align="right">&nbsp;</TH> : null}
                </tr>
              </THead>
              <TBody>
                {payslips.map((p) => (
                  <TR key={p.id}>
                    <TD className="text-sm text-ink">
                      {monthName(p.periodMonth)} {p.periodYear}
                    </TD>
                    <TD align="right" className="text-sm">
                      {p.paidDays}/{p.workingDays}
                    </TD>
                    <TD align="right" className="text-sm">{money(p.grossMinor)}</TD>
                    <TD align="right" className="text-sm">
                      {p.lopMinor > 0 ? (
                        <span className="text-warning">−{money(p.lopMinor)}</span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD align="right" className="text-sm font-medium text-ink">
                      {money(p.netMinor)}
                    </TD>
                    <TD>
                      <Badge tone={PAYSLIP_TONE[p.status] ?? 'neutral'}>
                        {p.status.toLowerCase()}
                      </Badge>
                    </TD>
                    {canManage ? (
                      <TD align="right">
                        <PayslipStatusControl id={p.id} status={p.status} />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}

function PerformanceTab({ data }: { data: Awaited<ReturnType<typeof staffPerformance>> }) {
  return (
    <div className="space-y-4">
      <MetricRow>
        <Metric
          label="Attendance"
          value={data.attendance.percent === null ? 'No data' : `${data.attendance.percent}%`}
          sub={`${data.attendance.marked} days marked in ${data.window.days} days`}
          emphasis={
            data.attendance.percent !== null && data.attendance.percent < 90 ? 'warning' : undefined
          }
        />
        <Metric
          label="Teaching load"
          value={String(data.teaching.periodsPerWeek)}
          sub={`periods a week · ${data.teaching.subjects} subjects`}
        />
        <Metric
          label="Lessons logged"
          value={formatNumber(data.teaching.classworkLogged)}
          sub={`${formatNumber(data.teaching.homeworkSet)} homework tasks set`}
        />
        <Metric
          label="Leave"
          value={String(data.leave.approved)}
          sub={`${data.leave.pending} awaiting a decision`}
          emphasis={data.leave.pending > 0 ? 'warning' : undefined}
        />
      </MetricRow>

      {data.attendance.unmarked > 0 ? (
        <Notice tone="info" title={`${data.attendance.unmarked} days without a record`}>
          The staff register ran on those days but this person has no row on it. They are excluded
          from the percentage rather than counted absent.
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Attendance breakdown</CardTitle>
            <span className="text-xs text-ink-subtle">Last {data.window.days} days</span>
          </CardHeader>
          <BarList
            emptyLabel="No staff attendance marked in this window"
            rows={[
              { label: 'Present', value: data.attendance.present, display: String(data.attendance.present) },
              { label: 'Late', value: data.attendance.late, display: String(data.attendance.late) },
              { label: 'Half day', value: data.attendance.halfDay, display: String(data.attendance.halfDay) },
              { label: 'On leave', value: data.attendance.leave, display: String(data.attendance.leave) },
              { label: 'Absent', value: data.attendance.absent, display: String(data.attendance.absent) },
            ].filter((r) => r.value > 0)}
          />
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Syllabus planning</CardTitle>
            <span className="text-xs text-ink-subtle">
              {data.syllabus.published} of {data.syllabus.plans} published
            </span>
          </CardHeader>
          {data.syllabus.bySubject.length === 0 ? (
            <EmptyState
              title="No syllabus entered"
              description="Subjects this person teaches have no syllabus started yet."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {data.syllabus.bySubject.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0 truncate text-sm text-ink">{s.label}</span>
                  <span className="shrink-0 text-xs tnum text-ink-subtle">
                    {s.chapters} chapters · {s.topics} topics
                  </span>
                  <Badge tone={s.isPublished ? 'success' : 'warning'}>
                    {s.isPublished ? 'published' : 'draft'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What this is built from</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="max-w-2xl text-sm text-ink-muted">
            Nothing on this tab is a judgement — it is the register that was marked, the lessons
            that were logged, the syllabus that was entered and the marks that were keyed in. A
            considered assessment belongs on the Appraisals tab, where the reasoning is recorded
            alongside the score.
          </p>
          <p className="mt-2 text-xs tnum text-ink-subtle">
            {formatNumber(data.teaching.marksEntered)} marks entered · {data.teaching.classTeacherOf}{' '}
            sections as class teacher
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function FeedbackTab({ data }: { data: Awaited<ReturnType<typeof staffFeedback>> }) {
  if (!data.available) {
    return (
      <Card>
        <EmptyState
          title="Not enough responses yet"
          description={`${data.responseCount} of the ${data.minimum} responses needed. Ratings are withheld below that threshold — with a handful of responses a score says more about who answered than about the teaching.${data.pending > 0 ? ` ${data.pending} requests are still outstanding.` : ''}`}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <MetricRow columns={3}>
        <Metric
          label="Responses"
          value={String(data.responseCount)}
          sub={`Threshold ${data.minimum}`}
        />
        <Metric
          label="Highest rated"
          value={data.categories[0] ? `${data.categories[0].average}` : '—'}
          sub={data.categories[0]?.name ?? 'No rated categories'}
        />
        <Metric
          label="Lowest rated"
          value={
            data.categories.length
              ? `${data.categories[data.categories.length - 1]!.average}`
              : '—'
          }
          sub={data.categories[data.categories.length - 1]?.name ?? '—'}
        />
      </MetricRow>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>By category</CardTitle>
          <span className="text-xs text-ink-subtle">Mean rating out of five</span>
        </CardHeader>
        <BarList
          rows={data.categories.map((c) => ({
            label: c.name,
            value: c.average,
            display: `${c.average} / 5`,
            note: `${c.count} answers`,
          }))}
        />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Comments</CardTitle>
          <span className="text-xs text-ink-subtle">Approved in moderation only</span>
        </CardHeader>
        {data.comments.length === 0 ? (
          <EmptyState
            title="No approved comments"
            description="Written feedback appears here once a moderator has read and approved it."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {data.comments.map((c, i) => (
              <li key={i} className="px-4 py-3">
                <p className="text-xs text-ink-subtle">{c.category}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{c.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function AppraisalsTab({
  staffId,
  name,
  money,
  canAppraise,
  appraisals,
  reviewers,
}: {
  staffId: string
  name: string
  money: (m: number) => string
  canAppraise: boolean
  appraisals: Awaited<ReturnType<typeof listAppraisals>>
  reviewers: { id: string; label: string }[]
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Appraisals</CardTitle>
        {canAppraise ? <OpenAppraisalButton staffId={staffId} reviewers={reviewers} /> : null}
      </CardHeader>

      {appraisals.length === 0 ? (
        <EmptyState
          title="No appraisals yet"
          description={
            canAppraise
              ? 'Open a cycle to score seven competencies, record what was said on both sides, and set goals for next year.'
              : 'Nobody has opened an appraisal cycle for this person.'
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {appraisals.map((a) => (
            <li key={a.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-medium text-ink">{a.cycleName}</span>
                <Badge tone={APPRAISAL_TONE[a.status] ?? 'neutral'}>
                  {humanizeStatus(a.status)}
                </Badge>
                {a.overallRating !== null ? (
                  <span className="text-sm tnum text-ink">
                    {a.overallRating}
                    <span className="text-xs text-ink-subtle"> / 5</span>
                  </span>
                ) : null}
                <span className="ml-auto text-xs tnum text-ink-subtle">
                  {formatDay(a.periodFrom)} – {formatDay(a.periodTo)}
                </span>
              </div>

              <p className="mt-1 text-xs text-ink-subtle">
                Reviewer:{' '}
                {a.reviewer ? `${a.reviewer.firstName} ${a.reviewer.lastName}` : 'not assigned'}
                {a.outcome ? ` · ${humanizeStatus(a.outcome)}` : ''}
                {a.incrementMinor ? ` · ${money(a.incrementMinor)} increment` : ''}
              </p>

              {a.reviewerComment ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
                  {a.reviewerComment}
                </p>
              ) : null}

              {canAppraise ? (
                <div className="mt-3">
                  <AppraisalEditor
                    competencies={[...COMPETENCIES]}
                    trigger={a.status === 'COMPLETED' ? 'View review' : 'Open review'}
                    appraisal={{
                      id: a.id,
                      status: a.status,
                      selfComment: a.selfComment,
                      reviewerComment: a.reviewerComment,
                      strengths: a.strengths,
                      improvements: a.improvements,
                      goals: a.goals,
                      outcome: a.outcome,
                      incrementMinor: a.incrementMinor,
                      staffName: name,
                      cycleName: a.cycleName,
                      ratings: a.ratings,
                    }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
