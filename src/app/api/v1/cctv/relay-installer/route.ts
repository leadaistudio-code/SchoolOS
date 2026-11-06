import { route } from '@/server/api/handler'
import { INSTALLERS, installerResponse } from '@/server/installers'

export const runtime = 'nodejs'

/** GET /api/v1/cctv/relay-installer: the MyCampusView CCTV Relay .exe. */
export const GET = route(async () => installerResponse(INSTALLERS.cctvRelay), { permission: 'cctv.manage' })
