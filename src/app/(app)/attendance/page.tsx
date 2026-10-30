import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertCircle, CalendarCheck, Layers } from 'lucide-react'
import { requireContext } from '@/server/context'
import { isPortalOnlyRole } from '@/server/scope'
import { markableSections } from '@/server/modules/academics/service'
import { getRegister, unmarkedSections } from '@/server/modules/attendance/service'
import { toDateInput } from '@/lib/dates'
import { formatNumber } from '@/lib/utils'
import {
  ColorBanner,
  ColorTile,
  colorBannerSecondaryBtn,
} from '@/components/dashboard/color-tiles'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { SectionPicker } from './section-picker'
import { AttendanceRegister } from './register'
import { PendingSections } from './pending-sections'

export const metadata = { title: 'Student attendance' }

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ sectionId?: string; onDate?: string }>
}) {
  const ctx = await requireContext('attendance.view')
  if (isPortalOnlyRole(ctx.user.roleKeys)) {
    redirect('/attendance/reports')
  }
  const params = await searchParams

  const today = toDateInput(new Date())
  const onDate = params.onDate ?? today
  const sections = await markableSections(ctx)
  const sectionId = params.sectionId ?? sections[0]?.id

  const showPending = (ctx.can('attendance.report') || ctx.can('attendance.mark')) && sections.length > 0
  const pending = showPending ? await unmarkedSections(ctx, onDate) : []

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="attendance"
        eyebrow="Attendance"
        title={onDate === today ? "Todayâ€™s register" : `Register for ${onDate}`}
        description={
          sections.length > 0
            ? `${formatNumber(sections.length)} sections you can mark`
            : 'Mark presence for the sections assigned to you.'
        }
        actions={
          <>
            {sections.length > 0 ? (
              <Link href="/attendance/ptm-sheet" className={colorBannerSecondaryBtn()}>
                PTM signature sheet
              </Link>
            ) : null}
            {ctx.can('attendance.report') ? (
              <Link href="/attendance/reports" className={colorBannerSecondaryBtn()}>
                Reports
              </Link>
            ) : null}
          </>
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
          {showPending ? (
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

          {showPending ? (
            <PendingSections pending={pending} onDate={onDate} canMark={ctx.can('attendance.mark')} />
          ) : null}
        </div>
      )}
    </div>
  )
}
