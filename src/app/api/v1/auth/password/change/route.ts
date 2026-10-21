import { z } from 'zod'
import { route } from '@/server/api/handler'
import { ok, ApiException } from '@/server/api/response'
import { changeOwnPassword } from '@/server/auth/change-password'
import { rateLimit, RATE_LIMITS } from '@/server/rate-limit'

const schema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(1, 'Enter a new password'),
})

/**
 * POST /api/v1/auth/password/change
 *
 * The signed-in user changes their own password; this is how a temporary
 * password is replaced on mobile. Must stay reachable while
 * `mustChangePassword` is set. The calling session is kept and every other
 * one is revoked.
 */
export const POST = route(async (req, ctx) => {
  const limited = await rateLimit(
    `password-change:${ctx.user.userId}`,
    RATE_LIMITS.passwordReset.limit,
    RATE_LIMITS.passwordReset.windowSeconds,
  )
  if (!limited.ok) {
    throw new ApiException(429, 'RATE_LIMITED', 'Too many attempts. Please wait a few minutes.')
  }

  const body = schema.parse(await req.json())
  const result = await changeOwnPassword(ctx, body.currentPassword, body.newPassword)
  if (!result.ok) {
    throw new ApiException(
      result.field ? 422 : 400,
      result.field === 'currentPassword' ? 'WRONG_PASSWORD' : result.field ? 'WEAK_PASSWORD' : 'PASSWORD_DISABLED',
      result.message,
    )
  }

  return ok({ passwordChanged: true })
})
