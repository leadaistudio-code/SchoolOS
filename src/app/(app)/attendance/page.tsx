import Link from 'next/link'
import { requireContext } from '@/server/context'
import { markableSections } from '@/server/modules/academics/service'
import { getRegister, unmarkedSections } from '@/server/modules/attendance/service'
import { toDateInput } from '@/lib/dates'
import { PageBanner } from '@/components/page-banner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { buttonVariants } from '@/components/ui/button-variants'
import { SectionPicker } from './section-picker'
import { AttendanceRegister } from './register'

export const metadata = { title: 'Student attendance' }

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ sectionId?: string; onDate?: string }>
}) {
  const ctx = await requireContext('attendance.view')
  const params = await searchParams

  const today = toDateInput(new Date())
  const onDate = params.onDate ?? today
  const sections = await markableSections(ctx)
  const sectionId = params.sectionId ?? sections[0]?.id

  return (
    <div className="space-y-4">
      <PageBanner
        title="Student attendance"
        description={onDate === today ? 'Today’s register' : `Register for ${onDate}`}
        tone="attendance"
        actions={
          ctx.can('attendance.report') ? (
            <Link
              href="/attendance/reports"
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Reports
            </Link>
          ) : null
        }
      />

      {sections.length === 0 ? (
        <Card variant="elevated">
          <EmptyState
            title="No sections assigned to you"
            description="You can mark attendance for sections where you are the class teacher or teach a subject."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
          <Card variant="elevated" className="overflow-hidden">
            <SectionPicker
              sections={sections}
              sectionId={sectionId}
              onDate={onDate}
              maxDate={today}
            />
            {sectionId ? (
              <AttendanceRegister register={await getRegister(ctx, sectionId, onDate)} />
            ) : (
              <EmptyState title="Choose a section" description="Pick a class section to begin." />
            )}
          </Card>

          {ctx.can('attendance.report') ? <PendingSections onDate={onDate} /> : null}
        </div>
      )}
    </div>
  )
}

/** Which sections still have nobody marked today — the reason a register gets chased. */
async function PendingSections({ onDate }: { onDate: string }) {
  const ctx = await requireContext('attendance.view')
  const pending = await unmarkedSections(ctx, onDate)

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>Not yet marked</CardTitle>
      </CardHeader>
      <CardContent className="py-1">
        {pending.length === 0 ? (
          <EmptyState title="Every section is marked" description="Nothing outstanding for this date." />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {pending.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <Link
                  href={`/attendance?sectionId=${s.id}&onDate=${onDate}`}
                  className="text-sm text-ink hover:text-[var(--brand-600)]"
                >
                  {s.label}
                </Link>
                <span className="text-xs tnum text-ink-subtle">
                  <span className={s.marked === 0 ? 'text-[var(--danger)] font-medium' : 'text-warning font-medium'}>
                    {s.marked}
                  </span>
                  /{s.enrolled}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
