#!/usr/bin/env node
/**
 * Headless Windows Service entry for MyCampusView Tally Connector.
 */
import { runLoop, appendLog, writeStatus } from '../lib/agent.mjs'

process.title = 'MyCampusView Tally Connector Service'

process.on('uncaughtException', (err) => {
  appendLog(`uncaughtException: ${err?.stack || err}`)
  writeStatus({ serviceRunning: true, phase: 'error', lastError: String(err) })
})

process.on('unhandledRejection', (err) => {
  appendLog(`unhandledRejection: ${err?.stack || err}`)
})

appendLog('Service process booting')
await runLoop({ intervalMs: 5000 })
