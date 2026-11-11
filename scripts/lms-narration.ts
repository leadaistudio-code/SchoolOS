/**
 * Course video narration: synthesises every line of every video script with
 * Azure Neural TTS (the same voice the app's assistant uses) and records how
 * long each clip is. The video timeline is built from those lengths, so the
 * picture, captions and voice stay in step.
 *
 *   AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=… npx tsx scripts/lms-narration.ts [--course ai-young-builders] [v01 v04 …]
 *
 * Clips are cached by content in .tmp-diag/narration, so re-running only
 * synthesises lines that changed. Writes the course's narration-timing.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { NARRATION_VOICE, narrationSegments, spoken, type NarrationTiming } from '../src/lib/lms/video/narration'
import { courseFromArgs } from './video/courses'
import { CLIP_DIR, RATE, SAMPLE_RATE, clipPath, readWav, trimSilence, writeWav } from './video/narration-audio'

const course = courseFromArgs(process.argv.slice(2))
const TIMING_FILE = course.timingFile
const selected = course.only.length ? course.videos.filter((v) => course.only.includes(v.id)) : course.videos

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

async function synthesize(text: string) {
  const key = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION
  if (!key || !region) throw new Error('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.')
  const ssml = `<speak version="1.0" xml:lang="en-IN"><voice name="${NARRATION_VOICE}"><prosody rate="${RATE}">${escapeXml(spoken(text, course.series))}</prosody></voice></speak>`
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
        'User-Agent': 'MyCampusView-Academy',
      },
      body: ssml,
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, attempt * 2000))
      continue
    }
    throw new Error(`Azure TTS ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }
}

async function clipSeconds(text: string) {
  const file = clipPath(text, course.series)
  if (!existsSync(file)) {
    const raw = path.join(CLIP_DIR, 'raw.wav')
    writeFileSync(raw, await synthesize(text))
    writeWav(file, trimSilence(readWav(raw)))
  }
  return Math.round((readWav(file).length / SAMPLE_RATE) * 100) / 100
}

async function main() {
  mkdirSync(CLIP_DIR, { recursive: true })
  const timing: NarrationTiming = existsSync(TIMING_FILE) ? JSON.parse(readFileSync(TIMING_FILE, 'utf8')) : { voice: null, videos: {} }
  timing.voice = NARRATION_VOICE
  for (const video of selected) {
    const lengths: number[] = []
    for (const line of narrationSegments(video)) lengths.push(await clipSeconds(line))
    timing.videos[video.id] = { intro: lengths[0]!, scenes: lengths.slice(1, -1), outro: lengths.at(-1)! }
    const total = lengths.reduce((a, b) => a + b, 0)
    console.log(`${video.id}: ${lengths.length} clips, ${total.toFixed(1)}s of speech`)
    writeFileSync(TIMING_FILE, `${JSON.stringify(timing, null, 2)}\n`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
