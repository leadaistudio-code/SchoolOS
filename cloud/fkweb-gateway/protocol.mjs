import { createHash } from 'node:crypto'

/** Legacy FKWeb sends proxy-style `POST http://host/path HTTP/1.1`. */
export function normaliseAbsoluteRequestTarget(buffer) {
  const carriageReturn = buffer.indexOf(0x0d)
  const lineFeed = buffer.indexOf(0x0a)
  const lineEnd =
    carriageReturn < 0
      ? lineFeed
      : lineFeed < 0
        ? carriageReturn
        : Math.min(carriageReturn, lineFeed)
  if (lineEnd < 0) return buffer

  let restStart = lineEnd + 1
  if (buffer[lineEnd] === 0x0d && buffer[restStart] === 0x0a) restStart += 1
  const line = buffer.subarray(0, lineEnd).toString('ascii')
  const match = /^([A-Z]+) (https?:\/\/.+) (HTTP\/1\.[01])$/.exec(line)
  if (!match) return buffer

  try {
    // Numeric keypad entry on this RS9W firmware can insert a space in the
    // private path. Removing URL whitespace is safe because provisioned
    // endpoint tokens and FKWeb paths never contain whitespace.
    const parsed = new URL(match[2].replace(/\s+/g, ''))
    const target = `${parsed.pathname || '/'}${parsed.search}`
    const replacement = Buffer.from(`${match[1]} ${target} ${match[3]}\r\n`, 'ascii')
    return Buffer.concat([replacement, buffer.subarray(restStart)])
  } catch {
    return buffer
  }
}

/** Extract the first complete JSON object without being fooled by a binary tail. */
export function extractJson(body) {
  const start = body.indexOf(0x7b)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < body.length; index += 1) {
    const byte = body[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (inString) {
      if (byte === 0x5c) escaped = true
      else if (byte === 0x22) inString = false
      continue
    }
    if (byte === 0x22) inString = true
    else if (byte === 0x7b) depth += 1
    else if (byte === 0x7d && --depth === 0) {
      try {
        return JSON.parse(body.subarray(start, index + 1).toString('utf8'))
      } catch {
        return null
      }
    }
  }
  return null
}

function firstValue(json, ...names) {
  for (const name of names) {
    const value = json?.[name]
    if (typeof value === 'string' || typeof value === 'number') return String(value)
  }
  return null
}

export function classify(requestCode, commandId, json) {
  const code = String(requestCode || commandId || '').trim().toLowerCase()
  if (code.includes('realtime_glog') || code.includes('rtlog') || code.includes('logsend')) return 'attendance'
  if (code.includes('enroll')) return 'enrollment'
  if (code === 'receive_cmd') return 'command_poll'
  if (code === 'send_cmd_result') return 'command_result'
  if (json?.user_id != null && (json?.io_time != null || json?.time != null)) return 'attendance'
  if (json?.fk_info) return 'heartbeat'
  return 'unknown'
}

export function packetPayload(headers, body, token, sourceIp) {
  const requestCode = headers.request_code
  const commandId = headers.cmd_id
  const transactionId = headers.trans_id
  const deviceId = headers.dev_id
  const json = extractJson(body)
  const kind = classify(requestCode, commandId, json)
  const protocol = requestCode ? 'EBKN_FKWEB' : 'FKDATA_HS102'
  const packetHash = createHash('sha256').update(body).digest('hex')

  const event = kind === 'attendance'
    ? {
        externalUserId: firstValue(json, 'user_id', 'userId', 'pin', 'enroll_id', 'enrollid'),
        ioTime: firstValue(json, 'io_time', 'time', 'verify_time', 'timestamp', 'record_time'),
        ioMode: firstValue(json, 'io_mode', 'direction', 'in_out', 'status'),
        verifyMode: firstValue(json, 'verify_mode', 'verify_type', 'verification', 'verifymode'),
        deviceEventId: firstValue(json, 'log_id', 'record_id', 'event_id', 'id'),
        packetHash,
      }
    : null

  return {
    token,
    deviceId: String(deviceId || ''),
    sourceIp,
    protocol,
    kind,
    transactionId: transactionId ? String(transactionId) : null,
    requestCode: requestCode ? String(requestCode) : null,
    commandId: commandId ? String(commandId) : null,
    event,
  }
}
