/**
 * Shared paths for GUI + Windows Service.
 * Config lives under ProgramData so the service (SYSTEM) and the desktop GUI
 * can both read/write without fighting UAC on Program Files.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const APP_NAME = 'MyCampusView Tally Connector'
export const SERVICE_NAME = 'MyCampusView Tally Connector'
export const SERVICE_ID = 'MyCampusViewTallyConnector'
export const CONNECTOR_VERSION = '1.0.2'

function programDataRoot() {
  if (process.platform === 'win32') {
    return process.env.PROGRAMDATA || 'C:\\ProgramData'
  }
  return join(homedir(), '.local', 'share')
}

export function dataDir() {
  const dir = join(programDataRoot(), 'MyCampusView', 'TallyConnector')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function statePath() {
  return join(dataDir(), 'connector.json')
}

export function statusPath() {
  return join(dataDir(), 'status.json')
}

export function logPath() {
  return join(dataDir(), 'connector.log')
}

export function installDirHint() {
  if (process.platform === 'win32') {
    return join(process.env['ProgramFiles'] || 'C:\\Program Files', APP_NAME)
  }
  return process.cwd()
}
