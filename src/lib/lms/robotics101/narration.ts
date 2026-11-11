import type { NarrationTiming, VideoSeries } from '@/lib/lms/video/narration'
import narrationTiming from './narration-timing.json'

/** Robotics 101 pronunciation: pins, part numbers and code names spelled the way a teacher says them. */
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

export const ROBOTICS_SERIES: VideoSeries = {
  name: 'Robotics 101',
  say: SAY,
  timing: narrationTiming as NarrationTiming,
  pronounce: 'Arduino (aar-DWEE-no), L298N (L-two-nine-eight-N), PWM (P-W-M), infrared (in-fra-red)',
}
