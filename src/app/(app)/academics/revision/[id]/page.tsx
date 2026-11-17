import { redirect } from 'next/navigation'
import { requireContext } from '@/server/context'
import { getPlan, revisionEditorOptions } from '@/server/modules/revision/service'
import { formatDay, toDateInput } from '@/lib/dates'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import {
  AddRevisionSlotButton,
  DeleteRevisionPlanButton,
  DeleteRevisionSlotButton,
  EditPlanLink,
  EditRevisionSlotButton,
  RevisionPublishToggle,
  type RevisionSlotDraft,
} from './revision-detail-forms'

export const metadata = { title: 'Revision plan' }

const VIEW_PERMS = ['exams.view', 'calendar.view', 'academics.view'] as const

function slotWhen(slot: RevisionSlotDraft) {
  if (slot.startTime && slot.endTime) return `${slot.startTime}–${slot.endTime}`
  if (slot.startTime) return slot.startTime
  if (slot.periodLabel) return slot.periodLabel
  return '—'
}

export default async function RevisionPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireContext()
  if (!ctx.canAny(...VIEW_PERMS) && !ctx.can('exams.manage')) redirect('/403')

  const canManage = ctx.can('exams.manage')
  const plan = await getPlan(ctx, id)
  const editor = canManage && !plan.publishedAt ? await revisionEditorOptions(ctx) : null

  const planStarts = toDateInput(plan.startsOn)
  const planEnds = toDateInput(plan.endsOn)
  const defaultClassId = plan.classLevel?.id ?? editor?.classes[0]?.id ?? ''

  const slots: RevisionSlotDraft[] = plan.slots.map((s) => ({
    id: s.id,
    date: toDateInput(s.date),
    startTime: s.startTime,
    endTime: s.endTime,
    periodLabel: s.periodLabel,
    classLevelId: s.classLevelId,
    sectionId: s.sectionId,
    subjectId: s.subjectId,
    topic: s.topic,
    teacherStaffId: s.teacherStaffId,
    room: s.room,
    notes: s.notes,
  }))

  const isDraft = !plan.publishedAt

  return (
    <div className="space-y-4">
      <PageHeader
        title={plan.name}
        description={`${plan.classLevel?.name ?? 'All classes'} · ${formatDay(plan.startsOn, 'd MMMM yyyy')} – ${formatDay(
          plan.endsOn,
          'd MMMM yyyy',
        )}`}
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              {isDraft ? (
                <>
                  <EditPlanLink id={plan.id} />
                  <RevisionPublishToggle id={plan.id} isPublished={false} />
                  <DeleteRevisionPlanButton id={plan.id} name={plan.name} />
                </>
              ) : (
                <>
                  <RevisionPublishToggle id={plan.id} isPublished />
                </>
              )}
            </div>
          ) : null
        }
      />

      {plan.notes ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Notes</CardTitle>
              {isDraft ? <Badge tone="neutral">Draft</Badge> : <Badge tone="success">Published</Badge>}
            </div>
          </CardHeader>
          <CardContent className="py-1">
            <p className="text-base text-ink whitespace-pre-wrap">{plan.notes}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-2">
          {isDraft ? <Badge tone="neutral">Draft</Badge> : <Badge tone="success">Published</Badge>}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Revision slots</CardTitle>
              <p className="text-sm text-ink-muted mt-0.5">{plan.slots.length} scheduled sessions</p>
            </div>
            {canManage && isDraft && editor ? (
              <AddRevisionSlotButton
                planId={plan.id}
                classes={editor.classes}
                staff={editor.staff}
                defaultClassId={defaultClassId}
                planStarts={planStarts}
                planEnds={planEnds}
              />
            ) : null}
          </div>
        </CardHeader>
        {plan.slots.length === 0 ? (
          <EmptyState
            title="No slots yet"
            description={
              canManage && isDraft
                ? 'Add topics, subjects and times for each revision day.'
                : 'Slots will appear here once the school adds them.'
            }
            action={
              canManage && isDraft && editor ? (
                <AddRevisionSlotButton
                  planId={plan.id}
                  classes={editor.classes}
                  staff={editor.staff}
                  defaultClassId={defaultClassId}
                  planStarts={planStarts}
                  planEnds={planEnds}
                />
              ) : undefined
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>When</TH>
                  <TH>Class</TH>
                  <TH>Subject & topic</TH>
                  <TH>Teacher</TH>
                  <TH>Room</TH>
                  {canManage && isDraft ? <TH className="w-0" /> : null}
                </TR>
              </THead>
              <TBody>
                {plan.slots.map((s) => (
                  <TR key={s.id}>
                    <TD className="text-sm tnum whitespace-nowrap">{formatDay(s.date, 'EEE d MMM')}</TD>
                    <TD className="text-sm">{slotWhen(slots.find((x) => x.id === s.id)!)}</TD>
                    <TD className="text-sm">
                      {s.classLevel.name}
                      {s.section ? ` ${s.section.name}` : ''}
                    </TD>
                    <TD>
                      <p className="text-sm font-medium text-ink">{s.topic}</p>
                      <p className="text-xs text-ink-subtle">{s.subject.name}</p>
                    </TD>
                    <TD className="text-sm">
                      {s.teacher ? `${s.teacher.firstName} ${s.teacher.lastName}`.trim() : '—'}
                    </TD>
                    <TD className="text-sm">{s.room ?? '—'}</TD>
                    {canManage && isDraft && editor ? (
                      <TD>
                        <div className="flex items-center gap-0.5 justify-end">
                          <EditRevisionSlotButton
                            planId={plan.id}
                            slot={slots.find((x) => x.id === s.id)!}
                            classes={editor.classes}
                            staff={editor.staff}
                            defaultClassId={defaultClassId}
                            planStarts={planStarts}
                            planEnds={planEnds}
                          />
                          <DeleteRevisionSlotButton planId={plan.id} slotId={s.id} />
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
    </div>
  )
}