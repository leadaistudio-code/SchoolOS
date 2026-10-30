import { redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
import { isPortalOnlyRole } from '@/server/scope'
import { markableSections } from '@/server/modules/academics/service'
import { formatDay, toDateInput } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { BackButton } from '@/components/back-button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { DocumentLetterhead } from '@/components/print/document-letterhead'
import { PrintButton } from '@/app/(app)/finance/payments/[id]/print-button'

export const metadata = { title: 'PTM signature sheet' }

const RELATION: Record<string, string> = {
  FATHER: 'Father',
  MOTHER: 'Mother',
  GUARDIAN: 'Guardian',
}

export default async function PtmSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ sectionId?: string; onDate?: string; eventId?: string; agenda?: string; blank?: string }>
}) {
  const ctx = await requireContext('attendance.view')
  if (isPortalOnlyRole(ctx.user.roleKeys)) redirect('/attendance/reports')
  const params = await searchParams

  const today = new Date()
  const windowStart = new Date(today.getTime() - 30 * 86_400_000)
  const windowEnd = new Date(today.getTime() + 90 * 86_400_000)
  const [sections, ptmEvents, school] = await Promise.all([
    markableSections(ctx),
    ctx.db.calendarEvent.findMany({
      where: { kind: 'PTM', startsAt: { gte: windowStart, lte: windowEnd } },
      orderBy: { startsAt: 'asc' },
      select: { id: true, title: true, startsAt: true, location: true, description: true },
    }),
    ctx.db.school.findFirst({
      select: { addressLine1: true, addressLine2: true, city: true, state: true, postalCode: true },
    }),
  ])

  const event = ptmEvents.find((e) => e.id === params.eventId)
  const sectionId = params.sectionId ?? sections[0]?.id
  const section = sections.find((s) => s.id === sectionId)
  const onDate = params.onDate ?? (event ? toDateInput(event.startsAt) : toDateInput(today))
  const agenda = params.agenda?.trim() || event?.description?.trim() || ''
  const blankRows = Math.min(Math.max(Number(params.blank) || 0, 0), 20)

  const [students, sectionInfo] = section
    ? await Promise.all([
        ctx.db.enrollment.findMany({
          where: { sectionId: section.id, isCurrent: true, student: { deletedAt: null, status: 'ACTIVE' } },
          orderBy: [{ rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
          select: {
            rollNumber: true,
            student: {
              select: {
                id: true,
                admissionNo: true,
                firstName: true,
                lastName: true,
                guardians: {
                  orderBy: { isPrimary: 'desc' },
                  take: 2,
                  select: { relation: true, parent: { select: { firstName: true, lastName: true, phone: true } } },
                },
              },
            },
          },
        }),
        ctx.db.section.findFirst({
          where: { id: section.id },
          select: { classTeacher: { select: { firstName: true, lastName: true } } },
        }),
      ])
    : [[], null]

  const schoolInfo = ctx.tenant.school
  const schoolAddress = school
    ? [school.addressLine1, school.addressLine2, [school.city, school.state, school.postalCode].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join('\n')
    : null
  const classTeacher = sectionInfo?.classTeacher
    ? `${sectionInfo.classTeacher.firstName} ${sectionInfo.classTeacher.lastName}`
    : null

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <PageHeader
          title="PTM signature sheet"
          description="A printable attendance sheet for a parent-teacher meeting: parents sign against their child, and the teacher notes what was discussed and agreed."
          actions={
            <>
              <PrintButton />
              <BackButton fallbackHref="/attendance" />
            </>
          }
        />
        <Card>
          <CardContent className="pt-4">
            <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
              <label className="block text-sm">
                <span className="text-ink-muted">Class section</span>
                <select
                  name="sectionId"
                  defaultValue={sectionId}
                  className="mt-1 block h-9 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm"
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.classLevel.name} · Section {s.name} ({s._count.enrollments})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-ink-muted">PTM from calendar</span>
                <select
                  name="eventId"
                  defaultValue={event?.id ?? ''}
                  className="mt-1 block h-9 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm"
                >
                  <option value="">Not linked</option>
                  {ptmEvents.map((e) => (
                    <option key={e.id} value={e.id}>
                      {formatDay(e.startsAt, 'd MMM')} · {e.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-ink-muted">Meeting date</span>
                <input
                  type="date"
                  name="onDate"
                  defaultValue={onDate}
                  className="mt-1 block h-9 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-ink-muted">Agenda (optional)</span>
                <input
                  name="agenda"
                  defaultValue={params.agenda ?? ''}
                  placeholder="e.g. Term 1 results"
                  className="mt-1 block h-9 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm"
                />
              </label>
              <div className="flex items-end gap-2">
                <label className="block w-20 text-sm">
                  <span className="text-ink-muted">Extra rows</span>
                  <input
                    type="number"
                    name="blank"
                    min={0}
                    max={20}
                    defaultValue={blankRows}
                    className="mt-1 block h-9 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-sm"
                  />
                </label>
                <button type="submit" className={buttonVariants({ size: 'sm' })}>
                  Show sheet
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {!section ? (
        <Card>
          <EmptyState
            title="No sections assigned to you"
            description="The sheet lists the students of a section you teach or are class teacher of."
          />
        </Card>
      ) : (
        <DocumentLetterhead
          schoolName={schoolInfo?.name ?? ctx.tenant.name}
          schoolAddress={schoolAddress}
          logoUrl={schoolInfo?.logoUrl}
          letterheadHeaderUrl={schoolInfo?.letterheadHeaderUrl}
          letterheadFooterUrl={schoolInfo?.letterheadFooterUrl}
          className="ptm-sheet overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface print:rounded-none print:border-0"
        >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
            <div>
              <p className="text-lg font-semibold text-ink">
                {event?.title ?? 'Parent-teacher meeting'} · attendance &amp; outcome sheet
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">
                Class {section.classLevel.name} · Section {section.name}
                {classTeacher ? ` · Class teacher ${classTeacher}` : ''}
              </p>
            </div>
            <div className="text-right text-sm text-ink-muted">
              <p>
                Date: <span className="font-medium text-ink">{formatDay(new Date(`${onDate}T00:00:00Z`), 'd MMMM yyyy')}</span>
              </p>
              {event?.location ? <p>Venue: {event.location}</p> : null}
            </div>
          </div>
          {agenda ? (
            <p className="mb-3 text-sm text-ink">
              <span className="font-semibold">Agenda:</span> {agenda}
            </p>
          ) : null}

          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-surface-2 text-left">
                <th className="border border-line px-1.5 py-1.5 w-8">S.No</th>
                <th className="border border-line px-1.5 py-1.5 w-10">Roll</th>
                <th className="border border-line px-1.5 py-1.5">Student</th>
                <th className="border border-line px-1.5 py-1.5">Parent / guardian</th>
                <th className="border border-line px-1.5 py-1.5 w-24">Phone</th>
                <th className="border border-line px-1.5 py-1.5 w-20">Attended by</th>
                <th className="border border-line px-1.5 py-1.5 w-28">Parent signature</th>
                <th className="border border-line px-1.5 py-1.5 w-[28%]">Discussion / outcome</th>
              </tr>
            </thead>
            <tbody>
              {students.map((row, index) => {
                const primary = row.student.guardians[0]
                return (
                  <tr key={row.student.id} className="break-inside-avoid">
                    <td className="border border-line px-1.5 py-3 tnum">{index + 1}</td>
                    <td className="border border-line px-1.5 py-3 tnum">{row.rollNumber ?? ''}</td>
                    <td className="border border-line px-1.5 py-3">
                      <span className="font-medium text-ink">
                        {row.student.firstName} {row.student.lastName}
                      </span>
                      <span className="block text-[10px] text-ink-subtle tnum">{row.student.admissionNo}</span>
                    </td>
                    <td className="border border-line px-1.5 py-3">
                      {row.student.guardians.map((g) => (
                        <span key={`${g.parent.firstName}-${g.relation}`} className="block">
                          {g.parent.firstName} {g.parent.lastName}
                          <span className="text-[10px] text-ink-subtle"> ({RELATION[g.relation] ?? g.relation.toLowerCase()})</span>
                        </span>
                      ))}
                    </td>
                    <td className="border border-line px-1.5 py-3 tnum">{primary?.parent.phone ?? ''}</td>
                    <td className="border border-line px-1.5 py-3" />
                    <td className="border border-line px-1.5 py-3" />
                    <td className="border border-line px-1.5 py-3" />
                  </tr>
                )
              })}
              {Array.from({ length: blankRows }, (_, i) => (
                <tr key={`blank-${i}`} className="break-inside-avoid">
                  <td className="border border-line px-1.5 py-3 tnum">{students.length + i + 1}</td>
                  {Array.from({ length: 7 }, (_, j) => (
                    <td key={j} className="border border-line px-1.5 py-3" />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
            <p>
              Parents present: ______ of {students.length}
            </p>
            <p>Key points / action items: ____________________</p>
            <p />
          </div>
          <div className="mt-10 grid grid-cols-2 gap-10 text-center text-xs text-ink-subtle">
            <p className="border-t border-line pt-1">Class teacher{classTeacher ? ` (${classTeacher})` : ''}</p>
            <p className="border-t border-line pt-1">Principal</p>
          </div>
        </DocumentLetterhead>
      )}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          .ptm-sheet { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>
    </div>
  )
}
