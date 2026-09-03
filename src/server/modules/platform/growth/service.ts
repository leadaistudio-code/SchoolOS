import type { Prisma } from '@prisma/client'
import type { PlatformContext } from '@/server/context'
import { ForbiddenError } from '@/server/context'
import { audit } from '@/server/audit'
import { notFound, conflict, badRequest } from '@/server/api/response'
import { skipTake, orderByFrom, type ListQuery } from '@/lib/query'
import { normalizePhone } from '@/server/auth/phone'
import { renderTemplate } from '@/lib/notification-templates'
import { emailProvider, smsProvider, whatsappProvider } from '@/server/providers'
import {
  ACTIVITY_TYPE_LABELS,
  CRM_CHANNEL_LABELS,
  CRM_SORT_FIELDS,
  CRM_STAGES,
  DEFAULT_CRM_TEMPLATES,
  OPEN_CRM_STAGES,
  STAGE_LABELS,
  STAGE_PROBABILITY,
  STALE_DAYS,
  clampProbability,
  computeTemperature,
  crmMessageVars,
  daysBetween,
  followUpDisplayStatus,
  formatCrmMeetingSlots,
  hasNextAction,
  pickCrmDestination,
  websiteDomain,
  weightedPipelineMinor,
  type CrmActivityType,
  type CrmMessageChannel,
  type CrmStage,
} from '@/lib/growth-crm'
import type {
  ActivityCreateInput,
  ContactCreateInput,
  FieldCaptureInput,
  FollowUpCreateInput,
  MeetingCreateInput,
  SchoolCreateInput,
  SchoolListFilter,
  SchoolUpdateInput,
  SendMessageInput,
  StageChangeInput,
  TaskCreateInput,
  TemplateCreateInput,
  VisitLogInput,
} from './schema'

const LIVE_STAGES: CrmStage[] = OPEN_CRM_STAGES.filter((s) => s !== 'ON_HOLD') as CrmStage[]

function actorLabel(ctx: PlatformContext) {
  return `${ctx.user.firstName} ${ctx.user.lastName}`.trim()
}

function assertPerm(ctx: PlatformContext, key: string) {
  if (!ctx.user.permissions.has(key)) {
    throw new ForbiddenError(`Missing permission: ${key}`)
  }
}

function phoneOrNull(raw?: string) {
  if (!raw) return null
  return normalizePhone(raw) ?? raw.trim()
}

async function touchSchool(
  ctx: PlatformContext,
  schoolId: string,
  extra: Prisma.CrmSchoolUpdateInput = {},
) {
  await ctx.db.crmSchool.update({
    where: { id: schoolId },
    data: { lastActivityAt: new Date(), ...extra },
  })
  await applyTemperature(ctx, schoolId)
}

async function writeActivity(
  ctx: PlatformContext,
  input: {
    schoolId: string
    type: CrmActivityType
    summary: string
    body?: string | null
    contactId?: string | null
    meta?: Prisma.InputJsonValue
  },
) {
  await ctx.db.crmActivity.create({
    data: {
      schoolId: input.schoolId,
      type: input.type,
      summary: input.summary,
      body: input.body ?? null,
      contactId: input.contactId ?? null,
      meta: input.meta ?? undefined,
      actorId: ctx.user.userId,
      actorLabel: actorLabel(ctx),
    },
  })
  await touchSchool(ctx, input.schoolId)
}

export async function listSchoolOptions(ctx: PlatformContext) {
  return ctx.db.crmSchool.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    take: 400,
    select: { id: true, name: true, city: true, stage: true, phone: true, email: true },
  })
}

export async function listContactsLite(ctx: PlatformContext) {
  return ctx.db.crmContact.findMany({
    where: { deletedAt: null },
    select: { id: true, schoolId: true, fullName: true, mobile: true, whatsapp: true, email: true, isPrimary: true },
    orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }],
    take: 2000,
  })
}

export async function listOperators(ctx: PlatformContext) {
  return ctx.db.user.findMany({
    where: { tenantId: null, deletedAt: null, status: 'ACTIVE' },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, email: true },
  })
}

export async function findDuplicates(
  ctx: PlatformContext,
  input: { name: string; phone?: string | null; website?: string | null; excludeId?: string },
) {
  const domain = websiteDomain(input.website)
  const phone = phoneOrNull(input.phone ?? undefined)
  const or: Prisma.CrmSchoolWhereInput[] = [
    { name: { equals: input.name.trim(), mode: 'insensitive' } },
  ]
  if (phone) or.push({ phone })
  if (domain) or.push({ website: { contains: domain, mode: 'insensitive' } })

  return ctx.db.crmSchool.findMany({
    where: {
      deletedAt: null,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: or,
    },
    select: { id: true, name: true, city: true, phone: true, website: true, stage: true },
    take: 5,
  })
}

async function applyTemperature(ctx: PlatformContext, schoolId: string) {
  const school = await ctx.db.crmSchool.findUnique({ where: { id: schoolId } })
  if (!school || school.temperatureManual) return
  const { temperature } = computeTemperature({
    stage: school.stage,
    lastActivityAt: school.lastActivityAt,
  })
  if (temperature !== school.temperature) {
    await ctx.db.crmSchool.update({ where: { id: schoolId }, data: { temperature } })
  }
}

export async function createSchool(ctx: PlatformContext, input: SchoolCreateInput) {
  assertPerm(ctx, 'platform.crm_create')

  const duplicates = await findDuplicates(ctx, input)
  if (duplicates.length > 0 && !input.confirmDuplicate) {
    throw conflict(
      `A similar school already exists (${duplicates.map((d) => d.name).join(', ')}). Tick “create anyway” if this is a different campus.`,
    )
  }

  const stage = input.stage ?? 'PROSPECT'
  const probability = clampProbability(input.probability ?? STAGE_PROBABILITY[stage])
  const { temperature } = computeTemperature({
    stage,
    lastActivityAt: new Date(),
    temperatureManual: !!input.temperature,
    temperature: input.temperature,
  })

  const school = await ctx.db.crmSchool.create({
    data: {
      name: input.name,
      schoolType: input.schoolType ?? null,
      board: input.board ?? null,
      studentCount: input.studentCount ?? null,
      branchCount: input.branchCount ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      address: input.address ?? null,
      website: input.website ?? null,
      phone: phoneOrNull(input.phone),
      email: input.email ?? null,
      currentErp: input.currentErp ?? null,
      currentErpVendor: input.currentErpVendor ?? null,
      erpRenewalOn: input.erpRenewalOn ?? null,
      leadSource: input.leadSource ?? null,
      campaign: input.campaign ?? null,
      sourceDetails: input.sourceDetails ?? null,
      ownerId: input.ownerId ?? ctx.user.userId,
      createdById: ctx.user.userId,
      temperature,
      temperatureManual: !!input.temperature,
      stage,
      stageChangedAt: new Date(),
      dealValueMinor: input.dealValue,
      arrMinor: input.arr,
      probability,
      expectedCloseOn: input.expectedCloseOn ?? null,
      competitor: input.competitor ?? null,
      primaryObjection: input.primaryObjection ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      nextAction: input.nextAction ?? null,
      lastActivityAt: new Date(),
      notes: input.notes ?? null,
      opportunities: {
        create: {
          title: 'MyCampusView',
          stage,
          stageChangedAt: new Date(),
          dealValueMinor: input.dealValue,
          arrMinor: input.arr,
          probability,
          expectedCloseOn: input.expectedCloseOn ?? null,
          ownerId: input.ownerId ?? ctx.user.userId,
        },
      },
    },
  })

  await writeActivity(ctx, {
    schoolId: school.id,
    type: 'NOTE',
    summary: `Lead created${input.leadSource ? ` · source ${input.leadSource.replaceAll('_', ' ').toLowerCase()}` : ''}`,
    body: input.notes ?? null,
  })

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'crm.school.create',
    module: 'growth',
    entityType: 'CrmSchool',
    entityId: school.id,
    summary: `Added prospect ${school.name}`,
  })

  return school
}

/**
 * One-shot field capture for sales reps on campus.
 * Creates the prospect, primary contact, visit log, and next follow-up together
 * so the funnel always has an owner, a contact, and a next action.
 */
export async function captureFieldLead(ctx: PlatformContext, input: FieldCaptureInput) {
  assertPerm(ctx, 'platform.crm_create')

  const duplicates = await findDuplicates(ctx, {
    name: input.name,
    phone: input.contactMobile,
  })
  if (duplicates.length > 0 && !input.confirmDuplicate) {
    throw conflict(
      `A similar school already exists (${duplicates.map((d) => d.name).join(', ')}). Tick “create anyway” if this is a different campus.`,
    )
  }

  const stage = (input.stage ?? 'CONTACTED') as CrmStage
  const probability = STAGE_PROBABILITY[stage]
  const { temperature } = computeTemperature({
    stage,
    lastActivityAt: new Date(),
  })
  const ownerId = ctx.user.userId
  const mobile = phoneOrNull(input.contactMobile) ?? input.contactMobile.trim()
  const nextAction = input.nextAction

  const school = await ctx.db.crmSchool.create({
    data: {
      name: input.name,
      city: input.city,
      phone: mobile,
      currentErp: input.currentErp ?? null,
      primaryObjection: input.primaryObjection ?? null,
      leadSource: input.leadSource ?? 'SCHOOL_VISIT',
      ownerId,
      createdById: ownerId,
      temperature,
      temperatureManual: false,
      stage,
      stageChangedAt: new Date(),
      probability,
      nextFollowUpAt: input.nextFollowUpAt,
      nextAction,
      lastActivityAt: new Date(),
      notes: input.visitSummary,
      opportunities: {
        create: {
          title: 'MyCampusView',
          stage,
          stageChangedAt: new Date(),
          probability,
          ownerId,
        },
      },
      contacts: {
        create: {
          fullName: input.contactName,
          designation: input.contactDesignation ?? 'PRINCIPAL',
          mobile,
          whatsapp: mobile,
          isPrimary: true,
          isDecisionMaker: input.isDecisionMaker,
        },
      },
    },
    include: { contacts: true },
  })

  const contact = school.contacts[0]
  const visitedAt = new Date()

  await ctx.db.crmVisit.create({
    data: {
      schoolId: school.id,
      visitedAt,
      contactsMet: input.contactName,
      purpose: 'Field visit',
      meetingType: 'First meeting',
      summary: input.visitSummary,
      currentErp: input.currentErp ?? null,
      objections: input.primaryObjection ?? null,
      nextAction,
      createdById: ownerId,
    },
  })

  const followUp = await ctx.db.crmFollowUp.create({
    data: {
      schoolId: school.id,
      contactId: contact?.id ?? null,
      dueAt: input.nextFollowUpAt,
      type: 'CALL',
      priority: 'NORMAL',
      note: nextAction,
      assignedToId: ownerId,
      createdById: ownerId,
    },
  })

  await writeActivity(ctx, {
    schoolId: school.id,
    type: 'VISIT',
    summary: `Field capture · met ${input.contactName}`,
    body: input.visitSummary,
    contactId: contact?.id,
    meta: { followUpId: followUp.id, source: 'field_capture' },
  })

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'crm.field_capture',
    module: 'growth',
    entityType: 'CrmSchool',
    entityId: school.id,
    summary: `Field capture for ${school.name}`,
  })

  return school
}

export async function updateSchool(ctx: PlatformContext, id: string, input: SchoolUpdateInput) {
  assertPerm(ctx, 'platform.crm_edit')
  const existing = await ctx.db.crmSchool.findFirst({ where: { id, deletedAt: null } })
  if (!existing) throw notFound('School not found')

  if (input.ownerId && input.ownerId !== existing.ownerId) {
    assertPerm(ctx, 'platform.crm_assign')
  }

  const data: Prisma.CrmSchoolUpdateInput = {
    name: input.name,
    schoolType: input.schoolType,
    board: input.board,
    studentCount: input.studentCount,
    branchCount: input.branchCount,
    city: input.city,
    state: input.state,
    address: input.address,
    website: input.website,
    phone: input.phone !== undefined ? phoneOrNull(input.phone) : undefined,
    email: input.email,
    currentErp: input.currentErp,
    currentErpVendor: input.currentErpVendor,
    erpRenewalOn: input.erpRenewalOn,
    leadSource: input.leadSource,
    campaign: input.campaign,
    sourceDetails: input.sourceDetails,
    competitor: input.competitor,
    primaryObjection: input.primaryObjection,
    nextAction: input.nextAction,
    notes: input.notes,
    expectedCloseOn: input.expectedCloseOn,
    nextFollowUpAt: input.nextFollowUpAt,
  }

  if (input.dealValue !== undefined) data.dealValueMinor = input.dealValue
  if (input.arr !== undefined) data.arrMinor = input.arr
  if (input.probability !== undefined) data.probability = clampProbability(input.probability)
  if (input.ownerId !== undefined) data.owner = input.ownerId ? { connect: { id: input.ownerId } } : { disconnect: true }
  if (input.temperature) {
    data.temperature = input.temperature
    data.temperatureManual = true
  }

  const updated = await ctx.db.crmSchool.update({ where: { id }, data })

  const oppData: Prisma.CrmOpportunityUncheckedUpdateManyInput = {}
  if (input.dealValue !== undefined) oppData.dealValueMinor = input.dealValue
  if (input.arr !== undefined) oppData.arrMinor = input.arr
  if (input.probability !== undefined) oppData.probability = clampProbability(input.probability)
  if (input.ownerId !== undefined) oppData.ownerId = input.ownerId ?? null
  if (input.expectedCloseOn !== undefined) oppData.expectedCloseOn = input.expectedCloseOn ?? null
  if (Object.keys(oppData).length > 0) {
    await ctx.db.crmOpportunity.updateMany({ where: { schoolId: id }, data: oppData })
  }

  if (input.dealValue !== undefined && input.dealValue !== existing.dealValueMinor) {
    await writeActivity(ctx, {
      schoolId: id,
      type: 'NOTE',
      summary: `Deal value changed from ₹${(existing.dealValueMinor / 100).toLocaleString('en-IN')} to ₹${(input.dealValue / 100).toLocaleString('en-IN')}`,
    })
  }
  if (input.ownerId && input.ownerId !== existing.ownerId) {
    await writeActivity(ctx, {
      schoolId: id,
      type: 'OWNER_CHANGE',
      summary: `Owner reassigned`,
      meta: { from: existing.ownerId, to: input.ownerId },
    })
  }

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'crm.school.update',
    module: 'growth',
    entityType: 'CrmSchool',
    entityId: id,
    summary: `Updated ${updated.name}`,
  })

  return updated
}

export function buildSchoolListWhere(
  query: Pick<ListQuery, 'q'>,
  filter: SchoolListFilter,
  now = new Date(),
): Prisma.CrmSchoolWhereInput {
  const staleBefore = new Date(now.getTime() - STALE_DAYS * 86_400_000)
  const clauses: Prisma.CrmSchoolWhereInput[] = [{ deletedAt: null }]

  if (filter.stage) clauses.push({ stage: filter.stage })
  if (filter.ownerId) clauses.push({ ownerId: filter.ownerId })
  if (filter.leadSource) clauses.push({ leadSource: filter.leadSource })
  if (filter.city) clauses.push({ city: { contains: filter.city, mode: 'insensitive' } })
  if (filter.temperature) clauses.push({ temperature: filter.temperature })
  if (filter.schoolType) clauses.push({ schoolType: filter.schoolType })
  if (filter.overdue) {
    clauses.push({ nextFollowUpAt: { lt: now }, stage: { in: LIVE_STAGES } })
  }
  if (filter.noNextAction) {
    clauses.push({
      stage: { in: LIVE_STAGES },
      OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { lt: now } }],
    })
  }
  if (filter.stale) {
    clauses.push({
      stage: { in: LIVE_STAGES },
      OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: staleBefore } }],
    })
  }
  if (query.q) {
    const q = query.q
    clauses.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
        { currentErp: { contains: q, mode: 'insensitive' } },
        { campaign: { contains: q, mode: 'insensitive' } },
        {
          contacts: {
            some: {
              deletedAt: null,
              OR: [
                { fullName: { contains: q, mode: 'insensitive' } },
                { mobile: { contains: q } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ],
    })
  }

  return clauses.length === 1 ? clauses[0]! : { AND: clauses }
}

export async function listSchools(
  ctx: PlatformContext,
  query: ListQuery,
  filter: SchoolListFilter,
) {
  const where = buildSchoolListWhere(query, filter)

  const [rows, total] = await Promise.all([
    ctx.db.crmSchool.findMany({
      where,
      ...skipTake(query),
      orderBy: orderByFrom(query.sort, query.dir, CRM_SORT_FIELDS, { updatedAt: 'desc' }) as never,
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        contacts: {
          where: { deletedAt: null },
          orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }],
          take: 1,
          select: { fullName: true, mobile: true, designation: true },
        },
      },
    }),
    ctx.db.crmSchool.count({ where }),
  ])

  return { rows, total }
}

export async function getSchool(ctx: PlatformContext, id: string) {
  const school = await ctx.db.crmSchool.findFirst({
    where: { id, deletedAt: null },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      contacts: { where: { deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }] },
      opportunities: { orderBy: { createdAt: 'desc' } },
      activities: { orderBy: { createdAt: 'desc' }, take: 80 },
      followUps: { orderBy: { dueAt: 'asc' }, include: { contact: { select: { fullName: true } } } },
      visits: { orderBy: { visitedAt: 'desc' }, take: 20 },
      meetings: { orderBy: { startsAt: 'desc' }, take: 20 },
      tasks: { orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], take: 30, include: { owner: { select: { firstName: true, lastName: true } } } },
      communications: {
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          contact: { select: { fullName: true } },
          template: { select: { name: true } },
        },
      },
    },
  })
  if (!school) throw notFound('School not found')
  return school
}

export async function createContact(ctx: PlatformContext, schoolId: string, input: ContactCreateInput) {
  assertPerm(ctx, 'platform.crm_edit')
  const school = await ctx.db.crmSchool.findFirst({ where: { id: schoolId, deletedAt: null } })
  if (!school) throw notFound('School not found')

  if (input.mobile) {
    const dup = await ctx.db.crmContact.findFirst({
      where: { deletedAt: null, mobile: phoneOrNull(input.mobile), schoolId: { not: schoolId } },
      include: { school: { select: { name: true } } },
    })
    if (dup) {
      throw conflict(`That mobile is already on ${dup.school.name}`)
    }
  }

  if (input.isPrimary) {
    await ctx.db.crmContact.updateMany({
      where: { schoolId, isPrimary: true },
      data: { isPrimary: false },
    })
  }

  const contact = await ctx.db.crmContact.create({
    data: {
      schoolId,
      fullName: input.fullName,
      designation: input.designation ?? null,
      mobile: phoneOrNull(input.mobile),
      whatsapp: phoneOrNull(input.whatsapp) ?? phoneOrNull(input.mobile),
      email: input.email ?? null,
      preferredChannel: input.preferredChannel ?? null,
      isDecisionMaker: input.isDecisionMaker,
      isInfluencer: input.isInfluencer,
      isPrimary: input.isPrimary,
      notes: input.notes ?? null,
    },
  })

  await writeActivity(ctx, {
    schoolId,
    type: 'NOTE',
    summary: `Added contact ${contact.fullName}${contact.isDecisionMaker ? ' (decision maker)' : ''}`,
    contactId: contact.id,
  })

  return contact
}

export async function deleteContact(ctx: PlatformContext, schoolId: string, contactId: string) {
  assertPerm(ctx, 'platform.crm_delete')
  await ctx.db.crmContact.updateMany({
    where: { id: contactId, schoolId },
    data: { deletedAt: new Date() },
  })
}

export async function moveStage(ctx: PlatformContext, schoolId: string, input: StageChangeInput) {
  assertPerm(ctx, 'platform.crm_edit')
  const school = await ctx.db.crmSchool.findFirst({
    where: { id: schoolId, deletedAt: null },
    include: { opportunities: { orderBy: { createdAt: 'asc' }, take: 1 } },
  })
  if (!school) throw notFound('School not found')

  if (input.stage === 'LOST' && !input.lostReason) {
    throw conflict('Choose a lost reason')
  }

  const probability = STAGE_PROBABILITY[input.stage]
  const { temperature } = computeTemperature({
    stage: input.stage,
    lastActivityAt: new Date(),
    temperatureManual: school.temperatureManual,
    temperature: school.temperature,
  })

  await ctx.db.$transaction(async (tx) => {
    await tx.crmSchool.update({
      where: { id: schoolId },
      data: {
        stage: input.stage,
        stageChangedAt: new Date(),
        probability,
        temperature: school.temperatureManual ? school.temperature : temperature,
        lostReason: input.lostReason ?? null,
        lostCompetitor: input.lostCompetitor ?? null,
        lostNotes: input.lostNotes ?? null,
        recontactOn: input.recontactOn ?? null,
        wonTenantId: input.wonTenantId ?? school.wonTenantId,
        lastActivityAt: new Date(),
      },
    })
    const opportunity = school.opportunities[0]
    if (opportunity) {
      await tx.crmOpportunity.update({
        where: { id: opportunity.id },
        data: {
          stage: input.stage,
          stageChangedAt: new Date(),
          probability,
          lostReason: input.lostReason ?? null,
          lostCompetitor: input.lostCompetitor ?? null,
          lostNotes: input.lostNotes ?? null,
        },
      })
    }
  })

  await writeActivity(ctx, {
    schoolId,
    type: 'STAGE_CHANGE',
    summary: `${actorLabel(ctx)} changed stage: ${STAGE_LABELS[school.stage]} → ${STAGE_LABELS[input.stage]}`,
    body: input.lostNotes ?? null,
    meta: { from: school.stage, to: input.stage, lostReason: input.lostReason ?? null },
  })

  return getSchool(ctx, schoolId)
}

export async function logActivity(ctx: PlatformContext, schoolId: string, input: ActivityCreateInput) {
  assertPerm(ctx, 'platform.crm_edit')
  const school = await ctx.db.crmSchool.findFirst({ where: { id: schoolId, deletedAt: null } })
  if (!school) throw notFound('School not found')
  await writeActivity(ctx, {
    schoolId,
    type: input.type,
    summary: input.summary,
    body: input.body,
    contactId: input.contactId,
  })
}

async function bumpNextAt(ctx: PlatformContext, schoolId: string, at: Date, action: string) {
  const school = await ctx.db.crmSchool.findUnique({
    where: { id: schoolId },
    select: { nextFollowUpAt: true },
  })
  if (!school) return
  if (!school.nextFollowUpAt || school.nextFollowUpAt.getTime() > at.getTime()) {
    await ctx.db.crmSchool.update({
      where: { id: schoolId },
      data: { nextFollowUpAt: at, nextAction: action },
    })
  }
}

export async function logVisit(ctx: PlatformContext, schoolId: string, input: VisitLogInput) {
  assertPerm(ctx, 'platform.crm_edit')
  const school = await ctx.db.crmSchool.findFirst({ where: { id: schoolId, deletedAt: null } })
  if (!school) throw notFound('School not found')

  const visitedAt = combineDue(input.visitDate, input.startTime)
  const endedAt = input.endTime ? combineDue(input.visitDate, input.endTime) : null

  await ctx.db.crmVisit.create({
    data: {
      schoolId,
      visitedAt,
      endedAt,
      teamMembers: input.teamMembers ?? null,
      contactsMet: input.contactsMet ?? null,
      purpose: input.purpose ?? null,
      meetingType: input.meetingType ?? null,
      summary: input.summary,
      painPoints: input.painPoints ?? null,
      currentErp: input.currentErp ?? null,
      liked: input.liked ?? null,
      objections: input.objections ?? null,
      competitors: input.competitors ?? null,
      outcome: input.outcome ?? null,
      nextAction: input.nextAction ?? null,
      documentsRequested: input.documentsRequested ?? null,
      dealConfidence: input.dealConfidence ?? null,
      createdById: ctx.user.userId,
    },
  })

  const when = [input.visitDate, input.startTime].filter(Boolean).join(' ')
  await writeActivity(ctx, {
    schoolId,
    type: 'VISIT',
    summary: `School visit${input.meetingType ? ` · ${input.meetingType}` : ''}${input.contactsMet ? ` · met ${input.contactsMet}` : ''}`,
    body: input.summary,
    meta: {
      visitDate: input.visitDate,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      purpose: input.purpose ?? null,
      meetingType: input.meetingType ?? null,
      teamMembers: input.teamMembers ?? null,
      contactsMet: input.contactsMet ?? null,
      painPoints: input.painPoints ?? null,
      currentErp: input.currentErp ?? null,
      liked: input.liked ?? null,
      objections: input.objections ?? null,
      competitors: input.competitors ?? null,
      outcome: input.outcome ?? null,
      nextAction: input.nextAction ?? null,
      documentsRequested: input.documentsRequested ?? null,
      when,
    },
  })

  if (input.currentErp) {
    await ctx.db.crmSchool.update({
      where: { id: schoolId },
      data: { currentErp: input.currentErp, primaryObjection: input.objections ?? undefined },
    })
  }

  if (input.followUpRequired && input.followUpAt) {
    await createFollowUp(ctx, schoolId, {
      dueAt: input.followUpAt.toISOString(),
      type: input.followUpType ?? 'CALL',
      priority: 'NORMAL',
      note: input.nextAction ?? 'Follow up after school visit',
    })
  } else if (input.nextAction) {
    await ctx.db.crmSchool.update({
      where: { id: schoolId },
      data: { nextAction: input.nextAction },
    })
  }
}

export async function scheduleMeeting(ctx: PlatformContext, schoolId: string, input: MeetingCreateInput) {
  assertPerm(ctx, 'platform.crm_edit')
  const school = await ctx.db.crmSchool.findFirst({ where: { id: schoolId, deletedAt: null } })
  if (!school) throw notFound('School not found')

  const startsAt = combineDue(input.startsAt)
  const endsAt = input.endsAt ? combineDue(input.endsAt) : null
  const contactIds = input.contactId ? [input.contactId] : []

  const meeting = await ctx.db.crmMeeting.create({
    data: {
      schoolId,
      startsAt,
      endsAt,
      meetingType: input.meetingType,
      mode: input.mode,
      location: input.location ?? null,
      meetingLink: input.meetingLink ?? null,
      agenda: input.agenda ?? null,
      notes: input.notes ?? null,
      contactIds,
      attendeeIds: [ctx.user.userId],
      createdById: ctx.user.userId,
    },
  })

  const activityType = input.meetingType === 'Demo' ? 'DEMO' : input.mode === 'ONLINE' ? 'ONLINE_MEETING' : 'VISIT'
  await writeActivity(ctx, {
    schoolId,
    type: activityType,
    summary: `${input.meetingType} scheduled · ${input.mode === 'ONLINE' ? 'online' : 'in person'}`,
    body: input.agenda ?? input.notes,
    contactId: input.contactId,
    meta: { meetingId: meeting.id, startsAt: startsAt.toISOString(), mode: input.mode },
  })

  await bumpNextAt(ctx, schoolId, startsAt, `${input.meetingType} at school`)

  if (school.stage === 'PROSPECT' || school.stage === 'CONTACTED') {
    await moveStage(ctx, schoolId, { stage: 'MEETING_SCHEDULED' })
  }

  return meeting
}

export async function completeMeeting(ctx: PlatformContext, id: string) {
  assertPerm(ctx, 'platform.crm_edit')
  const meeting = await ctx.db.crmMeeting.findUnique({ where: { id } })
  if (!meeting) throw notFound('Meeting not found')
  await ctx.db.crmMeeting.update({
    where: { id },
    data: { status: 'COMPLETED' },
  })
  await writeActivity(ctx, {
    schoolId: meeting.schoolId,
    type: meeting.meetingType === 'Demo' ? 'DEMO' : 'ONLINE_MEETING',
    summary: `${meeting.meetingType} completed`,
    body: meeting.notes,
    meta: { meetingId: meeting.id },
  })
}

export async function cancelMeeting(ctx: PlatformContext, id: string) {
  assertPerm(ctx, 'platform.crm_edit')
  const meeting = await ctx.db.crmMeeting.findUnique({ where: { id } })
  if (!meeting) throw notFound('Meeting not found')
  await ctx.db.crmMeeting.update({ where: { id }, data: { status: 'CANCELLED' } })
}

export async function createTask(ctx: PlatformContext, schoolId: string, input: TaskCreateInput) {
  assertPerm(ctx, 'platform.crm_edit')
  const school = await ctx.db.crmSchool.findFirst({ where: { id: schoolId, deletedAt: null } })
  if (!school) throw notFound('School not found')

  const dueAt = input.dueAt ? combineDue(input.dueAt, input.dueTime) : null
  const task = await ctx.db.crmTask.create({
    data: {
      schoolId,
      title: input.title,
      description: input.description ?? null,
      dueAt,
      priority: input.priority,
      ownerId: input.ownerId ?? school.ownerId ?? ctx.user.userId,
      contactId: input.contactId ?? null,
      createdById: ctx.user.userId,
    },
  })

  await writeActivity(ctx, {
    schoolId,
    type: 'TASK',
    summary: `Task: ${task.title}`,
    body: input.description,
    meta: { taskId: task.id, dueAt: dueAt?.toISOString() ?? null },
  })

  if (dueAt) await bumpNextAt(ctx, schoolId, dueAt, task.title)
  return task
}

export async function setTaskStatus(ctx: PlatformContext, id: string, status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED') {
  assertPerm(ctx, 'platform.crm_edit')
  const task = await ctx.db.crmTask.findUnique({ where: { id } })
  if (!task) throw notFound('Task not found')
  await ctx.db.crmTask.update({
    where: { id },
    data: {
      status,
      completedAt: status === 'COMPLETED' ? new Date() : null,
    },
  })
  if (status === 'COMPLETED') {
    await writeActivity(ctx, {
      schoolId: task.schoolId,
      type: 'TASK',
      summary: `Task completed: ${task.title}`,
    })
  }
}

export async function createFollowUp(ctx: PlatformContext, schoolId: string, input: FollowUpCreateInput) {
  assertPerm(ctx, 'platform.crm_edit')
  const school = await ctx.db.crmSchool.findFirst({ where: { id: schoolId, deletedAt: null } })
  if (!school) throw notFound('School not found')

  const dueAt = combineDue(input.dueAt, input.dueTime)
  const followUp = await ctx.db.crmFollowUp.create({
    data: {
      schoolId,
      contactId: input.contactId ?? null,
      dueAt,
      type: input.type,
      priority: input.priority,
      note: input.note ?? null,
      assignedToId: input.assignedToId ?? school.ownerId ?? ctx.user.userId,
      createdById: ctx.user.userId,
    },
  })

  await touchSchool(ctx, schoolId, {
    nextFollowUpAt: dueAt,
    nextAction: input.note ?? `${input.type.replaceAll('_', ' ').toLowerCase()} follow-up`,
  })

  await writeActivity(ctx, {
    schoolId,
    type: 'FOLLOW_UP',
    summary: `Follow-up scheduled · ${input.type.replaceAll('_', ' ').toLowerCase()}`,
    body: input.note,
    contactId: input.contactId,
    meta: { dueAt: dueAt.toISOString(), followUpId: followUp.id },
  })

  return followUp
}

export async function completeFollowUp(ctx: PlatformContext, id: string) {
  assertPerm(ctx, 'platform.crm_edit')
  const followUp = await ctx.db.crmFollowUp.findUnique({ where: { id } })
  if (!followUp) throw notFound('Follow-up not found')

  await ctx.db.crmFollowUp.update({
    where: { id },
    data: { status: 'COMPLETED', completedAt: new Date(), completedById: ctx.user.userId },
  })

  const nextOpen = await ctx.db.crmFollowUp.findFirst({
    where: { schoolId: followUp.schoolId, status: 'PENDING', dueAt: { gte: new Date() } },
    orderBy: { dueAt: 'asc' },
  })
  await touchSchool(ctx, followUp.schoolId, { nextFollowUpAt: nextOpen?.dueAt ?? null })

  await writeActivity(ctx, {
    schoolId: followUp.schoolId,
    type: 'FOLLOW_UP',
    summary: 'Follow-up completed',
    body: followUp.note,
  })
}

function combineDue(date: string, time?: string) {
  if (time) {
    const d = new Date(`${date}T${time}`)
    if (!Number.isNaN(d.getTime())) return d
  }
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) throw conflict('Invalid follow-up date')
  if (!date.includes('T')) d.setHours(10, 0, 0, 0)
  return d
}

export async function listFollowUps(
  ctx: PlatformContext,
  filter: 'today' | 'overdue' | 'upcoming' | 'all' = 'all',
) {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  const where: Prisma.CrmFollowUpWhereInput = {
    status: 'PENDING',
    ...(filter === 'today' ? { dueAt: { gte: now, lt: end } } : {}),
    ...(filter === 'overdue' ? { dueAt: { lt: now } } : {}),
    ...(filter === 'upcoming' ? { dueAt: { gte: now } } : {}),
  }

  const rows = await ctx.db.crmFollowUp.findMany({
    where,
    orderBy: { dueAt: 'asc' },
    take: 80,
    include: {
      school: { select: { id: true, name: true, city: true, stage: true } },
      contact: { select: { fullName: true, mobile: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
    },
  })

  return rows.map((row) => ({
    ...row,
    displayStatus: followUpDisplayStatus(row.dueAt, row.status, now),
  }))
}

export async function fieldDay(ctx: PlatformContext) {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  const [meetings, tasks, visits, followUpsToday, followUpsOverdue] = await Promise.all([
    ctx.db.crmMeeting.findMany({
      where: { status: 'SCHEDULED', startsAt: { gte: now, lt: end } },
      orderBy: { startsAt: 'asc' },
      take: 40,
      include: {
        school: { select: { id: true, name: true, city: true, phone: true, address: true } },
      },
    }),
    ctx.db.crmTask.findMany({
      where: {
        status: { in: ['TODO', 'IN_PROGRESS'] },
        OR: [{ dueAt: { lt: end } }, { dueAt: null }],
      },
      orderBy: [{ dueAt: 'asc' }],
      take: 40,
      include: {
        school: { select: { id: true, name: true, city: true } },
        owner: { select: { firstName: true, lastName: true } },
      },
    }),
    ctx.db.crmVisit.findMany({
      where: { visitedAt: { gte: start, lt: end } },
      orderBy: { visitedAt: 'desc' },
      take: 20,
      include: { school: { select: { id: true, name: true, city: true } } },
    }),
    listFollowUps(ctx, 'today'),
    listFollowUps(ctx, 'overdue'),
  ])

  return { meetings, tasks, visits, followUpsToday, followUpsOverdue, now }
}

export async function listPipeline(ctx: PlatformContext) {
  const schools = await ctx.db.crmSchool.findMany({
    where: { deletedAt: null, stage: { in: CRM_STAGES.filter((s) => s !== 'ON_HOLD' && s !== 'NOT_INTERESTED') } },
    orderBy: { updatedAt: 'desc' },
    include: {
      owner: { select: { firstName: true, lastName: true } },
      contacts: {
        where: { deletedAt: null, isPrimary: true },
        take: 1,
        select: { fullName: true, mobile: true },
      },
    },
  })

  const now = new Date()
  const board: Record<string, typeof schools> = {}
  for (const stage of CRM_STAGES) board[stage] = []
  for (const school of schools) board[school.stage]?.push(school)

  return {
    board,
    cards: schools.map((school) => ({
      ...school,
      daysInStage: daysBetween(school.stageChangedAt, now),
      stale: !school.lastActivityAt || daysBetween(school.lastActivityAt, now) >= STALE_DAYS,
      noNextAction: !hasNextAction({ stage: school.stage, nextFollowUpAt: school.nextFollowUpAt, now }),
    })),
  }
}

export async function dashboard(ctx: PlatformContext) {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)
  const staleBefore = new Date(now.getTime() - STALE_DAYS * 86_400_000)

  const live = { deletedAt: null as Date | null, stage: { in: LIVE_STAGES } }

  const [
    total,
    newThisMonth,
    newPrevMonth,
    contacted,
    visits,
    followUpsToday,
    followUpsOverdue,
    meetings,
    meetingsToday,
    tasksOpen,
    active,
    proposalSent,
    negotiation,
    won,
    lost,
    pipelineAgg,
    noNext,
    stale,
    wonValue,
    messagesSent,
  ] = await Promise.all([
    ctx.db.crmSchool.count({ where: { deletedAt: null } }),
    ctx.db.crmSchool.count({ where: { deletedAt: null, createdAt: { gte: monthStart } } }),
    ctx.db.crmSchool.count({
      where: { deletedAt: null, createdAt: { gte: prevMonthStart, lt: monthStart } },
    }),
    ctx.db.crmSchool.count({ where: { deletedAt: null, stage: { not: 'PROSPECT' } } }),
    ctx.db.crmActivity.count({ where: { type: 'VISIT' } }),
    ctx.db.crmFollowUp.count({
      where: { status: 'PENDING', dueAt: { gte: now, lt: todayEnd } },
    }),
    ctx.db.crmFollowUp.count({ where: { status: 'PENDING', dueAt: { lt: now } } }),
    ctx.db.crmSchool.count({ where: { deletedAt: null, stage: 'MEETING_SCHEDULED' } }),
    ctx.db.crmMeeting.count({ where: { status: 'SCHEDULED', startsAt: { gte: now, lt: todayEnd } } }),
    ctx.db.crmTask.count({ where: { status: { in: ['TODO', 'IN_PROGRESS'] } } }),
    ctx.db.crmSchool.count({ where: live }),
    ctx.db.crmSchool.count({ where: { deletedAt: null, stage: 'PROPOSAL_SENT' } }),
    ctx.db.crmSchool.count({ where: { deletedAt: null, stage: 'NEGOTIATION' } }),
    ctx.db.crmSchool.count({ where: { deletedAt: null, stage: 'WON' } }),
    ctx.db.crmSchool.count({ where: { deletedAt: null, stage: 'LOST' } }),
    ctx.db.crmSchool.findMany({
      where: live,
      select: { dealValueMinor: true, arrMinor: true, probability: true, stage: true },
    }),
    ctx.db.crmSchool.count({
      where: {
        ...live,
        OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { lt: now } }],
      },
    }),
    ctx.db.crmSchool.count({
      where: {
        ...live,
        OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: staleBefore } }],
      },
    }),
    ctx.db.crmSchool.aggregate({
      where: { deletedAt: null, stage: 'WON' },
      _sum: { dealValueMinor: true, arrMinor: true },
    }),
    ctx.db.crmCommunication.count({
      where: { status: 'SENT', createdAt: { gte: monthStart } },
    }),
  ])

  const pipelineValue = pipelineAgg.reduce((s, r) => s + r.dealValueMinor, 0)
  const weighted = pipelineAgg.reduce((s, r) => s + weightedPipelineMinor(r.dealValueMinor, r.probability), 0)
  const expectedArr = pipelineAgg.reduce((s, r) => s + weightedPipelineMinor(r.arrMinor, r.probability), 0)
  const decided = won + lost
  const conversion = decided > 0 ? Math.round((won / decided) * 1000) / 10 : null

  const funnel = await Promise.all(
    (['PROSPECT', 'CONTACTED', 'MEETING_SCHEDULED', 'DEMO_COMPLETED', 'PROPOSAL_SENT', 'WON'] as CrmStage[]).map(
      async (stage) => ({
        stage,
        label: STAGE_LABELS[stage],
        count: await ctx.db.crmSchool.count({ where: { deletedAt: null, stage } }),
      }),
    ),
  )

  return {
    kpis: {
      total,
      newThisMonth,
      newPrevMonth,
      contacted,
      visits,
      followUpsToday,
      followUpsOverdue,
      meetings,
      meetingsToday,
      tasksOpen,
      active,
      proposalSent,
      negotiation,
      won,
      lost,
      pipelineValue,
      weighted,
      expectedArr,
      wonValue: wonValue._sum.dealValueMinor ?? 0,
      wonArr: wonValue._sum.arrMinor ?? 0,
      conversion,
      noNext,
      stale,
      messagesSent,
    },
    funnel,
  }
}

export async function listNextMeetingBySchool(ctx: PlatformContext) {
  const rows = await ctx.db.crmMeeting.findMany({
    where: { status: 'SCHEDULED', startsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
    select: { schoolId: true, startsAt: true },
  })
  const next: Record<string, string> = {}
  for (const row of rows) {
    if (!next[row.schoolId]) next[row.schoolId] = row.startsAt.toISOString()
  }
  return next
}

export async function listTemplates(ctx: PlatformContext, opts?: { activeOnly?: boolean }) {
  await ensureDefaultTemplates(ctx)
  return ctx.db.crmTemplate.findMany({
    where: opts?.activeOnly ? { isActive: true } : undefined,
    orderBy: [{ category: 'asc' }, { channel: 'asc' }, { name: 'asc' }],
  })
}

async function ensureDefaultTemplates(ctx: PlatformContext) {
  const count = await ctx.db.crmTemplate.count()
  if (count > 0) return
  await ctx.db.crmTemplate.createMany({
    data: DEFAULT_CRM_TEMPLATES.map((t) => ({
      name: t.name,
      category: t.category,
      channel: t.channel,
      subject: t.subject ?? null,
      body: t.body,
      isActive: true,
    })),
  })
}

export async function seedDefaultTemplates(ctx: PlatformContext) {
  assertPerm(ctx, 'platform.crm_comms')
  const count = await ctx.db.crmTemplate.count()
  if (count > 0) return { created: 0 }
  await ensureDefaultTemplates(ctx)
  return { created: DEFAULT_CRM_TEMPLATES.length }
}

export async function createTemplate(ctx: PlatformContext, input: TemplateCreateInput) {
  assertPerm(ctx, 'platform.crm_comms')
  const template = await ctx.db.crmTemplate.create({
    data: {
      name: input.name,
      category: input.category,
      channel: input.channel,
      subject: input.channel === 'EMAIL' ? input.subject ?? null : null,
      body: input.body,
      isActive: true,
    },
  })
  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: 'crm.template.create',
    module: 'growth',
    entityType: 'CrmTemplate',
    entityId: template.id,
    summary: `Added CRM template ${template.name}`,
  })
  return template
}

export async function setTemplateActive(ctx: PlatformContext, id: string, isActive: boolean) {
  assertPerm(ctx, 'platform.crm_comms')
  const template = await ctx.db.crmTemplate.findUnique({ where: { id } })
  if (!template) throw notFound('Template')
  return ctx.db.crmTemplate.update({ where: { id }, data: { isActive } })
}

export async function deleteTemplate(ctx: PlatformContext, id: string) {
  assertPerm(ctx, 'platform.crm_comms')
  const used = await ctx.db.crmCommunication.count({ where: { templateId: id } })
  if (used > 0) {
    await ctx.db.crmTemplate.update({ where: { id }, data: { isActive: false } })
    return
  }
  await ctx.db.crmTemplate.delete({ where: { id } })
}

export async function sendCrmMessage(ctx: PlatformContext, schoolId: string, input: SendMessageInput) {
  assertPerm(ctx, 'platform.crm_comms')
  const school = await ctx.db.crmSchool.findFirst({
    where: { id: schoolId, deletedAt: null },
    include: {
      owner: { select: { firstName: true, lastName: true } },
      contacts: { where: { deletedAt: null }, orderBy: [{ isPrimary: 'desc' }, { fullName: 'asc' }] },
      meetings: {
        where: { status: 'SCHEDULED', startsAt: { gte: new Date() } },
        orderBy: { startsAt: 'asc' },
        take: 1,
      },
    },
  })
  if (!school) throw notFound('School')

  const contact = input.contactId
    ? school.contacts.find((c) => c.id === input.contactId)
    : null
  if (input.contactId && !contact) throw notFound('Contact')

  const template = input.templateId
    ? await ctx.db.crmTemplate.findUnique({ where: { id: input.templateId } })
    : null
  if (input.templateId && !template) throw notFound('Template')
  if (template && template.channel !== input.channel) {
    throw badRequest('That template is for a different channel')
  }

  const rawBody = input.body || template?.body
  if (!rawBody) throw badRequest('Write a message or pick a template')
  const meeting = formatCrmMeetingSlots(school.meetings[0]?.startsAt)
  const vars = crmMessageVars({
    contactName: contact?.fullName,
    schoolName: school.name,
    meetingDate: meeting.meetingDate,
    meetingTime: meeting.meetingTime,
    ownerName: school.owner
      ? `${school.owner.firstName} ${school.owner.lastName}`.trim()
      : actorLabel(ctx),
    proposalLink: input.proposalLink,
  })
  const body = renderTemplate(rawBody, vars)
  const subject =
    input.channel === 'EMAIL'
      ? renderTemplate(
          input.subject || template?.subject || `MyCampusView · ${school.name}`,
          vars,
        )
      : null

  const destinationRaw = pickCrmDestination(input.channel, {
    contactWhatsapp: contact?.whatsapp,
    contactMobile: contact?.mobile,
    contactEmail: contact?.email,
    schoolPhone: school.phone,
    schoolEmail: school.email,
  })
  if (!destinationRaw) {
    throw badRequest(
      input.channel === 'EMAIL'
        ? 'Add an email on the contact or school first'
        : 'Add a mobile or WhatsApp number on the contact or school first',
    )
  }

  const to =
    input.channel === 'EMAIL'
      ? destinationRaw
      : (normalizePhone(destinationRaw) ?? destinationRaw)

  const dispatched = await dispatchCrmMessage(input.channel, { to, subject, body })
  const status = dispatched.ok ? 'SENT' : 'FAILED'

  const communication = await ctx.db.crmCommunication.create({
    data: {
      schoolId,
      contactId: contact?.id ?? null,
      channel: input.channel,
      to,
      subject,
      body,
      status,
      provider: dispatched.provider,
      providerMessageId: dispatched.providerMessageId ?? null,
      error: dispatched.error ?? null,
      templateId: template?.id ?? null,
      actorId: ctx.user.userId,
      actorLabel: actorLabel(ctx),
    },
  })

  await writeActivity(ctx, {
    schoolId,
    type: input.channel,
    summary: dispatched.ok
      ? `${CRM_CHANNEL_LABELS[input.channel]} to ${to}`
      : `${CRM_CHANNEL_LABELS[input.channel]} failed to ${to}`,
    body,
    contactId: contact?.id,
    meta: {
      communicationId: communication.id,
      status,
      provider: dispatched.provider,
      templateId: template?.id ?? null,
    },
  })

  await audit({
    tenantId: null,
    actorId: ctx.user.userId,
    actorLabel: actorLabel(ctx),
    action: dispatched.ok ? 'crm.message.send' : 'crm.message.fail',
    module: 'growth',
    entityType: 'CrmCommunication',
    entityId: communication.id,
    summary: `${CRM_CHANNEL_LABELS[input.channel]} ${status.toLowerCase()} to ${school.name}`,
  })

  if (!dispatched.ok) {
    throw badRequest(dispatched.error || 'The message could not be sent')
  }
  return communication
}

async function dispatchCrmMessage(
  channel: CrmMessageChannel,
  message: { to: string; subject: string | null; body: string },
) {
  if (channel === 'WHATSAPP') {
    const provider = whatsappProvider()
    const result = await provider.send({ to: message.to, body: message.body })
    return { ...result, provider: provider.name }
  }
  if (channel === 'SMS') {
    const provider = smsProvider()
    const result = await provider.send({ to: message.to, body: message.body })
    return { ...result, provider: provider.name }
  }
  const provider = emailProvider()
  const html = `<p>${escapeHtml(message.body)
    .split('\n\n')
    .map((p) => p.replaceAll('\n', '<br/>'))
    .join('</p><p>')}</p>`
  const result = await provider.send({
    to: message.to,
    subject: message.subject || 'MyCampusView',
    text: message.body,
    html,
  })
  return { ...result, provider: provider.name }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export { ACTIVITY_TYPE_LABELS }
