/**
 * Robotics 101 video pipeline.
 *
 *   npx tsx scripts/robotics101-videos.ts            scripts, storyboards, captions only
 *   npx tsx scripts/robotics101-videos.ts --render   ...and render + verify MP4s and posters
 *   npx tsx scripts/robotics101-videos.ts --render v04 v11
 *
 * Rendering draws every frame with the VideoFrame React component in headless
 * Chrome (driven over the DevTools protocol, no extra packages), pipes the
 * frames into ffmpeg (H.264, 1280×720, 24 fps) and checks each file with
 * ffprobe. Only files that pass the check are written to manifest.json, and
 * only those are marked ready by the content sync.
 *
 * Needs: Chrome or Edge (CHROME_PATH), ffmpeg and ffprobe (FFMPEG, FFPROBE or on PATH).
 * Narration: run scripts/robotics101-narration.ts first. Videos with measured
 * narration get a voice track built from the cached clips, placed where the
 * timeline expects each line; videos without it render silent.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { narrationSegments } from '../src/lib/lms/robotics101/narration'
import { FPS, VIDEOS, VOICE_LEAD, narrationScript, narrationVoice, sceneSeconds, timeline, toSrt, toVtt, voiceTiming, type VideoDef } from '../src/lib/lms/robotics101/videos'
import { SAMPLE_RATE, clipPath, readWav, writeWav } from './video/narration-audio'

const ROOT = path.resolve(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public/lms-media/robotics-101/video')
const DOCS_DIR = path.join(ROOT, 'docs/lms/robotics-101/videos')
const BUILD_DIR = path.join(ROOT, '.tmp-diag/video-build')
const URL_BASE = '/lms-media/robotics-101/video'

const args = process.argv.slice(2)
const render = args.includes('--render')
const only = args.filter((a) => /^v\d\d$/.test(a))
const selected = only.length ? VIDEOS.filter((v) => only.includes(v.id)) : VIDEOS
const CONCURRENCY = Number(process.env.VIDEO_WORKERS ?? 3)

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  const found = candidates.find((c) => c && existsSync(c))
  if (!found) throw new Error('Chrome or Edge not found. Set CHROME_PATH.')
  return found
}
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const FFPROBE = process.env.FFPROBE ?? (process.env.FFMPEG ? path.join(path.dirname(process.env.FFMPEG), path.basename(process.env.FFMPEG).replace('ffmpeg', 'ffprobe')) : 'ffprobe')

/* ------------------------------------------------------------ documents */

const KIND: Record<string, string> = {
  title: 'Title card, amber underline draws in',
  points: 'Bullet list; each item slides in and is highlighted while narrated',
  steps: 'Numbered steps; the current step is highlighted',
  diagram: 'Animated diagram; parts reveal step by step',
  code: 'Code panel with syntax colours; the narrated lines are highlighted',
  sim: 'Live simulator run (robot model from src/lib/lms/robot.ts) with decision panel',
  truth: 'Truth table; rows highlight one at a time',
  parts: 'Component cards slide in',
  serial: 'Serial Monitor; lines print one by one',
}

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

function storyboard(video: VideoDef) {
  const tl = timeline(video)
  const onScreen = (s: (typeof tl.scenes)[number]) => {
    switch (s.kind) {
      case 'title':
        return `${s.kicker ? `${s.kicker}: ` : ''}${s.title}`
      case 'points':
      case 'steps':
        return `${s.title}: ${s.items.join(' · ')}`
      case 'parts':
        return `${s.title}: ${s.items.map((p) => `${p.name} (${p.job})`).join(' · ')}`
      case 'diagram':
        return `${s.title} [diagram: ${s.diagram}, ${s.steps} step(s)${s.zoom ? `, zoom ×${s.zoom.scale}` : ''}]`
      case 'code':
        return `${s.title} [${s.code.split('\n').length} lines; highlights ${s.highlight.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(', ')}]`
      case 'sim':
        return `${s.title} [track: ${s.track}; ${JSON.stringify({ ...s.algorithm, ...s.settings })}]`
      case 'serial':
        return `${s.title}: ${s.lines.join(' / ')}`
      case 'truth':
        return s.title
    }
  }
  const rows = tl.scenes.map(
    (s, i) => `| ${i + 1} | ${mmss(s.start)}–${mmss(s.end)} | ${s.chapter ?? ''} | ${onScreen(s).replace(/\|/g, '/')} | ${KIND[s.kind]} | ${s.say.replace(/\|/g, '/')} |`,
  )
  return [
    `# Video ${video.number}: ${video.title}`,
    '',
    `Lesson: \`${video.lessonSlug}\` · Length: ${mmss(tl.duration)} · ${FPS} fps · 1280×720 · logo top-right on every content frame`,
    '',
    '## Storyboard',
    '',
    '| # | Time | Chapter | On-screen text | Visual / animation | Narration |',
    '|---|------|---------|----------------|--------------------|-----------|',
    `| 0 | 0:00–${mmss(tl.introSeconds)} | Introduction | MyCampusView Academy · Robotics 101 · ${video.title} | Branded intro: logo fades up, title slides in | ${narrationSegments(video)[0]} |`,
    ...rows,
    `| ${rows.length + 1} | ${mmss(tl.scenes.at(-1)!.end)}–${mmss(tl.duration)} | Recap | ${video.summary.join(' · ')} · Next: ${video.next} | Branded outro: recap bullets, logo, academy URL | ${narrationSegments(video).at(-1)} |`,
    '',
    '## In-video checkpoints',
    '',
    ...tl.checkpoints.map((c) => `- ${mmss(c.at)}: ${c.prompt} (answer: ${c.options.find((o) => o.correct)?.text})`),
    '',
    '## Narration script',
    '',
    'Clear, friendly, slow Indian English for Classes 5–8. Pronounce: Arduino (aar-DWEE-no), L298N (L-two-nine-eight-N), PWM (P-W-M), infrared (in-fra-red).',
    '',
    '```text',
    narrationScript(video),
    '```',
    '',
  ].join('\n')
}

function writeDocuments() {
  mkdirSync(PUBLIC_DIR, { recursive: true })
  mkdirSync(DOCS_DIR, { recursive: true })
  const index = ['# Robotics 101 videos', '', '| Video | Lesson | Length | Scenes | Checkpoints |', '|---|---|---|---|---|']
  let total = 0
  for (const v of VIDEOS) {
    const tl = timeline(v)
    total += tl.duration
    index.push(`| [${v.number}. ${v.title}](./${v.id}.md) | \`${v.lessonSlug}\` | ${mmss(tl.duration)} | ${v.scenes.length} | ${v.checkpoints.length} |`)
    writeFileSync(path.join(DOCS_DIR, `${v.id}.md`), storyboard(v))
    writeFileSync(path.join(PUBLIC_DIR, `${v.id}.en.vtt`), toVtt(v))
    writeFileSync(path.join(PUBLIC_DIR, `${v.id}.en.srt`), toSrt(v))
  }
  index.push('', `Total running time: ${mmss(total)}.`, '')
  writeFileSync(path.join(DOCS_DIR, 'README.md'), index.join('\n'))
  console.log(`Wrote ${VIDEOS.length} storyboards + scripts, VTT and SRT captions. Total ${mmss(total)}.`)
  for (const v of VIDEOS) console.log(`  ${v.id} ${mmss(timeline(v).duration)}  ${v.scenes.map(sceneSeconds).join('+')}s`)
}

/* ------------------------------------------------------------ rendering */

class Cdp {
  private next = 1
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private constructor(private ws: WebSocket) {
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data))
      const waiter = msg.id ? this.pending.get(msg.id) : undefined
      if (!waiter) return
      this.pending.delete(msg.id)
      if (msg.error) waiter.reject(new Error(`${msg.error.message} ${msg.error.data ?? ''}`))
      else waiter.resolve(msg.result)
    }
  }
  static async connect(url: string) {
    const ws = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('DevTools connection failed'))
    })
    return new Cdp(ws)
  }
  send<T = any>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    const id = this.next++
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
  close() {
    this.ws.close()
  }
}

async function launchChrome() {
  const profile = mkdtempSync(path.join(tmpdir(), 'r101-chrome-'))
  const proc = spawn(
    chromePath(),
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  const url = await new Promise<string>((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 30_000)
    proc.stderr.on('data', (d) => {
      buf += String(d)
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) {
        clearTimeout(timer)
        resolve(m[1]!)
      }
    })
  })
  const cdp = await Cdp.connect(url)
  return {
    cdp,
    async close() {
      cdp.close()
      proc.kill()
      await new Promise((r) => setTimeout(r, 500))
      rmSync(profile, { recursive: true, force: true })
    },
  }
}

async function bundlePage() {
  mkdirSync(BUILD_DIR, { recursive: true })
  await build({
    entryPoints: [path.join(ROOT, 'scripts/video/frame-entry.tsx')],
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    target: 'es2022',
    minify: true,
    outfile: path.join(BUILD_DIR, 'frame.js'),
    define: { 'process.env.NODE_ENV': '"production"' },
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    logLevel: 'error',
  })
  const dataUri = (file: string) => `data:image/png;base64,${readFileSync(path.join(ROOT, 'public/brand', file)).toString('base64')}`
  const font = pathToFileURL(path.join(ROOT, 'src/lib/fonts/manrope-latin.woff2')).href
  writeFileSync(
    path.join(BUILD_DIR, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8">
<style>
@font-face { font-family: 'Manrope'; src: url('${font}') format('woff2'); font-weight: 200 800; }
html, body { margin: 0; background: #f4f3ef; }
*, *::before, *::after { transition: none !important; animation: none !important; box-sizing: border-box; }
</style></head><body><div id="root"></div>
<script>window.LOGO_DARK=${JSON.stringify(dataUri('mycampusview-lockup-dark.png'))};window.LOGO_LIGHT=${JSON.stringify(dataUri('mycampusview-lockup.png'))};</script>
<script src="frame.js"></script></body></html>`,
  )
  return pathToFileURL(path.join(BUILD_DIR, 'index.html')).href
}

function run(cmd: string, argv: string[]) {
  return new Promise<string>((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`))))
  })
}

/** Full-length narration WAV: each cached clip placed where the timeline expects that line. */
function voiceTrack(video: VideoDef) {
  if (!voiceTiming(video)) return null
  const tl = timeline(video)
  const lines = narrationSegments(video)
  const starts = [VOICE_LEAD.intro, ...tl.scenes.map((s) => s.start + VOICE_LEAD.scene), tl.duration - tl.outroSeconds + VOICE_LEAD.outro]
  const out = new Int16Array(Math.ceil(tl.duration * SAMPLE_RATE))
  lines.forEach((line, i) => {
    const file = clipPath(line)
    if (!existsSync(file)) throw new Error(`${video.id}: narration clip missing for "${line.slice(0, 40)}…". Run scripts/robotics101-narration.ts.`)
    const clip = readWav(file)
    const at = Math.round(starts[i]! * SAMPLE_RATE)
    if (at + clip.length > out.length) throw new Error(`${video.id}: line ${i} runs past the end of the video`)
    out.set(clip, at)
  })
  const file = path.join(BUILD_DIR, `${video.id}.voice.wav`)
  writeWav(file, out)
  return file
}

async function renderVideo(cdp: Cdp, pageUrl: string, video: VideoDef) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const s = (method: string, params: object = {}) => cdp.send(method, params, sessionId)
  await s('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  await s('Page.enable')
  await s('Page.navigate', { url: pageUrl })
  for (let i = 0; i < 100; i++) {
    const r = await s('Runtime.evaluate', { expression: "document.readyState === 'complete' && typeof window.__frame === 'function'", returnByValue: true })
    if (r.result.value) break
    await new Promise((res) => setTimeout(res, 100))
  }
  await s('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true })

  const frame = async (t: number, quality = 90) => {
    const r = await s('Runtime.evaluate', { expression: `window.__frame(${JSON.stringify(video.id)}, ${t})`, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(`Frame ${t}s: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    const shot = await s('Page.captureScreenshot', { format: 'jpeg', quality, optimizeForSpeed: true })
    return Buffer.from(shot.data, 'base64')
  }

  const tl = timeline(video)
  const { duration } = tl
  const mp4 = path.join(PUBLIC_DIR, `${video.id}.mp4`)
  const track = voiceTrack(video)
  const audioArgs = track ? ['-i', track, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '96k', '-ar', '48000'] : []
  const ff = spawn(
    FFMPEG,
    ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', ...audioArgs, '-c:v', 'libx264', '-preset', 'medium', '-tune', 'animation', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  )
  let ffErr = ''
  ff.stderr.on('data', (d) => (ffErr += d))
  const done = new Promise<void>((resolve, reject) => ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${video.id}: ${ffErr.slice(-800)}`)))))

  const frames = Math.round(duration * FPS)
  const started = Date.now()
  for (let i = 0; i < frames; i++) {
    const jpg = await frame(i / FPS)
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r))
    if (i % (FPS * 30) === 0 && i) console.log(`  ${video.id} ${Math.round((i / frames) * 100)}%  (${Math.round((Date.now() - started) / 1000)}s)`)
  }
  ff.stdin.end()
  await done

  const posterAt = tl.introSeconds - 0.6
  writeFileSync(path.join(PUBLIC_DIR, `${video.id}.poster.jpg`), await frame(posterAt, 88))
  await cdp.send('Target.closeTarget', { targetId })
  return { frames, seconds: (Date.now() - started) / 1000 }
}

type ManifestEntry = {
  src: string
  poster: string
  captions: string
  durationSeconds: number
  bytes: number
  sha256: string
  width: number
  height: number
  codec: string
  audio: string | null
  renderedAt: string
  verified: true
}

async function verify(video: VideoDef): Promise<ManifestEntry> {
  const file = path.join(PUBLIC_DIR, `${video.id}.mp4`)
  const probe = JSON.parse(await run(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', file]))
  const streams: { codec_type: string; codec_name: string; width?: number; height?: number }[] = probe.streams ?? []
  const stream = streams.find((s) => s.codec_type === 'video')
  const audio = streams.find((s) => s.codec_type === 'audio')
  const duration = Number(probe.format?.duration)
  const expected = timeline(video).duration
  if (!stream || stream.codec_name !== 'h264') throw new Error(`${video.id}: not H.264`)
  if (stream.width !== 1280 || stream.height !== 720) throw new Error(`${video.id}: ${stream.width}×${stream.height}, expected 1280×720`)
  if (!(Math.abs(duration - expected) < 0.6)) throw new Error(`${video.id}: ${duration}s, expected ${expected}s`)
  if (voiceTiming(video) && audio?.codec_name !== 'aac') throw new Error(`${video.id}: narration audio missing`)
  if (!existsSync(path.join(PUBLIC_DIR, `${video.id}.poster.jpg`))) throw new Error(`${video.id}: poster missing`)
  const bytes = statSync(file).size
  return {
    src: `${URL_BASE}/${video.id}.mp4`,
    poster: `${URL_BASE}/${video.id}.poster.jpg`,
    captions: `${URL_BASE}/${video.id}.en.vtt`,
    durationSeconds: Math.round(duration),
    bytes,
    sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    width: stream.width,
    height: stream.height,
    codec: stream.codec_name,
    audio: audio ? `${audio.codec_name}, ${voiceTiming(video) ? narrationVoice() : 'unknown'}` : null,
    renderedAt: new Date().toISOString(),
    verified: true,
  }
}

async function renderAll() {
  const pageUrl = await bundlePage()
  const manifestFile = path.join(PUBLIC_DIR, 'manifest.json')
  const manifest: { narration: string; videos: Record<string, ManifestEntry> } = existsSync(manifestFile)
    ? JSON.parse(readFileSync(manifestFile, 'utf8'))
    : { narration: 'none', videos: {} }
  const voiced = VIDEOS.filter((v) => voiceTiming(v)).length
  manifest.narration = voiced
    ? `Azure Neural TTS ${narrationVoice()} (Indian English), synthesised narration; English captions${voiced < VIDEOS.length ? `; ${VIDEOS.length - voiced} video(s) still silent` : ''}`
    : 'none: silent with English captions'
  const queue = [...selected]
  const failures: string[] = []
  // One browser per worker: headless Chrome only paints the most recently opened tab.
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      const chrome = await launchChrome()
      try {
        for (let v = queue.shift(); v; v = queue.shift()) {
          console.log(`Rendering ${v.id} ${v.title}`)
          try {
            const r = await renderVideo(chrome.cdp, pageUrl, v)
            manifest.videos[v.id] = await verify(v)
            console.log(`  ${v.id} done: ${r.frames} frames in ${Math.round(r.seconds)}s, verified`)
          } catch (err) {
            delete manifest.videos[v.id]
            failures.push(`${v.id}: ${(err as Error).message}`)
            console.error(`  ${v.id} FAILED: ${(err as Error).message}`)
          }
          writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))
        }
      } finally {
        await chrome.close()
      }
    }),
  )
  if (failures.length) {
    console.error(`\n${failures.length} video(s) failed:\n${failures.join('\n')}`)
    process.exitCode = 1
  }
}

async function main() {
  writeDocuments()
  if (render) await renderAll()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
