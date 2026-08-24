import { AppContext } from '@/server/context'
import { UpdateTeacherRefreshConfigInput } from './schema'

export async function getTeacherRefreshConfig(ctx: AppContext) {
  // Requires admin settings access or a specific permission
  ctx.requireAny(['settings.manage', 'school.manage'])
  
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
  ctx.require('settings.manage')

  return ctx.db.teacherRefreshConfig.upsert({
    where: { tenantId: ctx.tenant.id },
    update: input,
    create: {
      tenantId: ctx.tenant.id,
      ...input,
    },
  })
}
