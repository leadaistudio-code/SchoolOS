import type { VideoDef } from './engine'

/**
 * Narration shared by every Academy course video. Captions show the written
 * script; the voice reads `spoken()`, which applies the series' pronunciation
 * rules (pins, part numbers, code names) so a text-to-speech voice says them
 * the way a teacher would.
 */

export const NARRATION_VOICE = 'en-IN-NeerjaNeural'

/** Measured clip lengths (seconds), written by the series' narration script. */
export type NarrationTiming = { voice: string | null; videos: Record<string, { intro: number; scenes: number[]; outro: number } | undefined> }

export type VideoSeries = {
  /** Shown on screen and in captions, e.g. "Robotics 101". */
  name: string
  say: [RegExp, string][]
  timing: NarrationTiming
  /** Guidance for a human voice artist, shown in the storyboard documents. */
  pronounce?: string
}

export function spoken(text: string, series: VideoSeries) {
  return series.say.reduce((s, [pattern, replacement]) => s.replace(pattern, replacement), text)
}

export function introLine(video: VideoDef) {
  return `MyCampusView Academy. ${video.series.name}, video ${video.number}. ${video.title}.`
}

export function outroLine(video: VideoDef) {
  const recap = video.summary.map((s) => s.replace(/[.!?]?$/, '.')).join(' ')
  return `Let us recap. ${recap} Next: ${video.next}`
}

/** Everything the voice says in a video, in order: intro, each scene, outro. */
export function narrationSegments(video: VideoDef) {
  return [introLine(video), ...video.scenes.map((s) => s.say), outroLine(video)]
}
