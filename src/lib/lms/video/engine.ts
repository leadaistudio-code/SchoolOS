import type { DiagramName } from '@/components/lms/robotics/diagrams'
import type { Algorithm, SimSettings } from '@/lib/lms/robot'
import { introLine, outroLine, type VideoSeries } from './narration'

/**
 * Academy instructional videos: script, storyboard and timing in one place.
 * The renderer (scripts/lms-videos.ts) draws every frame from this data, so
 * the narration script, the captions and the picture can never drift apart.
 * `say` is the narration line for the scene and doubles as the caption text.
 */

type Base = { say: string; chapter?: string; seconds?: number }

export type Scene = Base &
  (
    | { kind: 'title'; kicker?: string; title: string }
    | { kind: 'points'; title: string; items: string[]; diagram?: DiagramName }
    | { kind: 'diagram'; title: string; diagram: DiagramName; steps: number; zoom?: { x: number; y: number; scale: number } }
    | { kind: 'code'; title: string; code: string; highlight: [number, number][] }
    | { kind: 'sim'; title: string; track: string; algorithm?: Partial<Algorithm>; settings?: Partial<Omit<SimSettings, 'algorithm'>> }
    | { kind: 'truth'; title: string }
    | { kind: 'parts'; title: string; items: { name: string; job: string }[] }
    | { kind: 'steps'; title: string; items: string[]; diagram?: DiagramName }
    | { kind: 'serial'; title: string; lines: string[] }
    | { kind: 'chat'; title: string; messages: { from: 'you' | 'ai'; text: string }[] }
    | { kind: 'bars'; title: string; caption?: string; unit?: string; bars: { label: string; value: number }[] }
  )

export type VideoCheckpoint = {
  id: string
  /** Pause when this scene ends (index into scenes). */
  afterScene: number
  prompt: string
  options: { id: string; text: string; correct: boolean; feedback?: string }[]
  explanation: string
}

export type VideoDef = {
  id: string
  series: VideoSeries
  lessonSlug: string
  number: number
  title: string
  summary: string[]
  next: string
  scenes: Scene[]
  checkpoints: VideoCheckpoint[]
}

export const INTRO_SECONDS = 4.5
export const OUTRO_SECONDS = 7
export const FPS = 24

/** Where each narration clip starts, relative to its section. */
export const VOICE_LEAD = { intro: 0.6, scene: 0.35, outro: 0.5 }
const VOICE_TAIL = { intro: 0.7, scene: 0.9, outro: 1.6 }

export function voiceTiming(video: VideoDef) {
  const t = video.series.timing.videos[video.id]
  return t && t.scenes.length === video.scenes.length ? t : undefined
}

export function narrationVoice(series: VideoSeries) {
  return series.timing.voice
}

const tenth = (n: number) => Math.ceil(n * 10) / 10

/** Reading pace for 10–13-year-olds: slow, with a pause after each scene. */
export function sceneSeconds(scene: Scene) {
  if (scene.seconds) return scene.seconds
  const words = scene.say.trim().split(/\s+/).length
  const extra = scene.kind === 'sim' ? 3 : scene.kind === 'code' ? 2 : 1.5
  return Math.max(6, Math.round((words / 2.1 + extra) * 2) / 2)
}

export type TimedScene = Scene & { start: number; end: number; index: number }

/**
 * Scene timing. With recorded narration each scene lasts as long as its clip
 * plus a short pause (simulator scenes never get shorter than the run needs);
 * without it, the reading-pace estimate is used.
 */
export function timeline(video: VideoDef) {
  const voice = voiceTiming(video)
  const introSeconds = voice ? Math.max(INTRO_SECONDS, tenth(VOICE_LEAD.intro + voice.intro + VOICE_TAIL.intro)) : INTRO_SECONDS
  let t = introSeconds
  const scenes: TimedScene[] = video.scenes.map((s, index) => {
    const start = t
    const voiced = voice ? tenth(VOICE_LEAD.scene + voice.scenes[index]! + VOICE_TAIL.scene) : 0
    t += voice ? Math.max(voiced, s.kind === 'sim' ? sceneSeconds(s) : 4) : sceneSeconds(s)
    return { ...s, start, end: t, index }
  })
  const outroSeconds = voice ? Math.max(OUTRO_SECONDS, tenth(VOICE_LEAD.outro + voice.outro + VOICE_TAIL.outro)) : OUTRO_SECONDS
  const duration = t + outroSeconds
  const chapters = [
    { at: 0, title: 'Introduction' },
    ...scenes.filter((s) => s.chapter).map((s) => ({ at: Math.round(s.start), title: s.chapter! })),
    { at: Math.round(t), title: 'Recap' },
  ]
  const checkpoints = video.checkpoints.map((c) => ({ ...c, at: Math.round(scenes[c.afterScene]!.end - 0.5) }))
  return { scenes, duration, introSeconds, outroSeconds, chapters, checkpoints }
}

function captionChunks(text: string) {
  const sentences = text.match(/[^.!?]+[.!?]+["')]*\s*|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [text]
  return sentences.flatMap((sentence) => {
    const words = sentence.split(/\s+/)
    if (words.length <= 14) return [sentence]
    const parts: string[] = []
    for (let i = 0; i < words.length; i += 12) parts.push(words.slice(i, i + 12).join(' '))
    return parts
  })
}

/** Caption cues spread over the span the narration is spoken in. */
export function captionCues(video: VideoDef) {
  const { scenes, duration, introSeconds, outroSeconds } = timeline(video)
  const voice = voiceTiming(video)
  const cues: { start: number; end: number; text: string }[] = []
  const spread = (text: string, from: number, span: number) => {
    const chunks = captionChunks(text)
    const total = chunks.reduce((n, c) => n + c.length, 0)
    let at = from
    for (const c of chunks) {
      const len = (c.length / total) * span
      cues.push({ start: at, end: at + len - 0.05, text: c })
      at += len
    }
  }
  if (voice) spread(introLine(video), VOICE_LEAD.intro, voice.intro)
  else cues.push({ start: 0.5, end: introSeconds - 0.3, text: introLine(video) })
  for (const s of scenes) {
    if (voice) spread(s.say, s.start + VOICE_LEAD.scene, voice.scenes[s.index]!)
    else spread(s.say, s.start + 0.3, s.end - s.start - 0.6)
  }
  const outroStart = duration - outroSeconds
  if (voice) spread(outroLine(video), outroStart + VOICE_LEAD.outro, voice.outro)
  else cues.push({ start: outroStart + 0.3, end: duration - 0.5, text: `Next: ${video.next}` })
  return cues
}

const stamp = (t: number, sep: '.' | ',') => {
  const ms = Math.round(t * 1000)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const f = ms % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(f).padStart(3, '0')}`
}

export function toVtt(video: VideoDef) {
  return ['WEBVTT', '', ...captionCues(video).flatMap((c, i) => [`${i + 1}`, `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}`, c.text, ''])].join('\n')
}

export function toSrt(video: VideoDef) {
  return captionCues(video)
    .flatMap((c, i) => [`${i + 1}`, `${stamp(c.start, ',')} --> ${stamp(c.end, ',')}`, c.text, ''])
    .join('\n')
}

/** Full narration script, for a voice artist or a TTS engine. */
export function narrationScript(video: VideoDef) {
  const { scenes } = timeline(video)
  return [
    `# Video ${video.number}: ${video.title}`,
    '',
    `[${stamp(0, '.')}] (Intro) ${introLine(video)}`,
    ...scenes.map((s) => `[${stamp(s.start, '.')}] ${s.say}`),
    `[${stamp(scenes.at(-1)!.end, '.')}] (Outro) ${outroLine(video)}`,
  ].join('\n')
}

/** Checkpoint shorthand: options as [text, correct, feedback?]. */
export const cp = (id: string, afterScene: number, prompt: string, options: [string, boolean, string?][], explanation: string): VideoCheckpoint => ({
  id,
  afterScene,
  prompt,
  options: options.map(([text, correct, feedback], i) => ({ id: `${id}-${i}`, text, correct, ...(feedback ? { feedback } : {}) })),
  explanation,
})
