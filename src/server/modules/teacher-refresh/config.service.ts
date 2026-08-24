import { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { UpdateTeacherRefreshConfigInput } from './schema'

export async function getTeacherRefreshConfig(ctx: AppContext) {
  ctx.require('teacher_refresh.configure')

  let config = await ctx.db.teacherRefreshConfig.findUnique({
    where: { tenantId: ctx.tenant.id },
  })

  if (!config) {
    config = await ctx.db.teacherRefreshConfig.create({
      data: { tenantId: ctx.tenant.id },
    })
  }

  return config
}

export async function updateTeacherRefreshConfig(ctx: AppContext, input: UpdateTeacherRefreshConfigInput) {
  ctx.require('teacher_refresh.configure')

  const before = await ctx.db.teacherRefreshConfig.findUnique({
    where: { tenantId: ctx.tenant.id },
  })

  const config = await ctx.db.teacherRefreshConfig.upsert({
    where: { tenantId: ctx.tenant.id },
    update: input,
    create: {
      tenantId: ctx.tenant.id,
      ...input,
    },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'teacher_refresh.configure',
    module: 'teacher_refresh',
    entityType: 'TeacherRefreshConfig',
    entityId: config.id,
    summary: 'Updated teacher knowledge refresh settings',
    before: before ?? undefined,
    after: config,
  })

  return config
}
