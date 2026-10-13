#!/usr/bin/env node
/**
 * CLI entry (dev / advanced). Prefer the Windows GUI installer for schools.
 *
 *   node index.mjs pair --code MCVT-XXXX-XXXX --cloud https://school.example.com
 *   node index.mjs run
 *   node index.mjs once
 */
import { pairWithCloud, runLoop, runOnce, loadState } from './lib/agent.mjs'

function argValue(args, flag) {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : null
}

const [, , cmd, ...rest] = process.argv

if (cmd === 'pair') {
  const code = argValue(rest, '--code')
  const cloud = argValue(rest, '--cloud')
  const tallyHost = argValue(rest, '--tally-host') || '127.0.0.1'
  const tallyPort = Number(argValue(rest, '--tally-port') || 9000)
  if (!code || !cloud) {
    console.error('Usage: node index.mjs pair --code MCVT-XXXX-XXXX --cloud https://school.example.com')
    process.exit(1)
  }
  const state = await pairWithCloud({ code, cloud, tallyHost, tallyPort })
  console.log(`Paired as ${state.connectorKey}`)
} else if (cmd === 'run') {
  await runLoop({ intervalMs: 5000 })
} else if (cmd === 'once') {
  const result = await runOnce(loadState())
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`MyCampusView Tally Connector

  node index.mjs pair --code MCVT-XXXX-XXXX --cloud https://school.example.com
  node index.mjs run
  node index.mjs once

For schools, install MyCampusView-Tally-Connector-Setup-1.0.2.exe
`)
}
