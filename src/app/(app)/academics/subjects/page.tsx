import Link from 'next/link'
import { BookMarked, Link2, NotebookPen } from 'lucide-react'
import { requireContext } from '@/server/context'
import {
  getClassTree,
  listClassSubjects,
  listSubjects,
} from '@/server/modules/academics/service'
import { teacherOptions } from '@/server/modules/people/service'
import { ColorBanner, ColorTile } from '@/components/dashboard/color-tiles'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { AssignSubjectButton, EditAssignmentButton, EditSubjectButton, MapSubjectToClassesButton, NewSubjectButton } from './subject-forms'
import { formatNumber } from '@/lib/utils'

export const metadata = { title: 'Subjects' }

/**
 * Subjects, and where each one is taught.
 *
 * Two tables rather than one, because they answer different questions. The
 * catalogue is what the school teaches at all; the assignments below it are
 * what a particular class studies, and that pairing — not the subject on its
 * own — is what a syllabus, a timetable slot and a lesson log attach to.
 */
export default async function SubjectsPage() {
  const ctx = await requireContext('academics.view')
  const canManage = ctx.can('academics.manage')

  const [subjects, assignments, classes, teachers] = await Promise.all([
    listSubjects(ctx),
    listClassSubjects(ctx),
    canManage ? getClassTree(ctx) : Promise.resolve([]),
    canManage ? teacherOptions(ctx) : Promise.resolve([]),
  ])

  const classOptions = classes.map((c) => ({ id: c.id, label: c.name }))
  const subjectOptions = subjects.map((s) => ({ id: s.id, label: `${s.name} (${s.code})` }))
  const teacherOpts = teachers.map((t) => ({
    id: t.id,
    label: `${t.firstName} ${t.lastName} — ${t.employeeCode}`,
  }))
  const assignedPairs = assignments.map((a) => ({
    subjectId: a.subject.id,
    classLevelId: a.classLevel.id,
  }))
  const classesBySubject = new Map<string, string[]>()
  for (const a of assignments) {
    const list = classesBySubject.get(a.subject.id) ?? []
    list.push(a.classLevel.name)
    classesBySubject.set(a.subject.id, list)
  }
  const electives = subjects.filter((s) => s.isElective).length

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="students"
        eyebrow="Subjects"
        title={
          subjects.length > 0
            ? `${formatNumber(subjects.length)} subjects · ${formatNumber(assignments.length)} class pairings`
            : 'Subjects catalogue'
        }
        description="What the school teaches, and where each subject is assigned."
        actions={
          canManage ? (
            <>
              <AssignSubjectButton
                classes={classOptions}
                subjects={subjectOptions}
                teachers={teacherOpts}
                assignedPairs={assignedPairs}
              />
              <NewSubjectButton classes={classOptions} teachers={teacherOpts} />
            </>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ColorTile
          label="Catalogue"
          value={formatNumber(subjects.length)}
          sub="Subjects the school teaches"
          tone="students"
          icon={<NotebookPen className="size-5" aria-hidden />}
          delayMs={40}
        />
        <ColorTile
          label="Class pairings"
          value={formatNumber(assignments.length)}
          sub="Taught in a class"
          tone="admissions"
          icon={<Link2 className="size-5" aria-hidden />}
          delayMs={80}
        />
        <ColorTile
          label="Electives"
          value={formatNumber(electives)}
          sub="Optional subjects"
          tone="pending"
          icon={<BookMarked className="size-5" aria-hidden />}
          delayMs={120}
        />
      </div>

      <Card variant="elevated" className="overflow-hidden">
        <CardHeader>
          <CardTitle>Catalogue</CardTitle>
          <span className="text-xs text-ink-subtle">Every subject the school teaches</span>
        </CardHeader>
        {subjects.length === 0 ? (
          <EmptyState
            title="No subjects"
            description={
              canManage
                ? 'Add the subjects this school teaches, then attach each one to the classes that study it.'
                : 'An administrator has not added any subjects yet.'
            }
            action={canManage ? <NewSubjectButton label="Add the first subject" classes={classOptions} teachers={teacherOpts} /> : undefined}
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Code</TH>
                  <TH>Subject</TH>
                  <TH>Type</TH>
                  <TH>Classes mapped</TH>
                  {canManage ? <TH align="right"> </TH> : null}
                </tr>
              </THead>
              <TBody>
                {subjects.map((s) => (
                  <TR key={s.id}>
                    <TD className="text-sm text-ink-muted tnum">{s.code}</TD>
                    <TD className="text-sm text-ink">{s.name}</TD>
                    <TD>
                      <Badge tone={s.isElective ? 'info' : 'neutral'}>
                        {s.isElective ? 'elective' : 'core'}
                      </Badge>
                    </TD>
                    <TD className="text-sm text-ink-muted">
                      {(classesBySubject.get(s.id) ?? []).length === 0 ? (
                        <span className="text-ink-subtle">Not mapped</span>
                      ) : (
                        (classesBySubject.get(s.id) ?? []).join(', ')
                      )}
                    </TD>
                    {canManage ? (
                      <TD align="right">
                        <div className="flex justify-end gap-1">
                          <MapSubjectToClassesButton
                            subjectId={s.id}
                            subjectLabel={s.name}
                            classes={classOptions}
                            teachers={teacherOpts}
                            assignedPairs={assignedPairs}
                            mappedClassNames={classesBySubject.get(s.id) ?? []}
                          />
                          <EditSubjectButton
                            id={s.id}
                            code={s.code}
                            name={s.name}
                            isElective={s.isElective}
                            classCount={s._count.classes}
                          />
                        </div>
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <Card variant="elevated" className="overflow-hidden">
        <CardHeader>
          <CardTitle>Taught in</CardTitle>
          <span className="text-xs text-ink-subtle">
            What each class studies, and who teaches it
          </span>
        </CardHeader>
        {assignments.length === 0 ? (
          <EmptyState
            title="No subjects assigned to a class yet"
            description={
              canManage
                ? 'Until a subject is attached to a class there is nothing for a syllabus, a timetable slot or a lesson log to hang off.'
                : 'An administrator has not attached any subjects to classes yet.'
            }
            action={
              canManage ? (
                <AssignSubjectButton
                  classes={classOptions}
                  subjects={subjectOptions}
                  teachers={teacherOpts}
                  assignedPairs={assignedPairs}
                  variant="primary"
                  label="Map the first subject"
                />
              ) : undefined
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Class</TH>
                  <TH>Subject</TH>
                  <TH>Teacher</TH>
                  <TH>Syllabus</TH>
                  <TH align="right">Periods a week</TH>
                  {canManage ? <TH align="right"> </TH> : null}
                </tr>
              </THead>
              <TBody>
                {assignments.map((a) => (
                  <TR key={a.id}>
                    <TD className="text-sm text-ink">{a.classLevel.name}</TD>
                    <TD className="text-sm text-ink">
                      {a.subject.name}
                      <span className="ml-1.5 text-xs tnum text-ink-subtle">{a.subject.code}</span>
                    </TD>
                    <TD className="text-sm text-ink-muted">
                      {a.teacher ? (
                        `${a.teacher.firstName} ${a.teacher.lastName}`
                      ) : (
                        <span className="text-warning">Not assigned</span>
                      )}
                    </TD>
                    <TD>
                      {a._count.curricula > 0 ? (
                        <Link
                          href="/academics/curriculum"
                          className="text-sm font-medium text-brand-600 hover:underline"
                        >
                          Started
                        </Link>
                      ) : (
                        <span className="text-sm text-ink-subtle">Not started</span>
                      )}
                    </TD>
                    <TD align="right" className="text-sm tnum">
                      {a._count.timetable}
                    </TD>
                    {canManage ? (
                      <TD align="right">
                        <EditAssignmentButton
                          id={a.id}
                          classLabel={a.classLevel.name}
                          subjectLabel={a.subject.name}
                          teacherId={a.teacher?.id ?? null}
                          teachers={teacherOpts}
                          hasSyllabusOrTimetable={a._count.curricula > 0 || a._count.timetable > 0}
                        />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
