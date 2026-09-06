import Link from 'next/link'
import { formatDay } from '@/lib/dates'
import { Pencil } from 'lucide-react'
import { requireContext } from '@/server/context'
import type { AppContext } from '@/server/context'
import { getStudent } from '@/server/modules/students/service'
import { PageHeader } from '@/components/page-header'
import { LinkTabs } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DescriptionItem,
  DescriptionList,
} from '@/components/ui/card'
import { Badge, StatusBadge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState, Notice } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney, fullName } from '@/lib/utils'
import { Avatar, PersonCell } from '@/components/ui/identity'
import { EditableAvatar } from '@/components/ui/editable-avatar'
import { StudentDocumentsCard } from './student-documents-card'
import { Student360 } from './student-360'
import { uploadStudentPhotoAction, removeStudentPhotoAction } from './photo-actions'

export const metadata = { title: 'Student profile' }

const TABS = ['360', 'profile'] as const
type Tab = (typeof TABS)[number]

/**
 * One student's whole record.
 *
 * The 360° dashboard leads — a RAG read of attendance, marks, feedback and the
 * health score — with the identity/guardians/fees/documents detail a click away
 * on the Profile tab. Tabs share the header, the person and the single
 * `students.view` check; a query parameter rather than nested routes keeps all
 * three from being repeated. The header avatar is the upload control, present on
 * both tabs and editable only with `students.edit`.
 */
export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const ctx = await requireContext('students.view')
  const student = await getStudent(ctx, id)

  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : '360'
  const current = student.enrollments.find((e) => e.isCurrent)
  const href = (t: Tab) => `/students/${id}?tab=${t}`

  return (
    <div className="space-y-4">
      <PageHeader
        title={fullName(student)}
        description={`Admission no. ${student.admissionNo}${
          current ? ` · ${current.classLevel.name} ${current.section.name}` : ''
        }`}
        media={
          <EditableAvatar
            firstName={student.firstName}
            lastName={student.lastName}
            photoUrl={student.photoUrl}
            canEdit={ctx.can('students.edit')}
            uploadAction={uploadStudentPhotoAction.bind(null, student.id)}
            removeAction={removeStudentPhotoAction.bind(null, student.id)}
          />
        }
        actions={
          ctx.can('students.edit') ? (
            <Link
              href={`/students/${student.id}/edit`}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              <Pencil aria-hidden />
              Edit
            </Link>
          ) : null
        }
      />

      {query.welcome ? (
        <Notice tone="success" title="Parent portal login created">
          One-time password for the guardian:{' '}
          <strong className="tnum">{query.welcome}</strong>. Share it now — it cannot be shown
          again. Username is their phone; they will change the password at first sign-in.
        </Notice>
      ) : null}

      <LinkTabs
        label="Student record"
        items={[
          { label: '360°', href: href('360'), active: tab === '360' },
          { label: 'Profile', href: href('profile'), active: tab === 'profile' },
        ]}
      />

      {tab === '360' ? (
        <Student360 ctx={ctx} student={student} />
      ) : (
        <StudentProfile ctx={ctx} student={student} />
      )}
    </div>
  )
}

type StudentRecord = Awaited<ReturnType<typeof getStudent>>

/**
 * The record proper: identity, guardians, fees, documents and enrolment
 * history. Lifted verbatim from the old single-scroll page into the Profile
 * tab, with the header avatar now carrying the photo.
 */
function StudentProfile({ ctx, student }: { ctx: AppContext; student: StudentRecord }) {
  const current = student.enrollments.find((e) => e.isCurrent)
  const dueMinor = student.invoices.reduce((sum, i) => sum + i.balanceMinor, 0)
  const currency = ctx.tenant.currency
  const canSeeFeeAmounts = ctx.can('fees.view')
  const canSeeFeeStatus = canSeeFeeAmounts || ctx.can('fees.status')

  return (
    <div className="space-y-4">
      {student.allergies || student.medicalNotes ? (
        <Notice tone="warning" title="Medical information">
          {student.allergies ? <p>Allergies: {student.allergies}</p> : null}
          {student.medicalNotes ? <p>{student.medicalNotes}</p> : null}
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent>
            <div className="flex items-center gap-3">
              <Avatar
                firstName={student.firstName}
                lastName={student.lastName}
                avatarUrl={student.photoUrl}
              />
              <div className="min-w-0">
                <p className="text-base font-semibold text-ink truncate">{fullName(student)}</p>
                <StatusBadge status={student.status} className="mt-1" />
              </div>
            </div>

            <DescriptionList className="mt-4">
              <DescriptionItem label="Class">{current ? `${current.classLevel.name} · Section ${current.section.name}` : 'Not placed'}</DescriptionItem>
              <DescriptionItem label="Roll number">{current?.rollNumber ? String(current.rollNumber) : '-'}</DescriptionItem>
              <DescriptionItem label="Session">{current?.session.name ?? '-'}</DescriptionItem>
              <DescriptionItem label="Date of birth">{student.dateOfBirth ? formatDay(student.dateOfBirth, 'd MMM yyyy') : '-'}</DescriptionItem>
              <DescriptionItem label="Gender">{student.gender ? student.gender.toLowerCase() : '-'}</DescriptionItem>
              <DescriptionItem label="Blood group">{student.bloodGroup ?? '-'}</DescriptionItem>
              <DescriptionItem label="Admitted on">{student.admissionDate ? formatDay(student.admissionDate, 'd MMM yyyy') : '-'}</DescriptionItem>
              <DescriptionItem label="Address">{
                  [student.addressLine1, student.city, student.state, student.postalCode]
                    .filter(Boolean)
                    .join(', ') || '-'
                }</DescriptionItem>
              <DescriptionItem label="Emergency contact">{student.emergencyContactName ? `${student.emergencyContactName} · ${student.emergencyContactPhone ?? ''}` : '-'}</DescriptionItem>
            </DescriptionList>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Guardians</CardTitle>
            </CardHeader>
            <CardContent className="py-1">
              {student.guardians.length === 0 ? (
                <EmptyState
                  title="No guardian linked"
                  description="Link a parent so they can access the portal and receive fee notices."
                />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {student.guardians.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-3 py-2">
                      <PersonCell
                        firstName={g.parent.firstName}
                        lastName={g.parent.lastName}
                        secondary={`${g.relation.toLowerCase()}${
                          g.parent.phone ? ` · ${g.parent.phone}` : ''
                        }${g.parent.email ? ` · ${g.parent.email}` : ''}`}
                      />
                      {g.isPrimary ? <Badge tone="brand">Primary</Badge> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {canSeeFeeStatus ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Fees</CardTitle>
                <CardDescription>
                  {canSeeFeeAmounts
                    ? dueMinor > 0
                      ? `${formatMoney(dueMinor, currency)} outstanding`
                      : 'No outstanding balance'
                    : dueMinor > 0
                      ? 'Payment pending'
                      : 'Fees paid / no dues'}
                </CardDescription>
              </div>
              {ctx.can('fees.collect') && dueMinor > 0 ? (
                <Link
                  href={`/finance/collect?student=${student.id}`}
                  className={buttonVariants({ size: 'sm' })}
                >
                  Collect fee
                </Link>
              ) : null}
            </CardHeader>
            <CardContent className="p-0">
              {!canSeeFeeAmounts ? (
                <EmptyState
                  title={dueMinor > 0 ? 'Dues outstanding' : 'Cleared'}
                  description="Fee amounts are only visible to finance staff. Teachers see paid / unpaid status only."
                />
              ) : student.invoices.length === 0 ? (
                <EmptyState title="No invoices" description="Fee invoices will appear here once issued." />
              ) : (
                <TableWrap>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Invoice</TH>
                        <TH>Due</TH>
                        <TH align="right">Total</TH>
                        <TH align="right">Balance</TH>
                        <TH>Status</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {student.invoices.map((i) => (
                        <TR key={i.id}>
                          <TD>
                            <span className="block text-sm text-ink">{i.title}</span>
                            <span className="block text-xs text-ink-subtle tnum">{i.number}</span>
                          </TD>
                          <TD className="text-sm text-ink-muted">{formatDay(i.dueOn, 'd MMM yyyy')}</TD>
                          <TD align="right" className="text-sm">
                            {formatMoney(i.totalMinor, currency)}
                          </TD>
                          <TD align="right" className="text-sm font-medium">
                            {formatMoney(i.balanceMinor, currency)}
                          </TD>
                          <TD>
                            <StatusBadge status={i.status} />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </CardContent>
          </Card>
          ) : null}

          <StudentDocumentsCard
            ctx={ctx}
            studentId={student.id}
            studentName={fullName(student)}
          />

          <Card>
            <CardHeader>
              <CardTitle>Enrolment history</CardTitle>
            </CardHeader>
            <CardContent className="py-1">
              <ul className="divide-y divide-[var(--border)]">
                {student.enrollments.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="text-sm text-ink">
                        {e.classLevel.name} · Section {e.section.name}
                      </p>
                      <p className="text-xs text-ink-subtle">{e.session.name}</p>
                    </div>
                    {e.isCurrent ? <Badge tone="success">Current</Badge> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
