import { z } from 'zod'
import type { PlatformContext } from '@/server/context'
import { ForbiddenError } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound } from '@/server/api/response'
import { assistantConfigured, assistantModel } from '@/server/assistant/providers'
import { zodToJsonSchema } from '@/server/assistant/json-schema'
import {
  STAGE_LABELS,
  assessCrmRisk,
  buildCrmMeetingBrief,
  recommendCrmNextAction,
  summarizeCrmConversation,
  type CrmConversationSummary,
  type CrmIntelFacts,
  type CrmMeetingBrief,
  type CrmNextActionSuggestion,
  type CrmRiskAssessment,
  type CrmStage,
  type CrmTemperature,
} from '@/lib/growth-crm'

const nextActionSchema = z.object({
  channel: z.enum(['CALL', 'WHATSAPP', 'EMAIL', 'VISIT', 'MEETING']),
  followUpWithinDays: z.number().int().min(0).max(30),
  priority: z.enum(['low', 'medium', 'high']),
  talkingPoints: z.array(z.string()).max(6),
  rationale: z.string(),
  objective: z.string(),
})

const meetingBriefSchema = z.object({
  facts: z.array(z.string()).max(20),
  recommendations: z.array(z.string()).max(8),
  objective: z.string(),
  risks: z.array(z.string()).max(8),
})

const summarySchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()).max(10),
})

const riskSchema = z.object({
  level: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  score: z.number().int().min(0).max(100),
  risks: z
    .array(
      z.object({
        code: z.string(),
        label: z.string(),
        severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      }),
    )
    .max(12),
})

export type IntelSource = 'ai' | 'rules'

function assertCrm(ctx: PlatformContext) {
  if (!ctx.user.permissions.has('platform.crm')) {
    throw new ForbiddenError('Missing permission: platform.crm')
  }
}

function actorLabel(ctx: PlatformContext) {
  return `${ctx.user.firstName} ${ctx.user.lastName}`.trim()
}

async function loadFacts(ctx: PlatformContext, schoolId: string): Promise<CrmIntelFacts> {
  const school = await ctx.db.crmSchool.findFirst({
    where: { id: schoolId, deletedAt: null },
    include: {
      owner: { select: { firstName: true, lastName: true } },
      contacts: { where: { deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }] },
      activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      followUps: { where: { status: 'PENDING' }, select: { dueAt: true } },
      meetings: {
        where: { status: 'SCHEDULED', startsAt: { gte: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 1,
      },
      visits: { orderBy: { visitedAt: 'desc' }, take: 1 },
      tasks: { where: { status: { in: ['TODO', 'IN_PROGRESS'] } }, select: { id: true } },
    },
  })
  if (!school) throw notFound('School')

  const now = new Date()
  const decisionMaker = school.contacts.find((c) => c.isDecisionMaker)
  const primary = school.contacts.find((c) => c.isPrimary) ?? school.contacts[0]
  const upcoming = school.meetings[0]

  return {
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
    overdueFollowUpCount: school.followUps.filter((f) => f.dueAt.getTime() < now.getTime()).length,
    openTaskCount: school.tasks.length,
    upcomingMeetingAt: upcoming?.startsAt ?? null,
    upcomingMeetingType: upcoming?.meetingType ?? null,
    lastVisitAt: school.visits[0]?.visitedAt ?? null,
    notes: school.notes,
    recentActivities: school.activities.map((a) => ({
      type: a.type,
      summary: a.summary,
      createdAt: a.createdAt,
    })),
  }
}

function factsPayload(facts: CrmIntelFacts) {
  return {
    schoolName: facts.schoolName,
    stage: facts.stage,
    stageLabel: STAGE_LABELS[facts.stage],
    temperature: facts.temperature,
    ownerName: facts.ownerName,
    daysSinceActivity: facts.lastActivityAt
      ? Math.floor((Date.now() - facts.lastActivityAt.getTime()) / 86_400_000)
      : null,
    daysInStage: Math.floor((Date.now() - facts.stageChangedAt.getTime()) / 86_400_000),
    nextFollowUpAt: facts.nextFollowUpAt,
    nextAction: facts.nextAction,
    currentErp: facts.currentErp,
    competitor: facts.competitor,
    primaryObjection: facts.primaryObjection,
    dealValueMinor: facts.dealValueMinor,
    probability: facts.probability,
    decisionMakerName: facts.decisionMakerName,
    primaryContactName: facts.primaryContactName,
    overdueFollowUpCount: facts.overdueFollowUpCount,
    openTaskCount: facts.openTaskCount,
    upcomingMeetingAt: facts.upcomingMeetingAt,
    upcomingMeetingType: facts.upcomingMeetingType,
    lastVisitAt: facts.lastVisitAt,
    notes: facts.notes,
    recentActivities: facts.recentActivities.slice(0, 12).map((a) => ({
      type: a.type,
      summary: a.summary,
      at: a.createdAt,
    })),
  }
}

export async function getSchoolRisk(ctx: PlatformContext, schoolId: string): Promise<CrmRiskAssessment & { source: IntelSource }> {
  assertCrm(ctx)
  const facts = await loadFacts(ctx, schoolId)
  return { ...assessCrmRisk(facts), source: 'rules' }
}

export async function suggestSchoolNextAction(
  ctx: PlatformContext,
  schoolId: string,
): Promise<CrmNextActionSuggestion & { source: IntelSource }> {
  assertCrm(ctx)
  const facts = await loadFacts(ctx, schoolId)
  const fallback = { ...recommendCrmNextAction(facts), source: 'rules' as const }

  if (!assistantConfigured()) return fallback

  try {
    const model = assistantModel()
    const result = await model.turn({
      system: `You coach MyCampusView platform sales reps selling school ERP in India.
Suggest the next best action from CRM facts only. Do not invent contacts, fees or commitments.
Never send messages or change stages. Distinguish urgency clearly.
Call emit_next_action exactly once.`,
      turns: [{ role: 'user', text: JSON.stringify(factsPayload(facts)) }],
      tools: [
        {
          name: 'emit_next_action',
          description: 'Return the next-best-action suggestion for the sales rep.',
          parameters: zodToJsonSchema(nextActionSchema),
        },
      ],
      onText: () => {},
    })

    if (result.refused) return fallback
    const call = result.toolCalls.find((c) => c.name === 'emit_next_action')
    if (!call) return fallback
    const parsed = nextActionSchema.parse(JSON.parse(call.argumentsJson))

    await audit({
      tenantId: null,
      actorId: ctx.user.userId,
      actorLabel: actorLabel(ctx),
      action: 'crm.intel.next_action',
      module: 'growth',
      entityType: 'CrmSchool',
      entityId: schoolId,
      summary: `AI next-action for ${facts.schoolName}`,
    })

    return { ...parsed, source: 'ai' }
  } catch {
    return fallback
  }
}

export async function generateMeetingBrief(
  ctx: PlatformContext,
  schoolId: string,
): Promise<CrmMeetingBrief & { source: IntelSource }> {
  assertCrm(ctx)
  const facts = await loadFacts(ctx, schoolId)
  const fallback = { ...buildCrmMeetingBrief(facts), source: 'rules' as const }

  if (!assistantConfigured()) return fallback

  try {
    const model = assistantModel()
    const result = await model.turn({
      system: `Prepare a pre-meeting brief for a MyCampusView sales visit or call with a school.
Use only the CRM facts provided. Separate hard facts from recommendations.
Do not invent ERP vendors, decision makers or deal values.
Call emit_meeting_brief exactly once.`,
      turns: [{ role: 'user', text: JSON.stringify(factsPayload(facts)) }],
      tools: [
        {
          name: 'emit_meeting_brief',
          description: 'Return a meeting brief with facts vs recommendations.',
          parameters: zodToJsonSchema(meetingBriefSchema),
        },
      ],
      onText: () => {},
    })

    if (result.refused) return fallback
    const call = result.toolCalls.find((c) => c.name === 'emit_meeting_brief')
    if (!call) return fallback
    const parsed = meetingBriefSchema.parse(JSON.parse(call.argumentsJson))

    await audit({
      tenantId: null,
      actorId: ctx.user.userId,
      actorLabel: actorLabel(ctx),
      action: 'crm.intel.meeting_brief',
      module: 'growth',
      entityType: 'CrmSchool',
      entityId: schoolId,
      summary: `Meeting brief for ${facts.schoolName}`,
    })

    return { ...parsed, source: 'ai' }
  } catch {
    return fallback
  }
}

export async function summarizeSchoolConversation(
  ctx: PlatformContext,
  schoolId: string,
): Promise<CrmConversationSummary & { source: IntelSource }> {
  assertCrm(ctx)
  const facts = await loadFacts(ctx, schoolId)
  const fallback = { ...summarizeCrmConversation(facts.recentActivities), source: 'rules' as const }

  if (!assistantConfigured()) return fallback

  try {
    const model = assistantModel()
    const result = await model.turn({
      system: `Summarise the CRM conversation trail for an internal sales rep.
Be factual. Do not invent touches that are not in the activity list.
Call emit_conversation_summary exactly once.`,
      turns: [
        {
          role: 'user',
          text: JSON.stringify({
            schoolName: facts.schoolName,
            stage: facts.stage,
            activities: facts.recentActivities.slice(0, 15),
          }),
        },
      ],
      tools: [
        {
          name: 'emit_conversation_summary',
          description: 'Return a short conversation summary and highlights.',
          parameters: zodToJsonSchema(summarySchema),
        },
      ],
      onText: () => {},
    })

    if (result.refused) return fallback
    const call = result.toolCalls.find((c) => c.name === 'emit_conversation_summary')
    if (!call) return fallback
    const parsed = summarySchema.parse(JSON.parse(call.argumentsJson))

    await audit({
      tenantId: null,
      actorId: ctx.user.userId,
      actorLabel: actorLabel(ctx),
      action: 'crm.intel.summary',
      module: 'growth',
      entityType: 'CrmSchool',
      entityId: schoolId,
      summary: `Conversation summary for ${facts.schoolName}`,
    })

    return { ...parsed, source: 'ai' }
  } catch {
    return fallback
  }
}

export async function analyseSchoolRisk(
  ctx: PlatformContext,
  schoolId: string,
): Promise<CrmRiskAssessment & { source: IntelSource }> {
  assertCrm(ctx)
  const facts = await loadFacts(ctx, schoolId)
  const fallback = { ...assessCrmRisk(facts), source: 'rules' as const }

  if (!assistantConfigured()) return fallback

  try {
    const model = assistantModel()
    const result = await model.turn({
      system: `Classify deal risk for a MyCampusView school sales opportunity.
Use only CRM facts. Prefer concrete operational risks (owner, follow-up, staleness, objections).
Call emit_risk_analysis exactly once.`,
      turns: [
        {
          role: 'user',
          text: JSON.stringify({
            facts: factsPayload(facts),
            ruleBaseline: fallback,
          }),
        },
      ],
      tools: [
        {
          name: 'emit_risk_analysis',
          description: 'Return deal risk level and risk items.',
          parameters: zodToJsonSchema(riskSchema),
        },
      ],
      onText: () => {},
    })

    if (result.refused) return fallback
    const call = result.toolCalls.find((c) => c.name === 'emit_risk_analysis')
    if (!call) return fallback
    const parsed = riskSchema.parse(JSON.parse(call.argumentsJson))

    await audit({
      tenantId: null,
      actorId: ctx.user.userId,
      actorLabel: actorLabel(ctx),
      action: 'crm.intel.risk',
      module: 'growth',
      entityType: 'CrmSchool',
      entityId: schoolId,
      summary: `Risk analysis for ${facts.schoolName}: ${parsed.level}`,
    })

    return { ...parsed, source: 'ai' }
  } catch {
    return fallback
  }
}

/** Pure helpers for unit tests (no DB / AI). */
export const growthIntelRules = {
  assessCrmRisk,
  recommendCrmNextAction,
  buildCrmMeetingBrief,
  summarizeCrmConversation,
}
