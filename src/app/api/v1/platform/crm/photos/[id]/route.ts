import { platformRoute } from '@/server/api/handler'
import { readCrmPhoto } from '@/server/modules/platform/growth/service'
import { fileResponse } from '@/server/modules/platform/mail/download'

export const GET = platformRoute(async (req, ctx, params) => fileResponse(req, await readCrmPhoto(ctx, params.id!)))
