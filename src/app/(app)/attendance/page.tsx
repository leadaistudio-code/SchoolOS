import Link from 'next/link'
import { AlertCircle, CalendarCheck, Layers } from 'lucide-react'
import { requireContext } from '@/server/context'
import { markableSections } from '@/server/modules/academics/service'
import { getRegister, unmarkedSections } from '@/server/modules/attendance/service'
import { toDateInput } from '@/lib/dates'
import { formatNumber } from '@/lib/utils'
import {
  ColorBanner,
  ColorTile,
  colorBannerSecondaryBtn,
} from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
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

  const pending =
    ctx.can('attendance.report') && sections.length > 0
      ? await unmarkedSections(ctx, onDate)
      : []

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="attendance"
        eyebrow="Attendance"
        title={onDate === today ? "Today’s register" : `Register for ${onDate}`}
        description={
          sections.length > 0
            ? `${formatNumber(sections.length)} sections you can mark`
            : 'Mark presence for the sections assigned to you.'
        }
        actions={
          ctx.can('attendance.report') ? (
            <Link href="/attendance/reports" className={colorBannerSecondaryBtn()}>
              Reports
            </Link>
          ) : null
        }
      />

      {sections.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ColorTile
            label="Your sections"
            value={formatNumber(sections.length)}
            sub="Classes you can mark"
            tone="attendance"
            href="#register"
            icon={<Layers className="size-5" aria-hidden />}
            delayMs={40}
          />
          {ctx.can('attendance.report') ? (
            <ColorTile
              label="Not yet marked"
              value={formatNumber(pending.length)}
              sub={onDate === today ? 'Outstanding today' : `Outstanding for ${onDate}`}
              tone={pending.length > 0 ? 'overdue' : 'pending'}
              href="#pending-sections"
              icon={<AlertCircle className="size-5" aria-hidden />}
              delayMs={80}
            />
          ) : null}
          <ColorTile
            label="Register date"
            value={onDate === today ? 'Today' : onDate}
            sub="Change date in the picker below"
            tone="students"
            href="#register"
            icon={<CalendarCheck className="size-5" aria-hidden />}
            delayMs={120}
          />
        </div>
      ) : null}

      {sections.length === 0 ? (
        <Card variant="elevated">
          <EmptyState
            title="No sections assigned to you"
            description="You can mark attendance for sections where you are the class teacher or teach a subject."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
          <Card id="register" variant="elevated" className="scroll-mt-20 overflow-hidden">
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

          {ctx.can('attendance.report') ? (
            <PendingSectionsList pending={pending} onDate={onDate} />
          ) : null}
        </div>
      )}
    </div>
  )
}

/** Which sections still have nobody marked today — the reason a register gets chased. */
function PendingSectionsList({
  pending,
  onDate,
}: {
  pending: Awaited<ReturnType<typeof unmarkedSections>>
  onDate: string
}) {
  return (
    <Card id="pending-sections" variant="elevated" className="scroll-mt-20">
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
                  <span
                    className={
                      s.marked === 0
                        ? 'text-[var(--danger)] font-medium'
                        : 'text-warning font-medium'
                    }
                  >
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
