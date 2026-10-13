/**
 * Remove the MyCampusView Tally Connector auto-start service (elevated).
 */
const { execFileSync } = require('node:child_process')
const { TASK_NAME } = require('./install.cjs')

const ps = `
$ErrorActionPreference = 'Continue'
$taskName = '${TASK_NAME.replace(/'/g, "''")}'
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Output "Removed: $taskName"
`

try {
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { stdio: 'inherit', windowsHide: true },
  )
  console.log(`Uninstalled "${TASK_NAME}".`)
  process.exit(0)
} catch (err) {
  console.error(err)
  process.exit(1)
}
