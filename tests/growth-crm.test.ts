import { describe, expect, it } from 'vitest'
import { PERMISSION_KEYS } from '../src/lib/rbac/permissions'
import { ROLE, SYSTEM_ROLES } from '../src/lib/rbac/roles'
import { tenantDb, TenantIsolationError } from '../src/server/db/tenant-client'
import {
  assessCrmRisk,
  buildCrmMeetingBrief,
  computeTemperature,
  crmMessageVars,
  followUpDisplayStatus,
  hasNextAction,
  isFollowUpOverdue,
  isFollowUpSoon,
  isMeetingImminent,
  pickCrmDestination,
  recommendCrmNextAction,
  rupeesToMinor,
  summarizeCrmConversation,
  websiteDomain,
  weightedPipelineMinor,
  CRM_TEMPLATE_CATEGORIES,
  DEFAULT_CRM_TEMPLATES,
  type CrmIntelFacts,
} from '../src/lib/growth-crm'
import {
  meetingCreateSchema,
  schoolCreateSchema,
  schoolListFilterSchema,
  sendMessageSchema,
  stageChangeSchema,
  taskCreateSchema,
} from '../src/server/modules/platform/growth/schema'
import { buildSchoolListWhere } from '../src/server/modules/platform/growth/service'

describe('Growth CRM scoring', () => {
  it('weights pipeline as deal × probability', () => {
    expect(weightedPipelineMinor(100_000_00, 60)).toBe(60_000_00)
    expect(rupeesToMinor('75000')).toBe(7_500_000)
  })

  it('marks pending follow-ups overdue after due date', () => {
    const due = new Date('2026-09-01T10:00:00Z')
    const now = new Date('2026-09-03T10:00:00Z')
    expect(isFollowUpOverdue(due, 'PENDING', now)).toBe(true)
    expect(followUpDisplayStatus(due, 'PENDING', now)).toBe('OVERDUE')
    expect(followUpDisplayStatus(due, 'COMPLETED', now)).toBe('COMPLETED')
  })

  it('flags live opportunities without a future follow-up', () => {
    expect(hasNextAction({ stage: 'PROPOSAL_SENT', nextFollowUpAt: null })).toBe(false)
    expect(hasNextAction({ stage: 'WON', nextFollowUpAt: null })).toBe(true)
    expect(
      hasNextAction({
        stage: 'CONTACTED',
        nextFollowUpAt: new Date(Date.now() + 86_400_000),
      }),
    ).toBe(true)
  })

  it('explains temperature from stage and recency', () => {
    const hot = computeTemperature({
      stage: 'PROPOSAL_SENT',
      lastActivityAt: new Date(),
    })
    expect(hot.temperature).toBe('HOT')
    expect(hot.reasons.some((r) => r.toLowerCase().includes('proposal'))).toBe(true)

    const stale = computeTemperature({
      stage: 'PROPOSAL_SENT',
      lastActivityAt: new Date(Date.now() - 10 * 86_400_000),
    })
    expect(stale.temperature).toBe('COLD')
  })

  it('extracts a website domain for duplicate checks', () => {
    expect(websiteDomain('https://www.dpsgurgaon.org/admissions')).toBe('dpsgurgaon.org')
  })

  it('flags meetings in the next 30 minutes and follow-ups in the next hour', () => {
    const now = new Date('2026-09-03T10:00:00Z')
    expect(isMeetingImminent(new Date('2026-09-03T10:20:00Z'), now)).toBe(true)
    expect(isMeetingImminent(new Date('2026-09-03T11:00:00Z'), now)).toBe(false)
    expect(isFollowUpSoon(new Date('2026-09-03T10:45:00Z'), now)).toBe(true)
    expect(isFollowUpSoon(new Date('2026-09-03T12:00:00Z'), now)).toBe(false)
  })
})

describe('Growth CRM communication copy', () => {
  it('covers every sales category with at least one default template', () => {
    const categories = new Set(DEFAULT_CRM_TEMPLATES.map((t) => t.category))
    expect([...CRM_TEMPLATE_CATEGORIES].sort()).toEqual([...categories].sort())
  })

  it('picks WhatsApp, SMS and email destinations in the documented order', () => {
    expect(
      pickCrmDestination('WHATSAPP', {
        contactWhatsapp: '+9198',
        contactMobile: '+9111',
        schoolPhone: '+9100',
      }),
    ).toBe('+9198')
    expect(
      pickCrmDestination('SMS', {
        contactWhatsapp: '+9198',
        contactMobile: '+9111',
        schoolPhone: '+9100',
      }),
    ).toBe('+9111')
    expect(
      pickCrmDestination('EMAIL', {
        contactEmail: 'a@school.in',
        schoolEmail: 'office@school.in',
      }),
    ).toBe('a@school.in')
    expect(pickCrmDestination('EMAIL', { schoolEmail: 'office@school.in' })).toBe('office@school.in')
  })

  it('fills the sales placeholders used in templates', () => {
    const vars = crmMessageVars({
      contactName: 'Anita',
      schoolName: 'DPS Gurugram',
      meetingDate: '4 Sep 2026',
      meetingTime: '11:00 am',
      ownerName: 'Ravi',
      proposalLink: 'https://example.com/proposal',
    })
    expect(vars.contactName).toBe('Anita')
    expect(vars.proposalLink).toContain('proposal')
  })
})

describe('Growth CRM intelligence', () => {
  const baseFacts = (): CrmIntelFacts => ({
    schoolName: 'ABC International',
    stage: 'PROPOSAL_SENT',
    temperature: 'HOT',
    ownerName: null,
    lastActivityAt: new Date('2026-08-20T10:00:00Z'),
    stageChangedAt: new Date('2026-08-01T10:00:00Z'),
    nextFollowUpAt: null,
    nextAction: null,
    currentErp: 'EduSathi',
    competitor: 'SchoolPad',
    primaryObjection: 'Price',
    dealValueMinor: 9_500_000,
    probability: 55,
    decisionMakerName: null,
    primaryContactName: 'Anita',
    overdueFollowUpCount: 1,
    openTaskCount: 0,
    upcomingMeetingAt: null,
    upcomingMeetingType: null,
    lastVisitAt: new Date('2026-08-18T10:00:00Z'),
    notes: null,
    recentActivities: [
      { type: 'CALL', summary: 'Discussed pricing', createdAt: new Date('2026-08-20T10:00:00Z') },
    ],
  })

  it('flags high risk when owner, follow-up and freshness are missing', () => {
    const now = new Date('2026-09-03T12:00:00Z')
    const risk = assessCrmRisk(baseFacts(), now)
    expect(risk.level).toBe('HIGH')
    expect(risk.risks.some((r) => r.code === 'NO_OWNER')).toBe(true)
    expect(risk.risks.some((r) => r.code === 'NO_NEXT_ACTION')).toBe(true)
    expect(risk.risks.some((r) => r.code === 'OVERDUE_FOLLOW_UP')).toBe(true)
  })

  it('prioritises clearing overdue follow-ups as the next action', () => {
    const suggestion = recommendCrmNextAction(baseFacts(), new Date('2026-09-03T12:00:00Z'))
    expect(suggestion.followUpWithinDays).toBe(0)
    expect(suggestion.channel).toBe('CALL')
    expect(suggestion.objective.toLowerCase()).toContain('overdue')
  })

  it('builds a meeting brief that separates facts from recommendations', () => {
    const facts = baseFacts()
    facts.overdueFollowUpCount = 0
    facts.ownerName = 'Ravi'
    facts.nextFollowUpAt = new Date('2026-09-10T10:00:00Z')
    facts.upcomingMeetingAt = new Date('2026-09-04T11:00:00Z')
    facts.upcomingMeetingType = 'Demo'
    const brief = buildCrmMeetingBrief(facts, new Date('2026-09-03T12:00:00Z'))
    expect(brief.facts.some((f) => f.includes('ABC International'))).toBe(true)
    expect(brief.recommendations.some((r) => r.toLowerCase().includes('objective'))).toBe(true)
    expect(brief.objective.toLowerCase()).toContain('demo')
  })

  it('summarises conversation history without inventing touches', () => {
    const empty = summarizeCrmConversation([])
    expect(empty.summary.toLowerCase()).toContain('no conversation')
    const filled = summarizeCrmConversation([
      { type: 'VISIT', summary: 'Met principal', createdAt: new Date('2026-09-01T10:00:00Z') },
    ])
    expect(filled.highlights[0]).toContain('Met principal')
  })
})

describe('Growth CRM schemas', () => {
  it('creates a prospect from a short form', () => {
    const parsed = schoolCreateSchema.parse({
      name: 'ABC International School',
      city: 'Gurugram',
      leadSource: 'GOOGLE_ADS',
      dealValue: '95000',
    })
    expect(parsed.name).toBe('ABC International School')
    expect(parsed.dealValue).toBe(9_500_000)
  })

  it('requires a lost reason only in the service, but accepts the field', () => {
    expect(stageChangeSchema.parse({ stage: 'LOST', lostReason: 'PRICE' }).lostReason).toBe('PRICE')
    expect(stageChangeSchema.parse({ stage: 'LOST' }).lostReason).toBeUndefined()
  })

  it('accepts a meeting and a task from a short form', () => {
    const meeting = meetingCreateSchema.parse({
      startsAt: '2026-09-04T11:00',
      meetingType: 'Demo',
      mode: 'ONLINE',
    })
    expect(meeting.mode).toBe('ONLINE')
    expect(taskCreateSchema.parse({ title: 'Prepare proposal' }).title).toBe('Prepare proposal')
  })

  it('accepts a WhatsApp send with a body', () => {
    const parsed = sendMessageSchema.parse({
      channel: 'WHATSAPP',
      body: 'Hello {{contactName}}',
    })
    expect(parsed.channel).toBe('WHATSAPP')
    expect(parsed.body).toBe('Hello {{contactName}}')
  })

  it('rejects a send with neither body nor template', () => {
    expect(() => sendMessageSchema.parse({ channel: 'SMS' })).toThrow()
  })
})

describe('Growth CRM list filters', () => {
  it('combines search with stale and no-next-action instead of overwriting OR', () => {
    const now = new Date('2026-09-03T12:00:00Z')
    const where = buildSchoolListWhere(
      { q: 'Anita' },
      schoolListFilterSchema.parse({ stale: 'on', noNextAction: 'on' }),
      now,
    )
    expect(where.AND).toBeDefined()
    const and = where.AND as unknown[]
    expect(and.length).toBeGreaterThanOrEqual(3)
    expect(JSON.stringify(where)).toContain('Anita')
    expect(JSON.stringify(where)).toContain('lastActivityAt')
    expect(JSON.stringify(where)).toContain('nextFollowUpAt')
  })
})

describe('Growth CRM authorization catalogue', () => {
  it('registers platform CRM permissions', () => {
    expect(PERMISSION_KEYS).toContain('platform.crm')
    expect(PERMISSION_KEYS).toContain('platform.crm_create')
    expect(PERMISSION_KEYS).toContain('platform.crm_edit')
    expect(PERMISSION_KEYS).toContain('platform.crm_assign')
    expect(PERMISSION_KEYS).toContain('platform.crm_delete')
    expect(PERMISSION_KEYS).toContain('platform.crm_comms')
  })

  it('does not grant CRM permissions to school roles', () => {
    for (const role of SYSTEM_ROLES) {
      if (role.key === ROLE.SUPER_ADMIN) continue
      const crm = role.permissions.filter((k) => k.startsWith('platform.crm'))
      expect(crm, `${role.key} must not hold Growth CRM`).toEqual([])
    }
  })
})

describe('Growth CRM tenant isolation', () => {
  it('refuses CRM queries on the tenant-bound client', async () => {
    const db = tenantDb('tenant_should_not_see_crm')
    await expect(db.crmSchool.findMany()).rejects.toBeInstanceOf(TenantIsolationError)
    await expect(db.crmContact.findMany()).rejects.toBeInstanceOf(TenantIsolationError)
    await expect(db.crmOpportunity.findMany()).rejects.toBeInstanceOf(TenantIsolationError)
    await expect(db.crmActivity.findMany()).rejects.toBeInstanceOf(TenantIsolationError)
    await expect(db.crmVisit.findMany()).rejects.toBeInstanceOf(TenantIsolationError)
    await expect(db.crmMeeting.findMany()).rejects.toBeInstanceOf(TenantIsolationError)
    await expect(db.crmTask.findMany()).rejects.toBeInstanceOf(TenantIsolationError)
    await expect(db.crmTemplate.findMany()).rejects.toBeInstanceOf(TenantIsolationError)
    await expect(db.crmCommunication.findMany()).rejects.toBeInstanceOf(TenantIsolationError)
  })
})
