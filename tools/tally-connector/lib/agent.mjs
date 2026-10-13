import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { hostname as osHostname } from 'node:os'
import {
  CONNECTOR_VERSION,
  logPath,
  statePath,
  statusPath,
} from './paths.mjs'

export function loadState() {
  const path = statePath()
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

export function saveState(state) {
  writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
}

export function writeStatus(patch) {
  const prev = existsSync(statusPath())
    ? (() => {
        try {
          return JSON.parse(readFileSync(statusPath(), 'utf8'))
        } catch {
          return {}
        }
      })()
    : {}
  const next = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
    version: CONNECTOR_VERSION,
  }
  writeFileSync(statusPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

export function appendLog(line) {
  const stamp = new Date().toISOString()
  try {
    appendFileSync(logPath(), `[${stamp}] ${line}\n`, 'utf8')
  } catch {
    // ignore log IO errors
  }
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
}

function cleanName(value) {
  if (value == null) return null
  const cleaned = decodeXml(String(value).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
  return cleaned.length ? cleaned : null
}

function firstTag(body, tag) {
  const m = body.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? m[1] : null
}

// Tag must end at whitespace or ">" so <COMPANYNAME> never matches <COMPANYNAME.LIST>.
function parseNames(body, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi')
  const out = []
  let m
  while ((m = re.exec(body))) {
    const name = cleanName(m[1])
    if (name && name.length < 200) out.push(name)
  }
  return [...new Set(out)]
}

function parseLedgers(body) {
  const re = /<LEDGER((?:\s[^>]*)?)>([\s\S]*?)<\/LEDGER>/gi
  const rows = new Map()
  let m
  while ((m = re.exec(body))) {
    const attrName = (m[1] || '').match(/\bNAME="([^"]*)"/i)?.[1]
    const name = cleanName(attrName) || cleanName(firstTag(m[2] || '', 'NAME'))
    if (!name || rows.has(name)) continue
    rows.set(name, {
      name,
      parent: cleanName(firstTag(m[2] || '', 'PARENT')),
      guid: cleanName(firstTag(m[2] || '', 'GUID')),
      isParty: false,
    })
  }
  if (rows.size === 0) {
    for (const name of parseNames(body, 'NAME')) rows.set(name, { name, parent: null, guid: null, isParty: false })
  }
  return [...rows.values()]
}

async function postXml(tallyBase, xml, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(tallyBase, {
      method: 'POST',
      headers: { 'content-type': 'application/xml' },
      body: xml,
      signal: controller.signal,
    })
    const body = await res.text()
    return { status: res.status, body }
  } finally {
    clearTimeout(timer)
  }
}

function listCompaniesXml() {
  return `<?xml version="1.0"?><ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE><ID>List of Companies</ID></HEADER><BODY><DESC></DESC></BODY></ENVELOPE>`
}

function listLedgersXml(company) {
  return `<?xml version="1.0"?><ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>MCV Ledger List</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="MCV Ledger List" ISMODIFY="No"><TYPE>Ledger</TYPE><FETCH>Name, Parent, Guid</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`
}

function collectionXml(company, id, type, fetch, { fromDate, toDate } = {}) {
  const period =
    (fromDate ? `<SVFROMDATE TYPE="Date">${escapeXml(fromDate)}</SVFROMDATE>` : '') +
    (toDate ? `<SVTODATE TYPE="Date">${escapeXml(toDate)}</SVTODATE>` : '')
  return `<?xml version="1.0"?><ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>${escapeXml(id)}</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>${period}<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="${escapeXml(id)}" ISMODIFY="No"><TYPE>${type}</TYPE><FETCH>${fetch}</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`
}

// Tally amounts: negative = Debit. Some builds append "Dr"/"Cr" instead of a sign.
export function parseAmount(raw) {
  const text = cleanName(raw)
  if (!text) return 0
  const dr = /\bDr\b/i.test(text)
  const cr = /\bCr\b/i.test(text)
  const n = Number(text.replace(/[^0-9.\-]/g, ''))
  if (!Number.isFinite(n)) return 0
  if (dr) return -Math.abs(n)
  if (cr) return Math.abs(n)
  return n
}

export function parseBalances(body) {
  const re = /<LEDGER((?:\s[^>]*)?)>([\s\S]*?)<\/LEDGER>/gi
  const rows = new Map()
  let m
  while ((m = re.exec(body))) {
    const inner = m[2] || ''
    const name = cleanName((m[1] || '').match(/\bNAME="([^"]*)"/i)?.[1]) || cleanName(firstTag(inner, 'NAME'))
    if (!name || rows.has(name)) continue
    rows.set(name, {
      name,
      parent: cleanName(firstTag(inner, 'PARENT')),
      closing: parseAmount(firstTag(inner, 'CLOSINGBALANCE')),
    })
  }
  return rows
}

function parseGroups(body) {
  const re = /<GROUP((?:\s[^>]*)?)>([\s\S]*?)<\/GROUP>/gi
  const out = []
  let m
  while ((m = re.exec(body))) {
    const inner = m[2] || ''
    const name = cleanName((m[1] || '').match(/\bNAME="([^"]*)"/i)?.[1]) || cleanName(firstTag(inner, 'NAME'))
    if (name) out.push({ name, parent: cleanName(firstTag(inner, 'PARENT')) })
  }
  return out
}

async function fetchBalances(tallyBase, company, payload) {
  const { fromDate, toDate, openingAsOf } = payload
  if (!fromDate || !toDate) throw new Error('Trial balance request is missing its date range')
  const fields = 'Name, Parent, ClosingBalance'
  const closingRes = await postXml(
    tallyBase,
    collectionXml(company, 'MCV TB Closing', 'Ledger', fields, { fromDate, toDate }),
    120000,
  )
  const lineError = cleanName(firstTag(closingRes.body, 'LINEERROR'))
  if (lineError) throw new Error(`Tally: ${lineError}`)
  const closing = parseBalances(closingRes.body)
  if (closing.size === 0) {
    throw new Error(`Tally returned no ledger balances for "${company}". Make sure this company is open in Tally.`)
  }

  let opening = new Map()
  if (openingAsOf) {
    const openingRes = await postXml(
      tallyBase,
      collectionXml(company, 'MCV TB Opening', 'Ledger', fields, { fromDate: openingAsOf, toDate: openingAsOf }),
      120000,
    )
    opening = parseBalances(openingRes.body)
  }

  const groupsRes = await postXml(tallyBase, collectionXml(company, 'MCV TB Groups', 'Group', 'Name, Parent'), 60000)
  const groups = parseGroups(groupsRes.body)

  const ledgers = [...closing.values()].map((row) => ({
    name: row.name,
    parent: row.parent,
    opening: opening.get(row.name)?.closing ?? 0,
    closing: row.closing,
  }))
  appendLog(`Fetched trial balance for "${company}" ${fromDate}-${toDate}: ${ledgers.length} ledgers`)
  return { fromDate, toDate, openingAsOf: openingAsOf || null, company, ledgers: ledgers.slice(0, 5000), groups: groups.slice(0, 2000) }
}

function buildVoucherXml(company, voucher) {
  const entries = (voucher.lines || [])
    .map((line) => {
      const amount = line.isDebit ? line.amount : -Math.abs(line.amount)
      return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${escapeXml(line.ledgerName)}</LEDGERNAME><ISDEEMEDPOSITIVE>${line.isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${Number(amount).toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`
    })
    .join('')
  return `<?xml version="1.0"?><ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER><BODY><DESC><STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY></STATICVARIABLES></DESC><DATA><TALLYMESSAGE><VOUCHER VCHTYPE="${escapeXml(voucher.voucherType || 'Receipt')}" ACTION="Create"><DATE>${escapeXml(voucher.date)}</DATE><NARRATION>${escapeXml(voucher.narration || '')}</NARRATION><VOUCHERTYPENAME>${escapeXml(voucher.voucherType || 'Receipt')}</VOUCHERTYPENAME>${entries}</VOUCHER></TALLYMESSAGE></DATA></BODY></ENVELOPE>`
}

export async function api(cloud, path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${String(cloud).replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `HTTP ${res.status}`)
  }
  return json.data
}

export async function pairWithCloud({ code, cloud, tallyHost = '127.0.0.1', tallyPort = 9000 }) {
  const data = await api(cloud, '/api/v1/tally-connector/pair', {
    method: 'POST',
    body: {
      code: String(code).trim(),
      hostname: process.env.COMPUTERNAME || osHostname() || 'windows',
      osInfo: `${process.platform} ${process.arch}`,
      connectorVersion: CONNECTOR_VERSION,
      name: 'MyCampusView Tally Connector',
      tallyHost,
      tallyPort: Number(tallyPort) || 9000,
    },
  })
  const state = {
    cloud: String(cloud).replace(/\/$/, ''),
    connectorId: data.connectorId,
    connectorKey: data.connectorKey,
    secret: data.secret,
    tallyHost: data.tallyHost || tallyHost,
    tallyPort: data.tallyPort || Number(tallyPort) || 9000,
    pairedAt: new Date().toISOString(),
  }
  saveState(state)
  writeStatus({
    paired: true,
    cloud: state.cloud,
    connectorKey: state.connectorKey,
    lastError: null,
    phase: 'paired',
  })
  appendLog(`Paired with ${state.cloud} as ${state.connectorKey}`)
  return state
}

export async function probeTally(state) {
  const tallyBase = `http://${state.tallyHost || '127.0.0.1'}:${state.tallyPort || 9000}`
  try {
    const probe = await postXml(tallyBase, listCompaniesXml())
    const companies = parseNames(probe.body, 'COMPANYNAME')
    return {
      reachable: probe.status >= 200 && probe.status < 300,
      companies,
      companyName: companies[0] || null,
      tallyBase,
    }
  } catch (err) {
    return {
      reachable: false,
      companies: [],
      companyName: null,
      tallyBase,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function executeCommand(tallyBase, cmd) {
  if (cmd.type === 'TEST_CONNECTION' || cmd.type === 'LIST_COMPANIES') {
    const probe = await postXml(tallyBase, listCompaniesXml())
    const companies = parseNames(probe.body, 'COMPANYNAME').map((name) => ({ name }))
    return {
      ok: companies.length > 0,
      companies,
      companyLoaded: companies.length > 0,
      selectedCompany: companies[0]?.name ?? null,
    }
  }

  if (cmd.type === 'FETCH_MASTERS') {
    const company =
      cleanName(cmd.payload?.companyName) ||
      (await postXml(tallyBase, listCompaniesXml()).then((r) => parseNames(r.body, 'COMPANYNAME')[0]))
    if (!company) throw new Error('No company loaded in Tally')
    const res = await postXml(tallyBase, listLedgersXml(company), 60000)
    const ledgers = parseLedgers(res.body)
    if (ledgers.length === 0) {
      const lineError = cleanName(firstTag(res.body, 'LINEERROR'))
      throw new Error(
        lineError
          ? `Tally: ${lineError}`
          : `Tally returned no ledgers for company "${company}". Make sure this company is open in Tally.`,
      )
    }
    appendLog(`Fetched ${ledgers.length} ledgers from "${company}"`)
    return { ledgers: ledgers.slice(0, 5000) }
  }

  if (cmd.type === 'FETCH_BALANCES') {
    const company =
      cleanName(cmd.payload?.companyName) ||
      (await postXml(tallyBase, listCompaniesXml()).then((r) => parseNames(r.body, 'COMPANYNAME')[0]))
    if (!company) throw new Error('No company loaded in Tally')
    return fetchBalances(tallyBase, company, cmd.payload || {})
  }

  if (cmd.type === 'CREATE_RECEIPT_VOUCHER' || cmd.type === 'CREATE_PAYMENT_VOUCHER') {
    const voucher = cmd.payload?.voucher
    const company = cmd.payload?.companyName
    if (!voucher || !company) throw new Error('Missing voucher payload')
    const xml = buildVoucherXml(company, voucher)
    const res = await postXml(tallyBase, xml, 30000)
    if (/<LINEERROR>/i.test(res.body)) {
      const m = res.body.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/i)
      throw new Error(m?.[1]?.trim() || 'Tally rejected voucher')
    }
    const created = Number((res.body.match(/<CREATED>([\s\S]*?)<\/CREATED>/i) || [])[1] || 0)
    if (created < 1 && !/<ALTERED>\s*[1-9]/i.test(res.body)) {
      throw new Error('Tally did not create the voucher (no LINEERROR returned)')
    }
    // <CREATED> is a count, not a voucher number — Tally assigns its own numbering.
    const voucherNumber = cleanName((res.body.match(/<VOUCHERNUMBER>([\s\S]*?)<\/VOUCHERNUMBER>/i) || [])[1]) || null
    return { voucherNumber, rawSnippet: res.body.slice(0, 500) }
  }

  return { ok: true, skipped: true, type: cmd.type }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * One poll cycle — used by the service loop and by "Sync now" from the GUI.
 */
export async function runOnce(state = loadState()) {
  if (!state?.secret || !state?.cloud) {
    throw new Error('Not paired. Open the connector and enter your pairing code first.')
  }

  const tally = await probeTally(state)
  writeStatus({
    paired: true,
    cloud: state.cloud,
    connectorKey: state.connectorKey,
    tallyReachable: tally.reachable,
    companyName: tally.companyName,
    tallyHost: state.tallyHost,
    tallyPort: state.tallyPort,
    phase: 'polling',
    lastPollAt: new Date().toISOString(),
    lastError: tally.reachable ? null : tally.error || 'Tally not reachable',
  })

  await api(state.cloud, '/api/v1/tally-connector/heartbeat', {
    method: 'POST',
    token: state.secret,
    body: {
      connectorVersion: CONNECTOR_VERSION,
      hostname: process.env.COMPUTERNAME || osHostname() || 'windows',
      osInfo: `${process.platform} ${process.arch}`,
      tallyHost: state.tallyHost,
      tallyPort: state.tallyPort,
      tallyReachable: tally.reachable,
      companyName: tally.companyName,
    },
  })

  const commands = await api(state.cloud, '/api/v1/tally-connector/commands', {
    token: state.secret,
  })

  let processed = 0
  for (const cmd of commands || []) {
    appendLog(`Command ${cmd.type} ${cmd.id}`)
    try {
      const result = await executeCommand(tally.tallyBase, cmd)
      await api(state.cloud, `/api/v1/tally-connector/commands/${cmd.id}/result`, {
        method: 'POST',
        token: state.secret,
        body: { status: 'SUCCEEDED', result },
      })
      processed++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      appendLog(`Command failed ${cmd.id}: ${message}`)
      await api(state.cloud, `/api/v1/tally-connector/commands/${cmd.id}/result`, {
        method: 'POST',
        token: state.secret,
        body: {
          status: 'FAILED',
          error: message,
          errorCode: 'TALLY_OFFLINE',
        },
      })
    }
  }

  writeStatus({
    lastSyncAt: new Date().toISOString(),
    lastCommandsProcessed: processed,
    cloudReachable: true,
    phase: 'idle',
  })

  return { processed, tallyReachable: tally.reachable, companyName: tally.companyName }
}

/**
 * Long-running service loop. Never exits unless the process is stopped.
 */
export async function runLoop({ intervalMs = 5000, onTick } = {}) {
  appendLog('Service loop started')
  writeStatus({ serviceRunning: true, phase: 'starting' })

  for (;;) {
    try {
      const state = loadState()
      if (!state?.secret) {
        writeStatus({
          paired: false,
          serviceRunning: true,
          phase: 'waiting_for_pair',
          lastError: 'Waiting for pairing from the desktop app',
        })
      } else {
        const result = await runOnce(state)
        if (typeof onTick === 'function') onTick(result)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      appendLog(`Loop error: ${message}`)
      writeStatus({
        serviceRunning: true,
        cloudReachable: false,
        lastError: message,
        phase: 'error',
      })
    }
    await sleep(intervalMs)
  }
}
