import { route } from '@/server/api/handler'
import { INSTALLERS, installerResponse } from '@/server/installers'

export const runtime = 'nodejs'

/** GET /api/v1/biometric/connect-installer: the MyCampusView Connect setup .exe. */
export const GET = route(async () => installerResponse(INSTALLERS.connect), { permission: 'biometric.view' })
