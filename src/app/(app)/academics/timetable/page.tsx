import { requireContext } from '@/server/context'
import { getClassTree } from '@/server/modules/academics/service'
import { sectionTimetable, teacherTimetable } from '@/server/modules/timetable/service'
import { teacherOptions } from '@/server/modules/people/service'
import { PageHeader } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Badge } from '@/components/ui/badge'
import { TimetableGrid } from './timetable-grid'
import { TimetablePicker } from './picker'

export const metadata = { title: 'Timetable' }

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ sectionId?: string; staffId?: string }>
}) {
  const ctx = await requireContext('timetable.view')
  const params = await searchParams

  const [classes, teachers] = await Promise.all([getClassTree(ctx), teacherOptions(ctx)])
  const sections = classes.flatMap((c) =>
    c.sections.map((s) => ({ id: s.id, label: `${c.name} · Section ${s.name}` })),
  )

  const isTeacherView = !!params.staffId
  const sectionId = params.sectionId ?? sections[0]?.id
  const canManage = ctx.can('timetable.manage')

  if (sections.length === 0) {
    return (
      <div>
        <PageHeader title="Timetable" />
        <Card>
          <EmptyState
            title="No sections yet"
            description="Create classes and sections before building a timetable."
          />
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Timetable"
        description={
          isTeacherView
            ? 'A teacher week: where they are, period by period.'
            : 'The weekly grid for one class section.'
        }
      />

      <Card className="overflow-hidden">
        <TimetablePicker
          sections={sections}
          teachers={teachers.map((t) => ({ id: t.id, label: `${t.firstName} ${t.lastName}` }))}
          sectionId={sectionId}
          staffId={params.staffId}
        />

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
        <span className="text-[13.5px] text-ink">
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
