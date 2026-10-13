/**
 * Install the MyCampusView Tally Connector auto-start service.
 * Uses a Windows Scheduled Task (At startup, SYSTEM) so schools do not need
 * a separate Node.js runtime. Must run elevated.
 *
 *   electron.exe service/install.cjs --execPath "C:\Program Files\...\MyCampusView Tally Connector.exe"
 */
const path = require('node:path')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

const TASK_NAME = 'MyCampusView Tally Connector'
const SERVICE_ID = 'MyCampusViewTallyConnector'

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : null
}

function wrapperPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'service', 'wrapper.cmd'),
    path.join(__dirname, 'wrapper.cmd'),
  ]
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return path.join(__dirname, 'wrapper.cmd')
}

function psEscape(value) {
  return String(value).replace(/'/g, "''")
}

function install() {
  const wrapper = wrapperPath()
  if (!fs.existsSync(wrapper)) {
    console.error('wrapper.cmd missing:', wrapper)
    process.exit(1)
  }

  const execPath = argValue('--execPath') || process.env.MCV_CONNECTOR_EXEC || process.execPath
  // Ensure wrapper can find the exe even in portable layouts by writing a local override.
  const override = path.join(path.dirname(wrapper), 'app-exe.path')
  fs.writeFileSync(override, execPath, 'utf8')

  // Update wrapper to prefer absolute exe when app-exe.path exists — handled below via a generated runner.
  const generated = path.join(path.dirname(wrapper), 'run-service.cmd')
  const runner = path.join(path.dirname(wrapper), 'runner.mjs')
  const content = `@echo off
setlocal
set ELECTRON_RUN_AS_NODE=1
set MCV_TALLY_CONNECTOR_SERVICE=1
"${execPath}" "${runner}"
endlocal
`
  fs.writeFileSync(generated, content, 'utf8')

  const ps = `
$ErrorActionPreference = 'Stop'
$taskName = '${psEscape(TASK_NAME)}'
$wrapper = '${psEscape(generated)}'
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ("/c `"`" + $wrapper + "`"`")
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'MyCampusView Tally Connector sync service. Keeps fee receipts synchronized with Tally.ERP 9. Port 9000 stays local.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Installed and started: $taskName"
`

  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
    { stdio: 'inherit', windowsHide: true },
  )
  console.log(`Auto-start service ready: "${TASK_NAME}"`)
}

module.exports = { TASK_NAME, SERVICE_ID, wrapperPath, install }

if (require.main === module) {
  try {
    install()
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
