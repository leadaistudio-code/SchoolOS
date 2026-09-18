import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classify,
  extractJson,
  normaliseAbsoluteRequestTarget,
  packetPayload,
} from './protocol.mjs'

test('normalises legacy absolute HTTP request targets without changing the body', () => {
  const body = Buffer.from('{"user_id":"34"}')
  const packet = Buffer.concat([
    Buffer.from(
      'POST http://zephyr.proxy.rlwy.net:42239/123456789012/hdata.aspx HTTP/1.1\r\n' +
        'dev_id: RSS20240887880\r\n\r\n',
    ),
    body,
  ])

  const normalised = normaliseAbsoluteRequestTarget(packet)
  assert.match(
    normalised.toString('utf8'),
    /^POST \/123456789012\/hdata\.aspx HTTP\/1\.1\r\n/,
  )
  assert.deepEqual(normalised.subarray(-body.length), body)
})

test('leaves standard origin-form request targets unchanged', () => {
  const packet = Buffer.from('POST /hdata.aspx HTTP/1.1\r\n\r\n')
  assert.equal(normaliseAbsoluteRequestTarget(packet), packet)
})

test('normalises the LF-only request line emitted by legacy RS9W firmware', () => {
  const packet = Buffer.from(
    'POST http://zephyr.proxy.rlwy.net:42239/123456789012/hdata.aspx HTTP/1.0\n' +
      'dev_id: RSS20240887880\r\n\r\n{}',
  )
  const normalised = normaliseAbsoluteRequestTarget(packet).toString('utf8')
  assert.match(normalised, /^POST \/123456789012\/hdata\.aspx HTTP\/1\.0\r\n/)
  assert.match(normalised, /dev_id: RSS20240887880\r\n\r\n\{\}$/)
})

test('normalises a carriage-return-only legacy request line', () => {
  const packet = Buffer.from(
    'POST http://zephyr.proxy.rlwy.net:42239/123456789012/hdata.aspx HTTP/1.0\r' +
      'dev_id: RSS20240887880\r\n\r\n{}',
  )
  assert.match(
    normaliseAbsoluteRequestTarget(packet).toString('utf8'),
    /^POST \/123456789012\/hdata\.aspx HTTP\/1\.0\r\n/,
  )
})

test('repairs keypad whitespace inserted inside a numeric endpoint path', () => {
  const packet = Buffer.from(
    'POST http://zephyr.proxy.rlwy.net:42239/1234567890 50/hdata.aspx HTTP/1.0\r\n\r\n',
  )
  assert.match(
    normaliseAbsoluteRequestTarget(packet).toString('utf8'),
    /^POST \/123456789050\/hdata\.aspx HTTP\/1\.0\r\n/,
  )
})

test('extracts framed JSON without reading braces in binary tail', () => {
  const json = Buffer.from('{"user_id":"00034","io_time":"2026-09-08 15:30:57","note":"} quoted"}')
  const prefix = Buffer.alloc(4)
  prefix.writeUInt32LE(json.length)
  const body = Buffer.concat([prefix, json, Buffer.from([0xff, 0x7d, 0x7b])])

  assert.deepEqual(extractJson(body), {
    user_id: '00034',
    io_time: '2026-09-08 15:30:57',
    note: '} quoted',
  })
})

test('maps EBKN attendance packet fields', () => {
  const body = Buffer.from(
    '{"user_id":"00034","io_time":"2026-09-08 15:30:57","io_mode":16777216}',
  )
  const payload = packetPayload(
    {
      request_code: 'realtime_glog',
      dev_id: 'RSS20240887880',
      trans_id: '17',
    },
    body,
    'fk_private_token',
    '203.0.113.10',
  )

  assert.equal(payload.protocol, 'EBKN_FKWEB')
  assert.equal(payload.kind, 'attendance')
  assert.equal(payload.deviceId, 'RSS20240887880')
  assert.equal(payload.event.externalUserId, '00034')
  assert.equal(payload.event.ioMode, '16777216')
  assert.match(payload.event.packetHash, /^[a-f0-9]{64}$/)
})

test('recognises legacy command and rejects unknown payload shape', () => {
  assert.equal(classify(null, 'RTLogSendAction', { user_id: '1' }), 'attendance')
  assert.equal(classify(null, null, { message: 'nothing useful' }), 'unknown')
  assert.equal(extractJson(Buffer.from([0, 1, 2, 3])), null)
})
