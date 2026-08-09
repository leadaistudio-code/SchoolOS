import Link from 'next/link'
import { formatDay } from '@/lib/dates'
import { AlertTriangle, Pencil } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getStudent } from '@/server/modules/students/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { formatMoney, fullName, initials } from '@/lib/utils'

export const metadata = { title: 'Student profile' }

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireContext('students.view')
  const student = await getStudent(ctx, id)

  const current = student.enrollments.find((e) => e.isCurrent)
  const dueMinor = student.invoices.reduce((sum, i) => sum + i.balanceMinor, 0)
  const currency = ctx.tenant.currency

  return (
    <div className="space-y-4">
      <PageHeader
        title={fullName(student)}
        description={`Admission no. ${student.admissionNo}${
          current ? ` · ${current.classLevel.name} ${current.section.name}` : ''
        }`}
        actions={
          ctx.can('students.edit') ? (
            <Link
              href={`/students/${student.id}/edit`}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              <Pencil className="size-4" aria-hidden />
              Edit
            </Link>
          ) : null
        }
      />

      {student.allergies || student.medicalNotes ? (
        <div className="flex items-start gap-2.5 rounded-[var(--radius)] bg-warning-bg border border-[color-mix(in_srgb,var(--warning)_28%,transparent)] px-4 py-3">
          <AlertTriangle className="size-4.5 text-warning mt-0.5 shrink-0" aria-hidden />
          <div className="text-[13px] text-warning">
            {student.allergies ? (
              <p>
                <span className="font-semibold">Allergies:</span> {student.allergies}
              </p>
            ) : null}
            {student.medicalNotes ? (
              <p>
                <span className="font-semibold">Medical:</span> {student.medicalNotes}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3.5">
              <span className="size-16 rounded-full bg-[var(--brand-500)] text-[var(--brand-contrast)] grid place-items-center text-xl font-semibold shrink-0">
                {initials(student.firstName, student.lastName)}
              </span>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold text-ink truncate">{fullName(student)}</p>
                <Badge tone={student.status === 'ACTIVE' ? 'success' : 'neutral'} className="mt-1">
                  {student.status.toLowerCase()}
                </Badge>
              </div>
            </div>

            <dl className="mt-5 space-y-2.5 text-[13px]">
              <Row label="Class" value={current ? `${current.classLevel.name} · Section ${current.section.name}` : 'Not placed'} />
              <Row label="Roll number" value={current?.rollNumber ? String(current.rollNumber) : '-'} />
              <Row label="Session" value={current?.session.name ?? '-'} />
              <Row label="Date of birth" value={student.dateOfBirth ? formatDay(student.dateOfBirth, 'd MMM yyyy') : '-'} />
              <Row label="Gender" value={student.gender ? student.gender.toLowerCase() : '-'} />
              <Row label="Blood group" value={student.bloodGroup ?? '-'} />
              <Row label="Admitted on" value={student.admissionDate ? formatDay(student.admissionDate, 'd MMM yyyy') : '-'} />
              <Row
                label="Address"
                value={
                  [student.addressLine1, student.city, student.state, student.postalCode]
                    .filter(Boolean)
                    .join(', ') || '-'
                }
              />
              <Row label="Emergency contact" value={student.emergencyContactName ? `${student.emergencyContactName} · ${student.emergencyContactPhone ?? ''}` : '-'} />
            </dl>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Guardians</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {student.guardians.length === 0 ? (
                <EmptyState
                  title="No guardian linked"
                  description="Link a parent so they can access the portal and receive fee notices."
                />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {student.guardians.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[13.5px] text-ink truncate">
                          {g.parent.firstName} {g.parent.lastName}
                          {g.isPrimary ? (
                            <Badge tone="brand" className="ml-2">
                              primary
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-[12px] text-ink-subtle">
                          {g.relation.toLowerCase()}
                          {g.parent.phone ? ` · ${g.parent.phone}` : ''}
                          {g.parent.email ? ` · ${g.parent.email}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Fees</CardTitle>
                <p className="text-[13px] text-ink-muted mt-0.5">
                  {dueMinor > 0
                    ? `${formatMoney(dueMinor, currency)} outstanding`
                    : 'No outstanding balance'}
                </p>
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
            <CardContent className="pt-0 px-0">
              {student.invoices.length === 0 ? (
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
                            <span className="block text-[13px] text-ink">{i.title}</span>
                            <span className="block text-[12px] text-ink-subtle tnum">{i.number}</span>
                          </TD>
                          <TD className="text-[13px] text-ink-muted">{formatDay(i.dueOn, 'd MMM yyyy')}</TD>
                          <TD align="right" className="text-[13px]">
                            {formatMoney(i.totalMinor, currency)}
                          </TD>
                          <TD align="right" className="text-[13px] font-medium">
                            {formatMoney(i.balanceMinor, currency)}
                          </TD>
                          <TD>
                            <Badge
                              tone={
                                i.status === 'PAID'
                                  ? 'success'
                                  : i.status === 'OVERDUE'
                                    ? 'danger'
                                    : 'warning'
                              }
                            >
                              {i.status.toLowerCase().replace('_', ' ')}
                            </Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Enrolment history</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="divide-y divide-[var(--border)]">
                {student.enrollments.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-[13.5px] text-ink">
                        {e.classLevel.name} · Section {e.section.name}
                      </p>
                      <p className="text-[12px] text-ink-subtle">{e.session.name}</p>
                    </div>
                    {e.isCurrent ? <Badge tone="success">current</Badge> : null}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-subtle shrink-0">{label}</dt>
      <dd className="text-ink text-right capitalize-first">{value}</dd>
    </div>
  )
}
