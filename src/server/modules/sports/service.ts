import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { conflict, notFound } from '@/server/api/response'
import { sportSchema, teamMemberSchema, teamSchema } from './schema'

export async function listSports(ctx: AppContext) {
  ctx.require('sports.view')
  return ctx.db.sport.findMany({
    where: { isActive: true },
    include: {
      teams: {
        include: { _count: { select: { members: true } } },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })
}

export async function createSport(ctx: AppContext, raw: unknown) {
  ctx.require('sports.manage')
  const input = sportSchema.parse(raw)
  const sport = await ctx.db.sport.create({
    data: {
      tenantId: ctx.tenant.id,
      name: input.name,
      category: input.category ?? null,
      coachStaffId: input.coachStaffId ?? null,
    },
  })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'sports.create',
    module: 'sports',
    entityType: 'Sport',
    entityId: sport.id,
    summary: `Added sport ${sport.name}`,
  })
  return sport
}

export async function createTeam(ctx: AppContext, raw: unknown) {
  ctx.require('sports.manage')
  const input = teamSchema.parse(raw)
  const sport = await ctx.db.sport.findFirst({ where: { id: input.sportId } })
  if (!sport) throw notFound('Sport not found')

  return ctx.db.sportsTeam.create({
    data: {
      tenantId: ctx.tenant.id,
      sportId: input.sportId,
      name: input.name,
      ageGroup: input.ageGroup ?? null,
      coachStaffId: input.coachStaffId ?? null,
    },
  })
}

export async function addTeamMember(ctx: AppContext, raw: unknown) {
  ctx.require('sports.manage')
  const input = teamMemberSchema.parse(raw)
  const existing = await ctx.db.sportsTeamMember.findFirst({
    where: { teamId: input.teamId, studentId: input.studentId },
  })
  if (existing) throw conflict('Student is already on this team')

  return ctx.db.sportsTeamMember.create({
    data: {
      tenantId: ctx.tenant.id,
      teamId: input.teamId,
      studentId: input.studentId,
      position: input.position ?? null,
      isCaptain: input.isCaptain,
    },
  })
}

export async function removeTeamMember(ctx: AppContext, id: string) {
  ctx.require('sports.manage')
  const row = await ctx.db.sportsTeamMember.findFirst({ where: { id } })
  if (!row) throw notFound('Member not found')
  await ctx.db.sportsTeamMember.delete({ where: { id } })
  return row
}

export async function sportsSetup(ctx: AppContext) {
  ctx.require('sports.manage')
  const students = await ctx.db.student.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, admissionNo: true },
    take: 400,
  })
  return { students }
}
