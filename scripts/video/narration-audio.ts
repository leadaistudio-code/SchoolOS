import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { NARRATION_VOICE, spoken } from '../../src/lib/lms/robotics101/narration'

export const SAMPLE_RATE = 24_000
export const RATE = '-8%'
export const CLIP_DIR = path.resolve(__dirname, '../../.tmp-diag/narration')

/** Cached clip for one narration line; the key covers everything that changes the audio. */
export function clipPath(text: string) {
  const key = createHash('sha1').update(`${NARRATION_VOICE}|${RATE}|${spoken(text)}`).digest('hex').slice(0, 16)
  return path.join(CLIP_DIR, `${key}.wav`)
}

/** 16-bit mono PCM samples from a WAV file. */
export function readWav(file: string) {
  const buf = readFileSync(file)
  let at = 12
  while (at < buf.length - 8) {
    const id = buf.toString('ascii', at, at + 4)
    const size = buf.readUInt32LE(at + 4)
    if (id === 'data') {
      const bytes = buf.subarray(at + 8, at + 8 + size)
      return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length))
    }
    at += 8 + size + (size % 2)
  }
  throw new Error(`${file}: no data chunk`)
}

export function writeWav(file: string, samples: Int16Array) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + samples.byteLength, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(samples.byteLength, 40)
  writeFileSync(file, Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]))
}

/** Drops leading and trailing silence, keeping a few milliseconds of air. */
export function trimSilence(samples: Int16Array, threshold = 400) {
  let start = 0
  let end = samples.length - 1
  while (start < end && Math.abs(samples[start]!) < threshold) start++
  while (end > start && Math.abs(samples[end]!) < threshold) end--
  const pad = Math.round(SAMPLE_RATE * 0.04)
  return samples.slice(Math.max(0, start - pad), Math.min(samples.length, end + pad))
}
