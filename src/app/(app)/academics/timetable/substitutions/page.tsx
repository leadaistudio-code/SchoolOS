import { CalendarClock, CheckCircle2, CircleAlert, UserMinus } from 'lucide-react'
import { requireContext } from '@/server/context'
import {
  coverBoardWithSuggestions,
  coverFairness,
  myCoverDuties,
} from '@/server/modules/substitutions/service'
import { teacherOptions } from '@/server/modules/people/service'
import { ColorBanner, ColorTile } from '@/components/dashboard/color-tiles'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Badge } from '@/components/ui/badge'
import { formatDay } from '@/lib/dates'
import { istClock, shortDayLabel } from '@/lib/ist-clock'
import { AwayTeacherCard, BoardToolbar, DatePicker, NoAbsences } from './cover-board'

export const metadata = { title: 'Substitutions' }

export default async function SubstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const ctx = await requireContext('timetable.view')
  const { date } = await searchParams
  const today = istClock().iso
  const iso = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today

  if (!ctx.can('timetable.substitute')) return <MyDuties iso={iso} />

  const [board, fairness, teachers] = await Promise.all([
    coverBoardWithSuggestions(ctx, iso),
    coverFairness(ctx, `${iso.slice(0, 7)}-01`, iso),
    teacherOptions(ctx),
  ])
  const { totals } = board

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="leave"
        eyebrow="Timetable · Substitutions"
        title={
          board.teachers.length === 0
            ? `No cover needed · ${shortDayLabel(iso)}`
            : `${board.teachers.length} teacher${board.teachers.length === 1 ? '' : 's'} away · ${shortDayLabel(iso)}`
        }
        description="Teachers on approved leave or marked absent appear here on their own. Suggestions favour free teachers of the same subject with the least cover this week."
        actions={<DatePicker iso={iso} />}
      />

      <div className="grid gap-3 sm:grid-cols-3 print:hidden">
        <ColorTile label="Lessons to cover" value={String(totals.lessons)} sub={`${board.teachers.length} teachers away`} tone="leave" icon={<UserMinus className="size-5" aria-hidden />} />
        <ColorTile label="Arranged" value={String(totals.arranged)} sub={totals.noCoverNeeded ? `${totals.noCoverNeeded} need no cover` : 'Teacher told on WhatsApp'} tone="attendance" icon={<CheckCircle2 className="size-5" aria-hidden />} />
        <ColorTile label="Still open" value={String(totals.open)} sub={totals.open ? 'Assign or auto-assign' : 'All covered'} tone={totals.open ? 'overdue' : 'attendance'} icon={<CircleAlert className="size-5" aria-hidden />} />
      </div>

      <Card variant="elevated">
        <CardContent className="space-y-4 pt-4">
          <BoardToolbar
            iso={iso}
            open={totals.open}
            teachers={teachers.map((t) => ({ id: t.id, name: `${t.firstName} ${t.lastName}` }))}
            awayIds={board.teachers.map((t) => t.id)}
          />
          <h2 className="hidden print:block text-lg font-semibold">Cover sheet · {formatDay(new Date(`${iso}T00:00:00Z`), 'EEEE d MMM yyyy')}</h2>
          {board.teachers.length === 0 ? (
            <NoAbsences iso={iso} />
          ) : (
            <div className="grid gap-3 xl:grid-cols-2 print:grid-cols-1">
              {board.teachers.map((t) => (
                <AwayTeacherCard key={t.id} iso={iso} teacher={t} suggestions={board.suggestions} freeTeachers={board.freeTeachers} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card variant="elevated" className="print:hidden">
        <CardHeader>
          <CardTitle>Cover this month</CardTitle>
        </CardHeader>
        <CardContent>
          {fairness.every((f) => f.covered === 0 && f.missed === 0) ? (
            <p className="text-sm text-ink-subtle">No cover recorded yet this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-subtle">
                    <th className="py-1.5 font-medium">Teacher</th>
                    <th className="py-1.5 text-right font-medium">Periods covered</th>
                    <th className="py-1.5 text-right font-medium">Periods away</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {fairness
                    .filter((f) => f.covered > 0 || f.missed > 0)
                    .map((f) => (
                      <tr key={f.id}>
                        <td className="py-1.5 text-ink">{f.name}</td>
                        <td className="py-1.5 text-right tabular-nums">{f.covered}</td>
                        <td className="py-1.5 text-right tabular-nums text-ink-muted">{f.missed}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

async function MyDuties({ iso }: { iso: string }) {
  const ctx = await requireContext('timetable.view')
  const duties = await myCoverDuties(ctx, iso)
  return (
    <div className="space-y-4">
      <ColorBanner
        tone="leave"
        eyebrow="Timetable"
        title={duties.length ? `${duties.length} cover dut${duties.length === 1 ? 'y' : 'ies'} coming up` : 'No cover duties'}
        description="Lessons you have been asked to take for a colleague over the next two weeks."
      />
      <Card variant="elevated">
        <CardContent className="pt-4">
          {duties.length === 0 ? (
            <EmptyState title="Nothing assigned" description="When the coordinator asks you to cover a lesson it appears here and on WhatsApp." />
          ) : (
            <ul className="divide-y divide-line">
              {duties.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <CalendarClock className="size-4 text-ink-subtle" aria-hidden />
                  <span className="w-28 text-sm font-medium text-ink">{formatDay(d.onDate, 'EEE d MMM')}</span>
                  <span className="text-sm text-ink">
                    {d.period.name} · {d.period.startTime}–{d.period.endTime}
                  </span>
                  <Badge tone="brand">
                    {d.section.classLevel.name} {d.section.name}
                  </Badge>
                  <span className="text-sm text-ink-muted">{d.classSubject?.subject.name ?? 'Lesson'}</span>
                  <span className="ml-auto text-xs text-ink-subtle">
                    for {d.absentTeacher.firstName} {d.absentTeacher.lastName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
