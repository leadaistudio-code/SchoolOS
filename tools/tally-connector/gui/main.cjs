/**
 * Electron main process — MyCampusView Tally Connector desktop UI.
 */
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  dialog,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn, execFile } = require('node:child_process')
const { pathToFileURL } = require('node:url')

const APP_TITLE = 'MyCampusView Tally Connector'

let mainWindow = null
let tray = null
let isQuitting = false
let backgroundChild = null

function rootDir() {
  if (app.isPackaged) return process.resourcesPath
  return path.join(__dirname, '..')
}

function agentModuleUrl() {
  return pathToFileURL(path.join(rootDir(), 'lib', 'agent.mjs')).href
}

function pathsModuleUrl() {
  return pathToFileURL(path.join(rootDir(), 'lib', 'paths.mjs')).href
}

async function loadAgent() {
  return import(agentModuleUrl())
}

function iconPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'build', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, 'icon.png'),
  ]
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return null
}

function createWindow() {
  const icon = iconPath()
  mainWindow = new BrowserWindow({
    width: 920,
    height: 740,
    minWidth: 780,
    minHeight: 620,
    title: APP_TITLE,
    backgroundColor: '#eef3f4',
    autoHideMenuBar: true,
    show: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'index.html'))
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform === 'win32') {
      event.preventDefault()
      mainWindow.hide()
    }
  })
}

function createTray() {
  const icon = iconPath()
  const image = icon ? nativeImage.createFromPath(icon) : nativeImage.createEmpty()
  const trayImage = image.isEmpty()
    ? nativeImage.createFromDataURL(fallbackIconDataUrl())
    : image.resize({ width: 16, height: 16 })

  tray = new Tray(trayImage)
  tray.setToolTip(APP_TITLE)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open MyCampusView Tally Connector',
        click: () => {
          mainWindow?.show()
          mainWindow?.focus()
        },
      },
      { type: 'separator' },
      {
        label: 'Sync now',
        click: async () => {
          try {
            const agent = await loadAgent()
            await agent.runOnce()
          } catch (err) {
            dialog.showErrorBox(APP_TITLE, err instanceof Error ? err.message : String(err))
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true
          stopBackgroundWorker()
          app.quit()
        },
      },
    ]),
  )
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function fallbackIconDataUrl() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPElEQVQ4T2NkYGD4z0ABYBzVMKoBBgYGBob/DKQCmGYcNTBqAAMDw38GUgFMM44aGDUAAwPDfwZSAUwzAgQAAP//KQYGBf0Y2a0AAAAASUVORK5CYII='
}

/**
 * In-session background poller so sync works before the Windows service is
 * installed (and as a fallback when the service is stopped).
 */
function startBackgroundWorker() {
  if (backgroundChild || process.env.MCV_TALLY_CONNECTOR_SERVICE === '1') return

  const runner = path.join(rootDir(), 'service', 'runner.mjs')
  if (!fs.existsSync(runner)) return

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    MCV_TALLY_CONNECTOR_UI_WORKER: '1',
  }

  backgroundChild = spawn(process.execPath, [runner], {
    env,
    stdio: 'ignore',
    windowsHide: true,
  })

  backgroundChild.on('exit', () => {
    backgroundChild = null
    if (!isQuitting) {
      setTimeout(() => startBackgroundWorker(), 5000)
    }
  })
}

function stopBackgroundWorker() {
  if (!backgroundChild) return
  try {
    backgroundChild.kill()
  } catch {
    // ignore
  }
  backgroundChild = null
}

function runElevatedInstall(scriptRel) {
  return new Promise((resolve, reject) => {
    const script = path.join(rootDir(), scriptRel)
    if (!fs.existsSync(script)) {
      reject(new Error(`Missing ${scriptRel}. Reinstall the connector.`))
      return
    }

    const execPath = process.execPath
    const tempCmd = path.join(
      process.env.TEMP || process.env.TMP || 'C:\\Windows\\Temp',
      `mcv-tally-${scriptRel.includes('uninstall') ? 'un' : ''}install.cmd`,
    )
    const cmdBody = `@echo off
set ELECTRON_RUN_AS_NODE=1
set MCV_CONNECTOR_EXEC=${execPath}
"${execPath}" "${script}" --execPath "${execPath}"
exit /b %ERRORLEVEL%
`
    try {
      fs.writeFileSync(tempCmd, cmdBody, 'utf8')
    } catch (err) {
      reject(err)
      return
    }

    const ps = `
$ErrorActionPreference = 'Stop'
$p = Start-Process -FilePath '${tempCmd.replace(/'/g, "''")}' -Verb RunAs -Wait -PassThru
if ($null -eq $p) { exit 1 }
exit $p.ExitCode
`

    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true },
      (err, _stdout, stderr) => {
        try {
          fs.unlinkSync(tempCmd)
        } catch {
          // ignore
        }
        if (err) {
          reject(
            new Error(
              (stderr || err.message || '').toString().trim() ||
                'Elevation failed or was cancelled',
            ),
          )
        } else resolve({ ok: true })
      },
    )
  })
}

function queryServiceStatus() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ installed: false, running: false })
      return
    }
    const ps = `
$task = Get-ScheduledTask -TaskName 'MyCampusView Tally Connector' -ErrorAction SilentlyContinue
if (-not $task) { Write-Output 'MISSING'; exit 0 }
$info = Get-ScheduledTaskInfo -TaskName 'MyCampusView Tally Connector' -ErrorAction SilentlyContinue
$state = $task.State.ToString()
Write-Output ("FOUND|" + $state)
`
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve({ installed: false, running: false })
          return
        }
        const line = String(stdout || '').trim()
        if (!line.startsWith('FOUND|')) {
          resolve({ installed: false, running: false })
          return
        }
        const state = line.split('|')[1] || ''
        resolve({
          installed: true,
          running: /running/i.test(state),
          state,
        })
      },
    )
  })
}

function enableOpenAtLogin() {
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      name: APP_TITLE,
      path: process.execPath,
      args: app.isPackaged ? [] : ['.'],
    })
  } catch {
    // ignore on non-Windows
  }
}

function registerIpc() {
  ipcMain.handle('get-snapshot', async () => {
    const agent = await loadAgent()
    const paths = await import(pathsModuleUrl())
    const state = agent.loadState()
    let status = {}
    try {
      if (fs.existsSync(paths.statusPath())) {
        status = JSON.parse(fs.readFileSync(paths.statusPath(), 'utf8'))
      }
    } catch {
      status = {}
    }
    const service = await queryServiceStatus()
    return {
      paired: Boolean(state?.secret),
      cloud: state?.cloud || '',
      connectorKey: state?.connectorKey || '',
      tallyHost: state?.tallyHost || '127.0.0.1',
      tallyPort: state?.tallyPort || 9000,
      status,
      service,
      version: paths.CONNECTOR_VERSION || '1.0.0',
      dataDir: paths.dataDir(),
    }
  })

  ipcMain.handle('pair', async (_evt, payload) => {
    const agent = await loadAgent()
    const result = await agent.pairWithCloud(payload)
    startBackgroundWorker()
    return result
  })

  ipcMain.handle('save-tally-endpoint', async (_evt, payload) => {
    const agent = await loadAgent()
    const state = agent.loadState() || {}
    const next = {
      ...state,
      tallyHost: String(payload.tallyHost || '127.0.0.1').trim(),
      tallyPort: Number(payload.tallyPort) || 9000,
    }
    agent.saveState(next)
    return next
  })

  ipcMain.handle('test-tally', async () => {
    const agent = await loadAgent()
    const state = agent.loadState()
    if (!state) throw new Error('Pair the connector first.')
    return agent.probeTally(state)
  })

  ipcMain.handle('sync-now', async () => {
    const agent = await loadAgent()
    return agent.runOnce()
  })

  ipcMain.handle('install-service', async () => {
    // Stop in-process worker so the Windows service owns the loop.
    stopBackgroundWorker()
    return runElevatedInstall(path.join('service', 'install.cjs'))
  })

  ipcMain.handle('uninstall-service', async () => {
    const result = await runElevatedInstall(path.join('service', 'uninstall.cjs'))
    startBackgroundWorker()
    return result
  })

  ipcMain.handle('service-status', async () => queryServiceStatus())

  ipcMain.handle('open-logs', async () => {
    const paths = await import(pathsModuleUrl())
    const dir = paths.dataDir()
    if (!fs.existsSync(paths.logPath())) fs.writeFileSync(paths.logPath(), '', 'utf8')
    await shell.openPath(dir)
    return { ok: true, dir }
  })

  ipcMain.handle('get-logs-tail', async () => {
    const paths = await import(pathsModuleUrl())
    if (!fs.existsSync(paths.logPath())) return ''
    return fs.readFileSync(paths.logPath(), 'utf8').slice(-8000)
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    registerIpc()
    enableOpenAtLogin()
    createWindow()
    createTray()

    try {
      const agent = await loadAgent()
      if (agent.loadState()?.secret) startBackgroundWorker()
    } catch {
      // ignore until paired
    }
  })

  app.on('before-quit', () => {
    isQuitting = true
    stopBackgroundWorker()
  })

  app.on('window-all-closed', (e) => {
    if (process.platform === 'win32') e.preventDefault()
  })
}
