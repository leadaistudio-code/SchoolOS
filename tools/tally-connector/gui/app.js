/* global mcvTally from preload */

function $(id) {
  return document.getElementById(id)
}

function showMessage(el, text, ok) {
  el.hidden = !text
  el.textContent = text || ''
  el.className = `message ${ok ? 'ok' : 'bad'}`
}

function setPill(el, text, tone) {
  el.textContent = text
  el.className = `pill ${tone === 'ok' ? 'pill-ok' : tone === 'bad' ? 'pill-bad' : tone === 'warn' ? 'pill-warn' : 'pill-muted'}`
}

function fmtTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

async function refresh() {
  const snap = await window.mcvTally.getSnapshot()
  const status = snap.status || {}
  const service = snap.service || {}

  $('versionLabel').textContent = `v${snap.version || '1.0.0'}`
  $('cloudUrl').value = snap.cloud || $('cloudUrl').value
  $('tallyHost').value = snap.tallyHost || '127.0.0.1'
  $('tallyPort').value = String(snap.tallyPort || 9000)

  if (snap.paired) {
    $('cloudStatus').textContent = status.cloudReachable === false ? 'Issue' : 'Connected'
    $('cloudDetail').textContent = snap.cloud || 'Paired'
  } else {
    $('cloudStatus').textContent = 'Not paired'
    $('cloudDetail').textContent = 'Enter pairing code'
  }

  if (status.tallyReachable === true) {
    $('tallyStatus').textContent = 'Online'
    $('tallyDetail').textContent = status.companyName
      ? status.companyName
      : `${snap.tallyHost}:${snap.tallyPort}`
  } else if (status.tallyReachable === false) {
    $('tallyStatus').textContent = 'Offline'
    $('tallyDetail').textContent = status.lastError || `${snap.tallyHost}:${snap.tallyPort}`
  } else {
    $('tallyStatus').textContent = 'Unknown'
    $('tallyDetail').textContent = `${snap.tallyHost}:${snap.tallyPort}`
  }

  if (service.running) {
    $('serviceStatus').textContent = 'Running'
    $('serviceDetail').textContent = 'Starts automatically at Windows boot'
  } else if (service.installed) {
    $('serviceStatus').textContent = 'Stopped'
    $('serviceDetail').textContent = service.state || 'Installed but not running'
  } else {
    $('serviceStatus').textContent = 'Not installed'
    $('serviceDetail').textContent = 'Install for auto-start at boot'
  }

  $('lastSync').textContent = status.lastSyncAt ? fmtTime(status.lastSyncAt) : '—'
  $('lastSyncDetail').textContent =
    status.lastCommandsProcessed != null
      ? `${status.lastCommandsProcessed} command(s) last cycle`
      : status.phase || 'Waiting'

  let health = 'Needs setup'
  let tone = 'warn'
  if (snap.paired && service.running && status.tallyReachable) {
    health = 'Healthy'
    tone = 'ok'
  } else if (snap.paired && (service.running || status.tallyReachable)) {
    health = 'Attention'
    tone = 'warn'
  } else if (!snap.paired) {
    health = 'Not paired'
    tone = 'muted'
  } else {
    health = 'Offline'
    tone = 'bad'
  }
  setPill($('overallHealth'), health, tone)

  const logs = await window.mcvTally.getLogsTail()
  $('logView').textContent = logs || 'No activity yet.'
}

function busy(button, on) {
  button.disabled = on
}

$('pairForm').addEventListener('submit', async (event) => {
  event.preventDefault()
  const btn = $('pairBtn')
  busy(btn, true)
  showMessage($('pairMessage'), '')
  try {
    await window.mcvTally.pair({
      cloud: $('cloudUrl').value.trim(),
      code: $('pairCode').value.trim(),
      tallyHost: $('tallyHost').value.trim(),
      tallyPort: Number($('tallyPort').value),
    })
    showMessage($('pairMessage'), 'Paired successfully. Install the Windows service for auto-start.', true)
    $('pairCode').value = ''
    await refresh()
  } catch (err) {
    showMessage($('pairMessage'), err?.message || String(err), false)
  } finally {
    busy(btn, false)
  }
})

$('saveEndpointBtn').addEventListener('click', async () => {
  try {
    await window.mcvTally.saveTallyEndpoint({
      tallyHost: $('tallyHost').value.trim(),
      tallyPort: Number($('tallyPort').value),
    })
    showMessage($('pairMessage'), 'Tally address saved.', true)
    await refresh()
  } catch (err) {
    showMessage($('pairMessage'), err?.message || String(err), false)
  }
})

$('syncBtn').addEventListener('click', async () => {
  const btn = $('syncBtn')
  busy(btn, true)
  try {
    const result = await window.mcvTally.syncNow()
    showMessage(
      $('opMessage'),
      `Sync complete. Processed ${result.processed} command(s). Tally ${result.tallyReachable ? 'online' : 'offline'}.`,
      true,
    )
    await refresh()
  } catch (err) {
    showMessage($('opMessage'), err?.message || String(err), false)
  } finally {
    busy(btn, false)
  }
})

$('testTallyBtn').addEventListener('click', async () => {
  const btn = $('testTallyBtn')
  busy(btn, true)
  try {
    const result = await window.mcvTally.testTally()
    showMessage(
      $('opMessage'),
      result.reachable
        ? `Tally reachable. Company: ${result.companyName || '(none loaded)'}`
        : `Tally not reachable. ${result.error || 'Is Tally open on this PC?'}`,
      !!result.reachable,
    )
    await refresh()
  } catch (err) {
    showMessage($('opMessage'), err?.message || String(err), false)
  } finally {
    busy(btn, false)
  }
})

$('installServiceBtn').addEventListener('click', async () => {
  const btn = $('installServiceBtn')
  busy(btn, true)
  try {
    await window.mcvTally.installService()
    showMessage($('opMessage'), 'Windows startup service installed and started (runs at boot as SYSTEM).', true)
    await refresh()
  } catch (err) {
    showMessage(
      $('opMessage'),
      `${err?.message || err}. Approve the Administrator prompt, and ensure Node.js is on PATH for the service host.`,
      false,
    )
  } finally {
    busy(btn, false)
  }
})

$('uninstallServiceBtn').addEventListener('click', async () => {
  const btn = $('uninstallServiceBtn')
  busy(btn, true)
  try {
    await window.mcvTally.uninstallService()
    showMessage($('opMessage'), 'Windows service removed.', true)
    await refresh()
  } catch (err) {
    showMessage($('opMessage'), err?.message || String(err), false)
  } finally {
    busy(btn, false)
  }
})

$('openLogsBtn').addEventListener('click', async () => {
  await window.mcvTally.openLogs()
})

refresh()
setInterval(refresh, 5000)
