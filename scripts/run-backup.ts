/**
 * Cross-platform backup entry used by `npm run db:backup`.
 * Spawns the OS-specific pg_dump wrapper.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(__dirname, '..')
const isWin = process.platform === 'win32'
const script = isWin
  ? path.join(root, 'scripts', 'backup-db.ps1')
  : path.join(root, 'scripts', 'backup-db.sh')

const result = isWin
  ? spawnSync('powershell', ['-File', script, '-Label', process.argv[2] ?? 'manual'], {
      stdio: 'inherit',
      cwd: root,
      env: process.env,
    })
  : spawnSync('bash', [script, process.argv[2] ?? 'manual'], {
      stdio: 'inherit',
      cwd: root,
      env: process.env,
    })

process.exit(result.status ?? 1)
