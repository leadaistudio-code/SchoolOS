'use server'

import { revalidatePath } from 'next/cache'
import { z, ZodError } from 'zod'
import { requireContext } from '@/server/context'
import {
  createSession,
  sessionSchema,
  setCurrentSession,
  setSessionLock,
} from '@/server/modules/settings/sessions'
import {
  setTemporaryPassword,
  setUserRoles,
  setUserStatus,
  userRolesSchema,
  userStatusSchema,
} from '@/server/modules/settings/users'
import {
  createRole,
  deleteRole,
  roleSchema,
  rolePermissionsSchema,
  setRolePermissions,
} from '@/server/modules/settings/roles'
import { credentialSchema, saveCredential } from '@/server/modules/settings/integrations'
import { sendAccountLink } from '@/server/auth/reset'

/**
 * Server actions for the administrative settings screens.
 *
 * Grouped in one module because they share a shape and a failure story: each
 * one parses, calls a service that owns the rule, revalidates the page, and
 * returns a sentence the form can show. None of them decides policy — that
 * lives in the services, where the API routes reach it too.
 */
export type Result = { ok: true; message: string } | { ok: false; message: string }

const failure = (error: unknown, fallback: string): Result => ({
  ok: false,
  message:
    error instanceof ZodError
      ? (error.issues[0]?.message ?? fallback)
      : error instanceof Error
        ? error.message
        : fallback,
})

/* ------------------------------------------------------------- sessions */

export async function createSessionAction(payload: unknown): Promise<Result> {
  try {
    const ctx = await requireContext('academics.manage')
    const created = await createSession(ctx, sessionSchema.parse(payload))
    revalidatePath('/settings/sessions')
    return {
      ok: true,
      message: created.isCurrent
        ? `${created.name} created and made current.`
        : `${created.name} created.`,
    }
  } catch (error) {
    return failure(error, 'The session could not be created')
  }
}

export async function setCurrentSessionAction(id: string): Promise<Result> {
  try {
    const ctx = await requireContext('academics.manage')
    const updated = await setCurrentSession(ctx, id)
    // Almost every screen reads the current session, so this is one of the
    // few changes worth invalidating the whole app for.
    revalidatePath('/', 'layout')
    return { ok: true, message: `${updated.name} is now the current session.` }
  } catch (error) {
    return failure(error, 'The session could not be switched')
  }
}

export async function setSessionLockAction(id: string, isLocked: boolean): Promise<Result> {
  try {
    const ctx = await requireContext('academics.manage')
    const updated = await setSessionLock(ctx, id, isLocked)
    revalidatePath('/settings/sessions')
    return { ok: true, message: `${updated.name} ${isLocked ? 'locked' : 'unlocked'}.` }
  } catch (error) {
    return failure(error, 'The session could not be updated')
  }
}

/* ---------------------------------------------------------------- users */

export async function setUserStatusAction(payload: unknown): Promise<Result> {
  try {
    const ctx = await requireContext('users.edit')
    await setUserStatus(ctx, userStatusSchema.parse(payload))
    revalidatePath('/settings/users')
    return { ok: true, message: 'Account updated.' }
  } catch (error) {
    return failure(error, 'The account could not be updated')
  }
}

/**
 * Sends the invitation link that lets a new account set its own password.
 *
 * The alternative — an administrator typing a temporary password and reading
 * it out over the phone — means a real password travelling through a channel
 * nobody controls, so this is the path the users screen offers.
 */
export async function sendUserInviteAction(payload: unknown): Promise<Result> {
  try {
    const ctx = await requireContext('users.edit')
    const { id } = z.object({ id: z.string().min(1) }).parse(payload)
    const result = await sendAccountLink(id, {
      id: ctx.tenant.id,
      slug: ctx.tenant.slug,
      name: ctx.tenant.school?.name ?? ctx.tenant.name,
    })
    revalidatePath('/settings/users')
    return result.ok
      ? { ok: true, message: result.message }
      : { ok: false, message: result.message }
  } catch (error) {
    return failure(error, 'The invitation could not be sent')
  }
}

/**
 * Issues a temporary password for the office to hand over in person.
 *
 * Returns the plaintext, which is the one place in the product that ever does.
 * It is shown once, to the administrator who asked for it, and is not stored
 * anywhere - the alternative is a support ticket for every parent whose email
 * address was mistyped at enrolment.
 */
export async function setTemporaryPasswordAction(
  payload: unknown,
): Promise<Result & { password?: string; expiresAt?: string }> {
  try {
    const ctx = await requireContext('users.edit')
    const { id } = z.object({ id: z.string().min(1) }).parse(payload)
    const issued = await setTemporaryPassword(ctx, id)
    revalidatePath('/settings/users')
    return {
      ok: true,
      message: `Temporary password issued for ${issued.name}.`,
      password: issued.password,
      expiresAt: issued.expiresAt.toISOString(),
    }
  } catch (error) {
    return failure(error, 'The temporary password could not be issued')
  }
}

export async function setUserRolesAction(payload: unknown): Promise<Result> {
  try {
    const ctx = await requireContext('users.roles')
    await setUserRoles(ctx, userRolesSchema.parse(payload))
    revalidatePath('/settings/users')
    revalidatePath('/settings/roles')
    return { ok: true, message: 'Roles updated. They apply the next time this person signs in.' }
  } catch (error) {
    return failure(error, 'The roles could not be updated')
  }
}

/* ---------------------------------------------------------------- roles */

export async function createRoleAction(payload: unknown): Promise<Result> {
  try {
    const ctx = await requireContext('roles.manage')
    const created = await createRole(ctx, roleSchema.parse(payload))
    revalidatePath('/settings/roles')
    return { ok: true, message: `${created.name} created.` }
  } catch (error) {
    return failure(error, 'The role could not be created')
  }
}

export async function setRolePermissionsAction(payload: unknown): Promise<Result> {
  try {
    const ctx = await requireContext('roles.manage')
    await setRolePermissions(ctx, rolePermissionsSchema.parse(payload))
    revalidatePath('/settings/roles')
    return { ok: true, message: 'Permissions saved. They apply at each holder’s next sign-in.' }
  } catch (error) {
    return failure(error, 'The permissions could not be saved')
  }
}

export async function deleteRoleAction(id: string): Promise<Result> {
  try {
    const ctx = await requireContext('roles.manage')
    await deleteRole(ctx, id)
    revalidatePath('/settings/roles')
    return { ok: true, message: 'Role deleted.' }
  } catch (error) {
    return failure(error, 'The role could not be deleted')
  }
}

/* --------------------------------------------------------- integrations */

export async function saveIntegrationAction(payload: unknown): Promise<Result> {
  try {
    const ctx = await requireContext('settings.integrations')
    await saveCredential(ctx, credentialSchema.parse(payload))
    revalidatePath('/settings/integrations')
    return { ok: true, message: 'Credentials saved.' }
  } catch (error) {
    return failure(error, 'The credentials could not be saved')
  }
}
