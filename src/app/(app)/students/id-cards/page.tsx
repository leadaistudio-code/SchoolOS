import { ShieldCheck } from 'lucide-react'
import { requireContext } from '@/server/context'
import { getStudentIdCards, studentIdCardSetup } from '@/server/modules/students/id-cards'
import { resolveBrandingAssetUrl } from '@/server/branding-assets'
import { formatDay } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { IdCardFilters, PrintIdCardsButton } from './id-card-controls'

export const metadata = { title: 'Student ID cards' }

export default async function StudentIdCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const ctx = await requireContext('students.id_cards')
  const query = await searchParams
  const setup = await studentIdCardSetup(ctx)
  const data = query.class
    ? await getStudentIdCards(ctx, query.class, query.section)
    : null
  const school = data?.school
  const schoolName = school?.name ?? ctx.tenant.school?.name ?? ctx.tenant.name
  const schoolLogoUrl = resolveBrandingAssetUrl(school?.branding?.logoUrl, 'logo')
  const schoolAddress = school
    ? [
        school.addressLine1,
        school.addressLine2,
        [school.city, school.state, school.postalCode].filter(Boolean).join(', '),
      ].filter(Boolean).join(', ')
    : ''

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader
          title="Student ID cards"
          description="Select a class or section, review the cards, then print on standard CR80 card sheets."
          actions={<PrintIdCardsButton disabled={!data?.cards.length} />}
        />
      </div>

      <Card className="no-print">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <IdCardFilters
            classes={setup.classes}
            classLevelId={query.class ?? ''}
            sectionId={query.section ?? ''}
          />
          <p className="text-sm text-ink-muted">
            {data
              ? `${data.cards.length} card${data.cards.length === 1 ? '' : 's'} ready`
              : 'Choose a class to begin'}
          </p>
        </CardContent>
      </Card>

      {!data ? (
        <Card className="no-print">
          <EmptyState
            title="Choose a class"
            description="ID cards use the current enrolment, student photo, guardian contact, and school branding."
          />
        </Card>
      ) : data.cards.length === 0 ? (
        <Card className="no-print">
          <EmptyState
            title="No active students found"
            description="Try another class or section."
          />
        </Card>
      ) : (
        <div className="id-card-sheet grid justify-center gap-4 sm:grid-cols-2">
          {data.cards.map((student) => (
            <article
              key={student.id}
              className="id-card relative overflow-hidden rounded-[12px] border border-[var(--product-200)] bg-white text-[#182230] shadow-[var(--shadow-card)]"
            >
              <div className="absolute inset-x-0 top-0 h-[3px] bg-[var(--product-500)]" />
              <header className="flex h-[13mm] items-center gap-2 bg-[var(--product-50)] px-[4mm]">
                {schoolLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={schoolLogoUrl} alt="" className="size-[9mm] object-contain" />
                ) : (
                  <span className="grid size-[9mm] place-items-center rounded-full bg-[var(--product-500)] text-white">
                    <ShieldCheck className="size-4" aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[11px] font-bold uppercase tracking-wide">{schoolName}</h2>
                  <p className="truncate text-[7px] text-[#667085]">{schoolAddress}</p>
                </div>
                <span className="rounded-full bg-[var(--product-500)] px-2 py-1 text-[7px] font-bold uppercase tracking-wider text-white">
                  Student
                </span>
              </header>

              <div className="grid grid-cols-[19mm_1fr] gap-[3mm] px-[4mm] pt-[3mm]">
                <div>
                  {student.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={student.photoUrl}
                      alt=""
                      className="h-[23mm] w-[18mm] rounded-[5px] border border-[#d0d5dd] object-cover"
                    />
                  ) : (
                    <div className="grid h-[23mm] w-[18mm] place-items-center rounded-[5px] border border-dashed border-[#98a2b3] bg-[#f9fafb] text-[7px] text-[#667085]">
                      No photo
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-bold">
                    {student.firstName} {student.lastName}
                  </p>
                  <dl className="mt-1 grid grid-cols-[17mm_1fr] gap-y-[1px] text-[7.5px] leading-[1.25]">
                    <dt className="text-[#667085]">Admission no.</dt>
                    <dd className="truncate font-semibold tnum">{student.admissionNo}</dd>
                    <dt className="text-[#667085]">Class / Section</dt>
                    <dd className="truncate font-semibold">{student.className} / {student.sectionName}</dd>
                    <dt className="text-[#667085]">Roll no.</dt>
                    <dd className="font-semibold tnum">{student.rollNumber ?? '—'}</dd>
                    <dt className="text-[#667085]">Date of birth</dt>
                    <dd className="font-semibold tnum">
                      {student.dateOfBirth ? formatDay(student.dateOfBirth, 'd MMM yyyy') : '—'}
                    </dd>
                    <dt className="text-[#667085]">Blood group</dt>
                    <dd className="font-semibold">{student.bloodGroup ?? '—'}</dd>
                    <dt className="text-[#667085]">Emergency</dt>
                    <dd className="truncate font-semibold tnum">
                      {student.emergencyContactPhone ?? student.guardian?.phone ?? school?.phone ?? '—'}
                    </dd>
                  </dl>
                </div>
              </div>

              <div className="absolute inset-x-[4mm] bottom-[2.5mm] flex justify-end">
                <div className="pb-1 text-right text-[6.5px] text-[#667085]">
                  <p>Valid for {setup.session.name}</p>
                  <p>Until {formatDay(setup.session.endsOn, 'd MMM yyyy')}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <style>{`
        .id-card { width: 85.6mm; height: 54mm; break-inside: avoid; }
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          .id-card-sheet {
            display: grid !important;
            grid-template-columns: 85.6mm 85.6mm !important;
            gap: 5mm !important;
            justify-content: center !important;
          }
          .id-card {
            box-shadow: none !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  )
}
