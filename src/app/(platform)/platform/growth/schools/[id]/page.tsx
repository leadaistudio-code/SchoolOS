import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { requirePlatformContext } from '@/server/context'
import { getSchool, listOperators, listTemplates } from '@/server/modules/platform/growth/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { formatMoney } from '@/lib/utils'
import {
  CONTACT_ROLE_LABELS,
  CRM_CHANNEL_LABELS,
  STAGE_LABELS,
  assessCrmRisk,
  computeTemperature,
  daysBetween,
  followUpDisplayStatus,
  formatCrmMeetingSlots,
  hasNextAction,
  minorToRupeesInput,
  weightedPipelineMinor,
  type CrmIntelFacts,
  type CrmMessageChannel,
  type CrmStage,
  type CrmTemperature,
} from '@/lib/growth-crm'
import { ComposeForm } from '../../compose-form'
import {
  ActivityForm,
  ActivityTimeline,
  CompleteFollowUpButton,
  CompleteMeetingButton,
  CompleteTaskButton,
  ContactForm,
  FollowUpForm,
  IntelPanel,
  MeetingForm,
  OpportunityForm,
  QuickFollowUp,
  StageForm,
  TaskForm,
  VisitForm,
} from './panels'

export const metadata = { title: 'School · Growth CRM' }

export default async function GrowthSchoolPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePlatformContext('platform.crm')
  const { id } = await params
  let school
  try {
    school = await getSchool(ctx, id)
  } catch {
    notFound()
  }
  const operators = await listOperators(ctx)

  const canEdit = ctx.user.permissions.has('platform.crm_edit')
  const canAssign = ctx.user.permissions.has('platform.crm_assign')
  const canComms = ctx.user.permissions.has('platform.crm_comms')
  const templates = canComms ? await listTemplates(ctx, { activeOnly: true }) : []
  const primary = school.contacts.find((c) => c.isPrimary) ?? school.contacts[0]
  const opportunity = school.opportunities[0]
  const pendingFollowUps = school.followUps.filter((f) => f.status === 'PENDING')
  const completedFollowUps = school.followUps.filter((f) => f.status === 'COMPLETED').slice(-5)
  const openMeetings = school.meetings.filter((m) => m.status === 'SCHEDULED')
  const openTasks = school.tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS')
  const temp = computeTemperature({
    stage: school.stage,
    lastActivityAt: school.lastActivityAt,
    temperatureManual: school.temperatureManual,
    temperature: school.temperature,
  })
  const nextOk = hasNextAction({ stage: school.stage, nextFollowUpAt: school.nextFollowUpAt })
  const phone = primary?.mobile ?? school.phone
  const digits = phone?.replace(/[^\d]/g, '') ?? ''
  const nextMeeting = school.meetings.find((m) => m.status === 'SCHEDULED' && m.startsAt.getTime() >= Date.now())
  const meetingSlots = formatCrmMeetingSlots(nextMeeting?.startsAt)
  const ownerName = school.owner
    ? `${school.owner.firstName} ${school.owner.lastName}`.trim()
    : ctx.user.firstName
      ? `${ctx.user.firstName} ${ctx.user.lastName}`.trim()
      : ''
  const decisionMaker = school.contacts.find((c) => c.isDecisionMaker)
  const intelFacts: CrmIntelFacts = {
    schoolName: school.name,
    stage: school.stage as CrmStage,
    temperature: school.temperature as CrmTemperature,
    ownerName: school.owner ? `${school.owner.firstName} ${school.owner.lastName}`.trim() : null,
    lastActivityAt: school.lastActivityAt,
    stageChangedAt: school.stageChangedAt,
    nextFollowUpAt: school.nextFollowUpAt,
    nextAction: school.nextAction,
    currentErp: school.currentErp,
    competitor: school.competitor,
    primaryObjection: school.primaryObjection,
    dealValueMinor: school.dealValueMinor,
    probability: school.probability,
    decisionMakerName: decisionMaker?.fullName ?? null,
    primaryContactName: primary?.fullName ?? null,
    overdueFollowUpCount: pendingFollowUps.filter((f) => f.dueAt.getTime() < Date.now()).length,
    openTaskCount: openTasks.length,
    upcomingMeetingAt: nextMeeting?.startsAt ?? null,
    upcomingMeetingType: nextMeeting?.meetingType ?? null,
    lastVisitAt: school.visits[0]?.visitedAt ?? null,
    notes: school.notes,
    recentActivities: school.activities.slice(0, 20).map((a) => ({
      type: a.type,
      summary: a.summary,
      createdAt: a.createdAt,
    })),
  }
  const risk = assessCrmRisk(intelFacts)

  return (
    <div className="space-y-4">
      <PageHeader
        title={school.name}
        description={[
          school.city,
          school.owner ? `${school.owner.firstName} ${school.owner.lastName}` : 'Unassigned',
          school.nextAction ?? (nextOk ? null : 'No next action'),
        ]
          .filter(Boolean)
          .join(' · ')}
        breadcrumbs={[
          { label: 'Growth CRM', href: '/platform/growth' },
          { label: 'Schools', href: '/platform/growth/schools' },
          { label: school.name },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={school.stage === 'WON' ? 'success' : school.stage === 'LOST' ? 'danger' : 'brand'}>
          {STAGE_LABELS[school.stage as CrmStage]}
        </Badge>
        <Badge tone={temp.temperature === 'HOT' ? 'danger' : temp.temperature === 'WARM' ? 'warning' : 'neutral'}>
          {temp.temperature.toLowerCase()}
        </Badge>
        <Badge tone={risk.level === 'HIGH' ? 'danger' : risk.level === 'MEDIUM' ? 'warning' : 'success'}>
          Risk {risk.level.toLowerCase()}
        </Badge>
        {!nextOk ? <Badge tone="warning">No next action</Badge> : null}
        {school.lastActivityAt && daysBetween(school.lastActivityAt) >= 7 ? (
          <Badge tone="danger">No interaction for {daysBetween(school.lastActivityAt)} days</Badge>
        ) : null}
      </div>

      {phone ? (
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${phone}`} className="rounded-[var(--radius-sm)] border border-line px-3 py-2 text-sm font-medium text-ink">
            Call
          </a>
          {digits ? (
            <a
              href={`https://wa.me/${digits}`}
              className="rounded-[var(--radius-sm)] border border-line px-3 py-2 text-sm font-medium text-ink"
            >
              WhatsApp
            </a>
          ) : null}
          {school.address || school.city ? (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent([school.address, school.city, school.state].filter(Boolean).join(', '))}`}
              className="rounded-[var(--radius-sm)] border border-line px-3 py-2 text-sm font-medium text-ink"
            >
              Directions
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              <Fact label="Type" value={school.schoolType?.replaceAll('_', ' ') ?? '—'} />
              <Fact label="Board" value={school.board ?? '—'} />
              <Fact label="Students" value={school.studentCount?.toLocaleString('en-IN') ?? '—'} />
              <Fact label="Phone" value={school.phone ?? '—'} />
              <Fact label="Website" value={school.website ?? '—'} />
              <Fact label="Current ERP" value={school.currentErp ?? '—'} />
              <Fact label="Lead source" value={school.leadSource?.replaceAll('_', ' ') ?? '—'} />
              <Fact label="Campaign" value={school.campaign ?? '—'} />
              <Fact
                label="Deal"
                value={
                  school.dealValueMinor
                    ? `${formatMoney(school.dealValueMinor)} · ${school.probability}% · ${formatMoney(weightedPipelineMinor(school.dealValueMinor, school.probability))} weighted`
                    : '—'
                }
              />
              <Fact label="ARR" value={school.arrMinor ? formatMoney(school.arrMinor) : '—'} />
              <Fact label="Objection" value={school.primaryObjection ?? '—'} />
              <Fact label="Competitor" value={school.competitor ?? '—'} />
              {school.address ? <p className="sm:col-span-2 text-ink-muted">{school.address}</p> : null}
              {school.notes ? <p className="sm:col-span-2 text-ink-muted">{school.notes}</p> : null}
              <p className="sm:col-span-2 text-xs text-ink-subtle">{temp.reasons.join(' · ')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {school.contacts.length === 0 ? (
                <p className="text-sm text-ink-muted">No stakeholders yet.</p>
              ) : (
                <ul className="space-y-2">
                  {school.contacts.map((c) => (
                    <li key={c.id} className="rounded-[var(--radius-sm)] border border-line p-3">
                      <p className="text-sm font-medium text-ink">{c.fullName}</p>
                      <p className="text-xs text-ink-subtle">
                        {[
                          c.designation
                            ? CONTACT_ROLE_LABELS[c.designation as keyof typeof CONTACT_ROLE_LABELS] ?? c.designation
                            : null,
                          c.mobile,
                          c.email,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.isPrimary ? <Badge tone="brand">Primary</Badge> : null}
                        {c.isDecisionMaker ? <Badge tone="warning">Decision maker</Badge> : null}
                        {c.isInfluencer ? <Badge>Influencer</Badge> : null}
                      </div>
                      {c.mobile ? (
                        <div className="mt-2 flex gap-3 text-xs">
                          <a href={`tel:${c.mobile}`} className="text-[var(--brand-600)]">
                            Call
                          </a>
                          <a href={`https://wa.me/${c.mobile.replace(/[^\d]/g, '')}`} className="text-[var(--brand-600)]">
                            WhatsApp
                          </a>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit ? <ContactForm schoolId={school.id} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {school.activities.length === 0 ? (
                <EmptyState title="No activity yet" description="Log the first call or visit." />
              ) : (
                <ActivityTimeline activities={school.activities} />
              )}
            </CardContent>
          </Card>

          {school.communications.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {school.communications.map((row) => (
                    <li key={row.id} className="rounded-[var(--radius-sm)] border border-line p-3">
                      <p className="text-sm text-ink">
                        {CRM_CHANNEL_LABELS[row.channel as CrmMessageChannel] ?? row.channel}
                        {row.contact?.fullName ? ` · ${row.contact.fullName}` : ''}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {format(row.createdAt, 'd MMM, HH:mm')} · {row.to} · {row.status.toLowerCase()}
                        {row.template?.name ? ` · ${row.template.name}` : ''}
                      </p>
                      <p className="mt-1 line-clamp-3 text-sm text-ink-muted">{row.body}</p>
                      {row.error ? <p className="mt-1 text-xs text-[var(--danger)]">{row.error}</p> : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Intelligence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {risk.risks.length > 0 ? (
                <ul className="space-y-1">
                  {risk.risks.slice(0, 4).map((item) => (
                    <li key={item.code} className="text-xs text-ink-muted">
                      [{item.severity}] {item.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-muted">No material risks flagged from CRM facts.</p>
              )}
              <IntelPanel schoolId={school.id} />
            </CardContent>
          </Card>
          {canComms ? (
            <Card>
              <CardHeader>
                <CardTitle>Send message</CardTitle>
              </CardHeader>
              <CardContent>
                <ComposeForm
                  schoolId={school.id}
                  schoolName={school.name}
                  schoolPhone={school.phone}
                  schoolEmail={school.email}
                  contacts={school.contacts}
                  templates={templates}
                  ownerName={ownerName}
                  meetingDate={meetingSlots.meetingDate}
                  meetingTime={meetingSlots.meetingTime}
                />
              </CardContent>
            </Card>
          ) : null}
          {canEdit ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Opportunity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <StageForm schoolId={school.id} stage={school.stage} />
                  <OpportunityForm
                    schoolId={school.id}
                    ownerId={school.ownerId ?? ''}
                    dealValue={minorToRupeesInput(school.dealValueMinor)}
                    arr={minorToRupeesInput(school.arrMinor)}
                    probability={school.probability}
                    competitor={school.competitor ?? ''}
                    primaryObjection={school.primaryObjection ?? ''}
                    nextAction={school.nextAction ?? ''}
                    operators={operators}
                    canAssign={canAssign}
                  />
                  {opportunity ? (
                    <p className="text-xs text-ink-subtle">
                      {opportunity.title} · in stage {daysBetween(opportunity.stageChangedAt)} days
                      {school.createdBy
                        ? ` · added by ${school.createdBy.firstName} ${school.createdBy.lastName}`
                        : ''}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Follow-ups</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pendingFollowUps.length === 0 ? (
                    <p className="text-sm text-ink-muted">None pending.</p>
                  ) : (
                    <ul className="space-y-2">
                      {pendingFollowUps.map((f) => (
                        <li key={f.id} className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm text-ink">
                              {format(f.dueAt, 'd MMM, HH:mm')} · {f.type.toLowerCase()}
                            </p>
                            <p className="text-xs text-ink-subtle">
                              {followUpDisplayStatus(f.dueAt, f.status) === 'OVERDUE' ? 'Overdue · ' : ''}
                              {f.note ?? f.contact?.fullName ?? ''}
                            </p>
                          </div>
                          <CompleteFollowUpButton id={f.id} schoolId={school.id} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <QuickFollowUp schoolId={school.id} />
                  <FollowUpForm schoolId={school.id} contacts={school.contacts} />
                  {completedFollowUps.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium text-ink-muted">Completed</p>
                      <ul className="mt-1 space-y-1">
                        {completedFollowUps.map((f) => (
                          <li key={f.id} className="text-xs text-ink-subtle">
                            {format(f.dueAt, 'd MMM')} · {f.type.toLowerCase()}
                            {f.note ? ` · ${f.note}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Meetings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {openMeetings.length === 0 ? (
                    <p className="text-sm text-ink-muted">None scheduled.</p>
                  ) : (
                    <ul className="space-y-2">
                      {openMeetings.map((m) => (
                        <li key={m.id} className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm text-ink">
                              {format(m.startsAt, 'd MMM, HH:mm')} · {m.meetingType}
                            </p>
                            <p className="text-xs text-ink-subtle">
                              {m.mode === 'ONLINE' ? 'Online' : m.location || 'In person'}
                            </p>
                          </div>
                          {canEdit ? <CompleteMeetingButton id={m.id} schoolId={school.id} /> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEdit ? <MeetingForm schoolId={school.id} contacts={school.contacts} /> : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Tasks</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {openTasks.length === 0 ? (
                    <p className="text-sm text-ink-muted">Nothing open.</p>
                  ) : (
                    <ul className="space-y-2">
                      {openTasks.map((t) => (
                        <li key={t.id} className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm text-ink">{t.title}</p>
                            <p className="text-xs text-ink-subtle">
                              {t.dueAt ? format(t.dueAt, 'd MMM') : 'No date'} · {t.priority.toLowerCase()}
                            </p>
                          </div>
                          {canEdit ? <CompleteTaskButton id={t.id} schoolId={school.id} /> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEdit ? (
                    <TaskForm schoolId={school.id} contacts={school.contacts} operators={operators} />
                  ) : null}
                </CardContent>
              </Card>
              {school.visits.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Visits</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {school.visits.map((v) => (
                        <li key={v.id}>
                          <p className="text-sm text-ink">
                            {format(v.visitedAt, 'd MMM yyyy')}
                            {v.meetingType ? ` · ${v.meetingType}` : ''}
                          </p>
                          <p className="text-xs text-ink-subtle">{v.contactsMet || v.summary}</p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}
              <Card>
                <CardHeader>
                  <CardTitle>Log call / note</CardTitle>
                </CardHeader>
                <CardContent>
                  <ActivityForm schoolId={school.id} contacts={school.contacts} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Log school visit</CardTitle>
                </CardHeader>
                <CardContent>
                  <VisitForm schoolId={school.id} />
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-subtle">{label}</p>
      <p className="text-ink">{value}</p>
    </div>
  )
}
