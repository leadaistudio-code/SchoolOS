import { nextContext } from '@/server/context/next'
import { getTeacherRefreshConfig, updateTeacherRefreshConfig } from '@/server/modules/teacher-refresh/config.service'
import { updateTeacherRefreshConfigSchema } from '@/server/modules/teacher-refresh/schema'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const ctx = await nextContext(req)
  const config = await getTeacherRefreshConfig(ctx)
  return NextResponse.json(config)
}

export async function PUT(req: Request) {
  const ctx = await nextContext(req)
  const body = await req.json()
  const input = updateTeacherRefreshConfigSchema.parse(body)
  const config = await updateTeacherRefreshConfig(ctx, input)
  return NextResponse.json(config)
}
