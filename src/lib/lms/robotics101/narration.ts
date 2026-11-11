import type { VideoDef } from './videos'

/**
 * Narration for the Robotics 101 videos. Captions show the written script;
 * the voice reads `spoken()`, which spells out pins, part numbers and code
 * names so a text-to-speech voice says them the way a teacher would.
 */

export const NARRATION_VOICE = 'en-IN-NeerjaNeural'

const SAY: [RegExp, string][] = [
  [/\bMyCampusView\b/g, 'My Campus View'],
  [/\bRobotics 101\b/g, 'Robotics one oh one'],
  [/\bL298N\b/g, 'L 2 9 8 N'],
  [/\bIN([1-4])\b/g, 'I N $1'],
  [/\bEN([AB])\b/g, 'E N $1'],
  [/\bD(\d{1,2})\b/g, 'D $1'],
  [/\bVCC\b/g, 'V C C'],
  [/\bGND\b/g, 'G N D'],
  [/\bPWM\b/g, 'P W M'],
  [/\bIDE\b/g, 'I D E'],
  [/\bUSB\b/g, 'U S B'],
  [/\bLEFT_IR\b/g, 'left I R'],
  [/\bRIGHT_IR\b/g, 'right I R'],
  [/\bON_LINE\b/g, 'on line'],
  [/\bBASE_SPEED\b/g, 'base speed'],
  [/\bTURN_SPEED\b/g, 'turn speed'],
  [/\bsetMotors\b/g, 'set motors'],
  [/\bdigitalRead\b/g, 'digital read'],
  [/\banalogWrite\b/g, 'analog write'],
  [/\bpinMode\b/g, 'pin mode'],
  [/\bHIGH\b/g, 'high'],
  [/\bLOW\b/g, 'low'],
  [/\bBLACK\b/g, 'black'],
  [/\bWHITE\b/g, 'white'],
  [/\bS-bend\b/g, 'S bend'],
  [/(\d+)\s*[–-]\s*(\d+)\s*mm\b/g, '$1 to $2 millimetres'],
]

export function spoken(text: string) {
  return SAY.reduce((s, [pattern, replacement]) => s.replace(pattern, replacement), text)
}

export function introLine(video: VideoDef) {
  return `MyCampusView Academy. Robotics 101, video ${video.number}. ${video.title}.`
}

export function outroLine(video: VideoDef) {
  const recap = video.summary.map((s) => s.replace(/[.!?]?$/, '.')).join(' ')
  return `Let us recap. ${recap} Next: ${video.next}`
}

/** Everything the voice says in a video, in order: intro, each scene, outro. */
export function narrationSegments(video: VideoDef) {
  return [introLine(video), ...video.scenes.map((s) => s.say), outroLine(video)]
}
