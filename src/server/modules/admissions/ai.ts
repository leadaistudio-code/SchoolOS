import { z } from 'zod'
import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound } from '@/server/api/response'
import { assistantConfigured, assistantModel } from '@/server/assistant/providers'
import { zodToJsonSchema } from '@/server/assistant/json-schema'
import { hasFeature } from '@/server/entitlements'
import { FEATURE } from '@/lib/features'
import { STAGE_LABELS, type LeadStage } from '@/lib/admissions'

const nextActionSchema = z.object({
  recommendedStage: z.string().nullish(),
  followUpWithinDays: z.number().int().min(0).max(30),
  channel: z.enum(['CALL', 'SMS', 'EMAIL', 'WHATSAPP', 'VISIT']),
  priority: z.enum(['low', 'medium', 'high']),
  talkingPoints: z.array(z.string()).max(6),
  rationale: z.string(),
})

const draftMessageSchema = z.object({
  channel: z.enum(['CALL', 'SMS', 'EMAIL', 'WHATSAPP']),
  subject: z.string().nullish(),
  body: z.string(),
})

const briefSchema = z.object({
  brief: z.string(),
  risks: z.array(z.string()).max(5),
  openQuestions: z.array(z.string()).max(5),
})

export type NextActionSuggestion = z.infer<typeof nextActionSchema> & {
  source: 'ai' | 'rules'
}

export type DraftFollowUpMessage = z.infer<typeof draftMessageSchema> & {
  source: 'ai' | 'rules'
}

export type LeadBrief = z.infer<typeof briefSchema> & {
  source: 'ai' | 'rules'
}

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

function ruleNextAction(lead: {
  stage: string
  nextFollowUpOn: Date | null
  source: string | null
  updatedAt: Date
}): NextActionSuggestion {
  const overdue =
    lead.nextFollowUpOn && lead.nextFollowUpOn.getTime() < Date.now()
      ? daysSince(lead.nextFollowUpOn)
      : 0
  const idle = daysSince(lead.updatedAt)

  const stageHints: Record<string, { stage: string | null; days: number; channel: NextActionSuggestion['channel']; points: string[] }> = {
    NEW: {
      stage: 'CONTACTED',
      days: 0,
      channel: 'CALL',
      points: ['Confirm the class of interest', 'Offer a campus visit slot', 'Capture a preferred contact window'],
    },
    CONTACTED: {
      stage: 'INTERESTED',
      days: 2,
      channel: 'WHATSAPP',
      points: ['Share fee structure overview', 'Answer open questions from the first call'],
    },
    INTERESTED: {
      stage: 'CAMPUS_VISIT',
      days: 3,
      channel: 'CALL',
      points: ['Book a campus visit', 'Confirm who will attend'],
    },
    CAMPUS_VISIT: {
      stage: 'APPLICATION',
      days: 2,
      channel: 'EMAIL',
      points: ['Send application checklist', 'Offer help with documents'],
    },
    APPLICATION: {
      stage: 'DOCUMENT_VERIFICATION',
      days: 1,
      channel: 'CALL',
      points: ['Confirm missing documents', 'Set a verification appointment'],
    },
    DOCUMENT_VERIFICATION: {
      stage: 'APPROVED',
      days: 1,
      channel: 'CALL',
      points: ['Confirm verification status', 'Explain next enrolment steps'],
    },
    APPROVED: {
      stage: null,
      days: 0,
      channel: 'CALL',
      points: ['Confirm seat acceptance', 'Collect admission fee / documents for enrolment'],
    },
  }

  const hint = stageHints[lead.stage] ?? {
    stage: null,
    days: 3,
    channel: 'CALL' as const,
    points: ['Review the lead history and agree a next step with the family'],
  }

  const priority: NextActionSuggestion['priority'] =
    overdue > 2 || idle > 7 ? 'high' : overdue > 0 || idle > 3 ? 'medium' : 'low'

  return {
    recommendedStage: hint.stage,
    followUpWithinDays: overdue > 0 ? 0 : hint.days,
    channel: hint.channel,
    priority,
    talkingPoints: hint.points,
    rationale:
      overdue > 0
        ? `Follow-up is ${overdue} day(s) overdue — contact today.`
        : idle > 5
          ? `No activity for ${idle} days. Re-engage before the family cools off.`
          : `Standard next step for ${STAGE_LABELS[lead.stage as LeadStage] ?? lead.stage}.`,
    source: 'rules',
  }
}

function ruleDraft(lead: {
  studentName: string
  parentName: string
  stage: string
  source: string | null
}): DraftFollowUpMessage {
  const schoolStep = STAGE_LABELS[lead.stage as LeadStage] ?? lead.stage
  return {
    channel: 'CALL',
    subject: null,
    body: `Hello ${lead.parentName},\n\nThis is regarding the admission enquiry for ${lead.studentName} (currently at ${schoolStep}). We would like to help with the next step and answer any questions about the school, fees and joining process.\n\nPlease let us know a convenient time to speak.\n\nThank you.`,
    source: 'rules',
  }
}

function ruleBrief(lead: {
  studentName: string
  parentName: string
  phone: string
  stage: string
  source: string | null
  notes: string | null
  activities: { type: string; summary: string; createdAt: Date }[]
}): LeadBrief {
  const recent = lead.activities
    .slice(0, 5)
    .map((a) => `• ${a.summary}`)
    .join('\n')
  return {
    brief: `${lead.parentName} enquired about ${lead.studentName} (${lead.stage.replaceAll('_', ' ').toLowerCase()}, source ${lead.source ?? 'unknown'}). Phone ${lead.phone}.${lead.notes ? ` Notes: ${lead.notes}` : ''}\n\nRecent activity:\n${recent || '• No activity yet'}`,
    risks:
      lead.activities.length === 0
        ? ['No contact logged yet — risk of losing the enquiry']
        : [],
    openQuestions: ['Which class and session?', 'Any sibling already enrolled?', 'Decision timeline?'],
    source: 'rules',
  }
}

async function assertAiAllowed(ctx: AppContext) {
  if (!(await hasFeature(ctx.tenant.id, FEATURE.MODULE_AI_ASSIST))) {
    return false
  }
  return assistantConfigured()
}

async function loadLeadForAi(ctx: AppContext, leadId: string) {
  const lead = await ctx.db.admissionLead.findFirst({
    where: { id: leadId, deletedAt: null },
    include: {
      activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      followUps: { where: { doneAt: null }, orderBy: { dueOn: 'asc' }, take: 5 },
    },
  })
  if (!lead) throw notFound('Lead not found')
  return lead
}

export async function suggestNextAction(ctx: AppContext, leadId: string): Promise<NextActionSuggestion> {
  ctx.require('admissions.view')
  const lead = await loadLeadForAi(ctx, leadId)
  const fallback = ruleNextAction(lead)

  if (!(await assertAiAllowed(ctx))) return fallback

  try {
    const model = assistantModel()
    const result = await model.turn({
      system: `You are an admissions counsellor coach for an Indian K-12 school ERP.
Suggest the next best action for a lead. Do not invent contact details.
Prefer phone or WhatsApp for early stages. Never recommend auto-sending messages.
Call emit_next_action exactly once.`,
      turns: [
        {
          role: 'user',
          text: JSON.stringify({
            stage: lead.stage,
            source: lead.source,
            nextFollowUpOn: lead.nextFollowUpOn,
            notes: lead.notes,
            openFollowUps: lead.followUps.map((f) => ({
              dueOn: f.dueOn,
              channel: f.channel,
              note: f.note,
            })),
            recentActivity: lead.activities.slice(0, 8).map((a) => ({
              type: a.type,
              summary: a.summary,
              at: a.createdAt,
            })),
          }),
        },
      ],
      tools: [
        {
          name: 'emit_next_action',
          description: 'Return the next-best-action suggestion.',
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
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'admissions.ai.suggest',
      module: 'admissions',
      entityType: 'AdmissionLead',
      entityId: leadId,
      summary: `AI next-action suggestion for lead`,
    })

    return { ...parsed, source: 'ai' }
  } catch {
    return fallback
  }
}

export async function draftFollowUpMessage(
  ctx: AppContext,
  leadId: string,
  channel?: 'CALL' | 'SMS' | 'EMAIL' | 'WHATSAPP',
): Promise<DraftFollowUpMessage> {
  ctx.require('admissions.manage')
  const lead = await loadLeadForAi(ctx, leadId)
  const fallback = ruleDraft(lead)
  if (channel) fallback.channel = channel

  if (!(await assertAiAllowed(ctx))) return fallback

  try {
    const model = assistantModel()
    const result = await model.turn({
      system: `Draft a short, professional follow-up message a school counsellor will copy and send themselves.
Do not invent fees or promises. Keep WhatsApp/SMS under 400 characters when those channels are chosen.
Call emit_draft_message exactly once.`,
      turns: [
        {
          role: 'user',
          text: JSON.stringify({
            preferredChannel: channel ?? 'CALL',
            studentName: lead.studentName,
            parentName: lead.parentName,
            stage: lead.stage,
            source: lead.source,
            notes: lead.notes,
            schoolName: ctx.tenant.name,
          }),
        },
      ],
      tools: [
        {
          name: 'emit_draft_message',
          description: 'Return a draft message for the counsellor to copy.',
          parameters: zodToJsonSchema(draftMessageSchema),
        },
      ],
      onText: () => {},
    })

    if (result.refused) return fallback
    const call = result.toolCalls.find((c) => c.name === 'emit_draft_message')
    if (!call) return fallback
    const parsed = draftMessageSchema.parse(JSON.parse(call.argumentsJson))

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'admissions.ai.draft',
      module: 'admissions',
      entityType: 'AdmissionLead',
      entityId: leadId,
      summary: `AI draft ${parsed.channel} follow-up`,
    })

    return { ...parsed, source: 'ai' }
  } catch {
    return fallback
  }
}

export async function generateLeadBrief(ctx: AppContext, leadId: string): Promise<LeadBrief> {
  ctx.require('admissions.view')
  const lead = await loadLeadForAi(ctx, leadId)
  const fallback = ruleBrief(lead)

  if (!(await assertAiAllowed(ctx))) return fallback

  try {
    const model = assistantModel()
    const result = await model.turn({
      system: `Summarise an admission lead for a counsellor about to call the family.
Be factual. List risks and open questions. Call emit_lead_brief exactly once.`,
      turns: [
        {
          role: 'user',
          text: JSON.stringify({
            studentName: lead.studentName,
            parentName: lead.parentName,
            phone: lead.phone,
            email: lead.email,
            stage: lead.stage,
            source: lead.source,
            notes: lead.notes,
            activities: lead.activities.slice(0, 12),
            openFollowUps: lead.followUps,
          }),
        },
      ],
      tools: [
        {
          name: 'emit_lead_brief',
          description: 'Return a counsellor briefing.',
          parameters: zodToJsonSchema(briefSchema),
        },
      ],
      onText: () => {},
    })

    if (result.refused) return fallback
    const call = result.toolCalls.find((c) => c.name === 'emit_lead_brief')
    if (!call) return fallback
    const parsed = briefSchema.parse(JSON.parse(call.argumentsJson))

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'admissions.ai.brief',
      module: 'admissions',
      entityType: 'AdmissionLead',
      entityId: leadId,
      summary: 'AI lead brief generated',
    })

    return { ...parsed, source: 'ai' }
  } catch {
    return fallback
  }
}

/** Pure helpers exported for unit tests (no DB / AI). */
export const admissionsAiRules = {
  ruleNextAction,
  ruleDraft,
  ruleBrief,
}
