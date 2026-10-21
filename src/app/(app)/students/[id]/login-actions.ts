'use server'

import { revalidatePath } from 'next/cache'
import { requireContext } from '@/server/context'
import { issueStudentPortalLogin } from '@/server/modules/students/portal-login'

export type StudentLoginResult =
  | { ok: true; username: string; password: string; expiresAt: string; created: boolean }
  | { ok: false; message: string }

/**
 * Returns the plaintext password to the administrator's browser in the action
 * response only — never in a URL, where it would land in request logs.
 */
export async function issueStudentLoginAction(studentId: string): Promise<StudentLoginResult> {
  try {
    const ctx = await requireContext()
    const issued = await issueStudentPortalLogin(ctx, studentId)
    revalidatePath(`/students/${studentId}`)
    return {
      ok: true,
      username: issued.username,
      password: issued.password,
      expiresAt: issued.expiresAt.toISOString(),
      created: issued.created,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'The student login could not be issued',
    }
  }
}
