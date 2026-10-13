import { platformRoute } from '@/server/api/handler'
import { readDocument } from '@/server/modules/platform/mail/service'
import { fileResponse } from '@/server/modules/platform/mail/download'

export const GET = platformRoute(async (req, ctx, params) => fileResponse(req, await readDocument(ctx, params.id!)))
