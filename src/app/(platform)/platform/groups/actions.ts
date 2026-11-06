'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePlatformContext } from '@/server/context'
import {
  addGroupOwner,
  addSchoolToGroup,
  createGroup,
  deleteGroup,
  GroupError,
  removeGroupOwner,
  removeSchoolFromGroup,
  renameGroup,
} from '@/server/modules/platform/groups'

const text = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim()

async function run(groupId: string, work: () => Promise<unknown>) {
  try {
    await work()
  } catch (err) {
    if (err instanceof GroupError) redirect(`/platform/groups/${groupId}?error=${encodeURIComponent(err.message)}`)
    throw err
  }
  revalidatePath(`/platform/groups/${groupId}`)
  revalidatePath('/platform/groups')
}

export async function createGroupAction(formData: FormData) {
  const ctx = await requirePlatformContext('platform.tenants')
  const name = text(formData, 'name')
  if (!name) redirect(`/platform/groups?error=${encodeURIComponent('Enter a group name')}`)
  const group = await createGroup(ctx, name.slice(0, 120))
  redirect(`/platform/groups/${group.id}`)
}

export async function renameGroupAction(groupId: string, formData: FormData) {
  const ctx = await requirePlatformContext('platform.tenants')
  const name = text(formData, 'name')
  if (!name) return
  await run(groupId, () => renameGroup(ctx, groupId, name.slice(0, 120)))
}

export async function deleteGroupAction(groupId: string) {
  const ctx = await requirePlatformContext('platform.tenants')
  await deleteGroup(ctx, groupId)
  revalidatePath('/platform/groups')
  redirect('/platform/groups')
}

export async function addSchoolAction(groupId: string, formData: FormData) {
  const ctx = await requirePlatformContext('platform.tenants')
  const tenantId = text(formData, 'tenantId')
  if (!tenantId) return
  await run(groupId, () => addSchoolToGroup(ctx, groupId, tenantId))
}

export async function removeSchoolAction(groupId: string, tenantId: string) {
  const ctx = await requirePlatformContext('platform.tenants')
  await run(groupId, () => removeSchoolFromGroup(ctx, groupId, tenantId))
}

export async function addOwnerAction(groupId: string, formData: FormData) {
  const ctx = await requirePlatformContext('platform.tenants')
  await run(groupId, () => addGroupOwner(ctx, groupId, text(formData, 'tenantId'), text(formData, 'identifier')))
}

export async function removeOwnerAction(groupId: string, ownerId: string) {
  const ctx = await requirePlatformContext('platform.tenants')
  await run(groupId, () => removeGroupOwner(ctx, groupId, ownerId))
}
