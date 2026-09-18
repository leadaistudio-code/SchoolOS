import http from 'node:http'
import net from 'node:net'
import { createHash } from 'node:crypto'
import { normaliseAbsoluteRequestTarget, packetPayload } from './protocol.mjs'

const PORT = Number(process.env.PORT || 8080)
const INGEST_URL = process.env.MCV_INGEST_URL
const GATEWAY_SECRET = process.env.FKWEB_GATEWAY_SECRET
const MAX_BODY_BYTES = Math.min(Number(process.env.FKWEB_MAX_BODY_BYTES || 1_048_576), 8_388_608)
const MAX_IN_FLIGHT = Math.min(Number(process.env.FKWEB_MAX_IN_FLIGHT || 32), 128)
const REQUEST_TIMEOUT_MS = Math.min(Number(process.env.FKWEB_REQUEST_TIMEOUT_MS || 15_000), 60_000)

if (!INGEST_URL || !GATEWAY_SECRET || GATEWAY_SECRET.length < 32) {
  console.error('MCV_INGEST_URL and FKWEB_GATEWAY_SECRET (32+ characters) are required')
  process.exit(1)
}

let inFlight = 0
const rateBuckets = new Map()
const validatedEndpoints = new Map()
const recentlyAuthenticatedDevices = new Map()
const observedPacketShapes = new Set()

function sourceIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  return (value || req.socket.remoteAddress || 'unknown').trim().replace(/^::ffff:/, '')
}

function allowedByRateLimit(ip) {
  const now = Date.now()
  if (rateBuckets.size > 10_000) {
    for (const [key, value] of rateBuckets) {
      if (value.resetAt <= now) rateBuckets.delete(key)
    }
    if (rateBuckets.size > 10_000) return false
  }
  const bucket = rateBuckets.get(ip)
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  bucket.count += 1
  return bucket.count <= 240
}

setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateBuckets) {
    if (value.resetAt <= now) rateBuckets.delete(key)
  }
  for (const [key, value] of validatedEndpoints) {
    if (now - value.validatedAt > 5 * 60_000) validatedEndpoints.delete(key)
  }
  for (const [key, value] of recentlyAuthenticatedDevices) {
    if (now - value.validatedAt > 5 * 60_000) recentlyAuthenticatedDevices.delete(key)
  }
}, 5 * 60_000).unref()

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Packet too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function endpointToken(req) {
  const url = new URL(req.url || '/', 'http://gateway.local')
  const match = /^\/(?:device\/)?([A-Za-z0-9_-]{10,200})\/hdata\.aspx$/i.exec(url.pathname)
  return match?.[1] || url.searchParams.get('token') || url.searchParams.get('t')
}

async function forward(payload) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(INGEST_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${GATEWAY_SECRET}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.data?.ok) {
      throw Object.assign(new Error(result?.error?.message || `Ingest returned ${response.status}`), {
        status: response.status,
      })
    }
    return result.data
  } finally {
    clearTimeout(timeout)
  }
}

function sendAck(res, payload) {
  const responseCode = payload.kind === 'command_poll' ? 'ERROR_NO_CMD' : 'OK'
  const headers = {
    'content-type': 'application/octet-stream',
    response_code: responseCode,
    connection: 'close',
  }
  if (payload.transactionId) headers.trans_id = payload.transactionId

  if (payload.protocol === 'EBKN_FKWEB') {
    res.writeHead(200, { ...headers, 'content-length': '0' })
    res.end()
    return
  }
  const text = payload.kind === 'attendance' || payload.kind === 'enrollment' ? 'result=OK' : 'OK'
  res.writeHead(200, { ...headers, 'content-length': String(Buffer.byteLength(text)) })
  res.end(text)
}

function reject(res, status, message) {
  if (res.headersSent) return res.destroy()
  res.writeHead(status, {
    'content-type': 'text/plain',
    connection: 'close',
    'content-length': String(Buffer.byteLength(message)),
  })
  res.end(message)
}

function logPacketShape(payload) {
  const shape = [
    payload.deviceId.slice(-4),
    payload.kind,
    payload.requestCode || '-',
    payload.commandId || '-',
  ].join('|')
  if (observedPacketShapes.has(shape)) return
  if (observedPacketShapes.size >= 5_000) observedPacketShapes.clear()
  observedPacketShapes.add(shape)
  console.log(
    `[packet-shape] device=...${payload.deviceId.slice(-4)} kind=${payload.kind}` +
      ` request=${payload.requestCode || '-'} command=${payload.commandId || '-'}`,
  )
}

const server = http.createServer(async (req, res) => {
  res.shouldKeepAlive = false
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain', 'content-length': '2' })
    res.end('ok')
    return
  }
  if (req.method !== 'POST') return reject(res, 404, 'Not found')
  if (inFlight >= MAX_IN_FLIGHT) return reject(res, 503, 'Busy')

  let token = endpointToken(req)
  if (!token) {
    const deviceId = String(req.headers.dev_id || '').trim().toUpperCase()
    const deviceKey = deviceId
      ? createHash('sha256').update(deviceId).digest('hex')
      : ''
    const recent = deviceKey ? recentlyAuthenticatedDevices.get(deviceKey) : null
    if (recent && Date.now() - recent.validatedAt < 5 * 60_000) {
      token = recent.token
    } else {
      console.warn(
        `[missing-token-path] device=...${deviceId.slice(-4) || 'none'}` +
          ` request=${req.headers.request_code || '-'} command=${req.headers.cmd_id || '-'}`,
      )
      return reject(res, 404, 'Unknown endpoint')
    }
  }
  const ip = sourceIp(req)
  const rateKey = createHash('sha256').update(`${ip}|${token}`).digest('hex')
  if (!allowedByRateLimit(rateKey)) return reject(res, 429, 'Too many packets')

  inFlight += 1
  try {
    const body = await readBody(req)
    const payload = packetPayload(req.headers, body, token, ip)
    if (!payload.deviceId) return reject(res, 403, 'Missing device identity')
    logPacketShape(payload)
    if (payload.kind === 'unknown') return reject(res, 422, 'Unknown FKWeb packet')
    if (payload.kind === 'attendance' && (!payload.event?.externalUserId || !payload.event?.ioTime)) {
      return reject(res, 422, 'Malformed attendance packet')
    }

    const cacheKey = createHash('sha256').update(`${token}|${payload.deviceId}|${ip}`).digest('hex')
    const cached = validatedEndpoints.get(cacheKey)
    const isNonAttendance = payload.kind !== 'attendance'
    if (isNonAttendance && cached && Date.now() - cached.validatedAt < 60_000) {
      sendAck(res, payload)
      return
    }

    await forward(payload)
    validatedEndpoints.set(cacheKey, { validatedAt: Date.now() })
    const deviceKey = createHash('sha256')
      .update(payload.deviceId.trim().toUpperCase())
      .digest('hex')
    recentlyAuthenticatedDevices.set(deviceKey, { token, validatedAt: Date.now() })
    sendAck(res, payload)
    if (payload.kind === 'attendance') {
      console.log(`[punch] device=...${payload.deviceId.slice(-4)} accepted ip=${ip}`)
    }
  } catch (error) {
    const status = Number(error?.status) || (error?.name === 'AbortError' ? 504 : 502)
    console.error(`[fkweb] ${error?.message || 'request failed'} ip=${ip}`)
    reject(res, status, 'Packet not accepted')
  } finally {
    inFlight -= 1
  }
})

server.requestTimeout = REQUEST_TIMEOUT_MS
server.headersTimeout = REQUEST_TIMEOUT_MS
server.on('clientError', (error, socket) => {
  const prefix = error.rawPacket?.subarray(0, 12).toString('hex') || 'none'
  console.error(`[http-parser] code=${error.code || 'unknown'} prefix=${prefix}`)
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
})

// Some RS9W firmware emits an HTTP-proxy-style absolute request target.
// Adapt only the first request line, then hand the socket to Node's hardened
// HTTP parser for all normal header/body limits and request handling.
const frontServer = net.createServer((socket) => {
  const chunks = []
  let size = 0

  const onData = (chunk) => {
    chunks.push(chunk)
    size += chunk.length
    const buffered = Buffer.concat(chunks)
    if (buffered.indexOf(0x0a) < 0 && buffered.indexOf(0x0d) < 0 && size <= 8_192) return

    socket.pause()
    socket.off('data', onData)
    if (size > 8_192) {
      socket.end('HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      return
    }

    const normalised = normaliseAbsoluteRequestTarget(buffered)
    if (normalised !== buffered) {
      console.log('[request-line] normalised absolute FKWeb target')
    } else if (buffered.subarray(0, 12).toString('ascii').startsWith('POST http://')) {
      const carriageReturn = buffered.indexOf(0x0d)
      const lineFeed = buffered.indexOf(0x0a)
      const ends = [carriageReturn, lineFeed].filter((index) => index >= 0)
      const lineEnd = ends.length ? Math.min(...ends) : Math.min(buffered.length, 512)
      const line = buffered.subarray(0, lineEnd).toString('ascii')
      const redacted = line.replace(
        /(https?:\/\/[^/\s]+)(?:\/[^ ]*)?/i,
        '$1/<redacted>',
      )
      console.warn(`[request-line-unmatched] ${JSON.stringify(redacted)}`)
    }
    socket.unshift(normalised)
    server.emit('connection', socket)
    socket.resume()
  }

  socket.on('data', onData)
  socket.setTimeout(REQUEST_TIMEOUT_MS, () => socket.destroy())
})

frontServer.listen(PORT, '0.0.0.0', () => {
  console.log(`MyCampusView FKWeb Cloud Gateway listening on :${PORT}`)
})

function shutdown() {
  frontServer.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
