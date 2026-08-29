import Link from 'next/link'
import { requireContext } from '@/server/context'
import { getClassTree } from '@/server/modules/academics/service'
import { listPeriods, sectionTimetable, teacherTimetable } from '@/server/modules/timetable/service'
import { teacherOptions } from '@/server/modules/people/service'
import { ColorBanner } from '@/components/dashboard/color-tiles'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { TimetableGrid } from './timetable-grid'
import { TimetablePicker } from './picker'
import { NewPeriodButton, PeriodStrip } from './period-form'

export const metadata = { title: 'Timetable' }

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ sectionId?: string; staffId?: string }>
}) {
  const ctx = await requireContext('timetable.view')
  const params = await searchParams

  const canManage = ctx.can('timetable.manage')
  const [classes, teachers, periods] = await Promise.all([
    getClassTree(ctx),
    teacherOptions(ctx),
    listPeriods(ctx),
  ])
  const sections = classes.flatMap((c) =>
    c.sections.map((s) => ({ id: s.id, label: `${c.name} · Section ${s.name}` })),
  )

  const isTeacherView = !!params.staffId
  const sectionId = params.sectionId ?? sections[0]?.id

  if (sections.length === 0) {
    return (
      <div className="space-y-4">
        <ColorBanner
          tone="attendance"
          eyebrow="Timetable"
          title="Timetable"
          description="Add a class and section before building the weekly grid."
        />
        <Card variant="elevated">
          <EmptyState
            title="No sections yet"
            description="A timetable is drawn for one section at a time. Add a class and at least one section under Classes & sections first."
            action={
              <Link href="/academics/classes" className={buttonVariants({ size: 'sm' })}>
                Go to classes
              </Link>
            }
          />
        </Card>
      </div>
    )
  }

  // Periods are the rows. Without them the grid has nothing to draw, so the
  // page becomes a prompt to define the school day rather than an empty table.
  if (periods.length === 0) {
    return (
      <div className="space-y-4">
        <ColorBanner
          tone="attendance"
          eyebrow="Timetable"
          title="Define the school day"
          description="Add periods before building the weekly grid."
          actions={canManage ? <NewPeriodButton periods={[]} variant="primary" /> : null}
        />
        <Card variant="elevated">
          <EmptyState
            title="The school day has no periods yet"
            description={
              canManage
                ? 'Add each period and break in the order they run. Every timetable in the product uses them as its rows.'
                : 'An administrator needs to define the periods of the school day before a timetable can be built.'
            }
            action={
              canManage ? <NewPeriodButton periods={[]} variant="primary" label="Add the first period" /> : undefined
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="attendance"
        eyebrow="Timetable"
        title="Timetable"
        description={
          isTeacherView
            ? 'A teacher week: where they are, period by period.'
            : `The weekly grid for one class section · ${periods.length} periods a day`
        }
        actions={canManage ? <NewPeriodButton periods={periods} /> : null}
      />

      <Card variant="elevated" className="overflow-hidden">
        <TimetablePicker
          sections={sections}
          teachers={teachers.map((t) => ({ id: t.id, label: `${t.firstName} ${t.lastName}` }))}
          sectionId={sectionId}
          staffId={params.staffId}
        />

        <PeriodStrip periods={periods} editable={canManage} />

        {isTeacherView ? (
          <TeacherView staffId={params.staffId!} />
        ) : (
          <ClassView sectionId={sectionId!} canManage={canManage} />
        )}
      </Card>
    </div>
  )
}

async function ClassView({ sectionId, canManage }: { sectionId: string; canManage: boolean }) {
  const ctx = await requireContext('timetable.view')
  const grid = await sectionTimetable(ctx, sectionId)

  // Only subjects belonging to this section's class may go in the grid.
  const classSubjects = await ctx.db.classSubject.findMany({
    where: { classLevel: { sections: { some: { id: sectionId } } } },
    select: {
      id: true,
      subject: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
    orderBy: { subject: { name: 'asc' } },
  })

  return (
    <TimetableGrid
      grid={grid}
      editable={canManage}
      readOnlyReason={canManage ? undefined : 'You have read-only access to the timetable.'}
      subjects={classSubjects.map((cs) => ({
        id: cs.id,
        label: cs.subject.name,
        teacher: cs.teacher ? `${cs.teacher.firstName} ${cs.teacher.lastName}` : null,
      }))}
    />
  )
}

async function TeacherView({ staffId }: { staffId: string }) {
  const ctx = await requireContext('timetable.view')
  const grid = await teacherTimetable(ctx, staffId)

  return (
    <>
      <div className="px-4 py-2.5 border-b border-line flex items-center gap-2">
        <span className="text-sm text-ink">
          {grid.staff.firstName} {grid.staff.lastName}
        </span>
        <Badge tone={grid.periodsPerWeek > 30 ? 'warning' : 'neutral'}>
          {grid.periodsPerWeek} periods a week
        </Badge>
      </div>
      <TimetableGrid
        grid={grid}
        subjects={[]}
        editable={false}
        readOnlyReason="Teacher views are read-only. Edit the class grid to change a lesson."
      />
    </>
  )
}
