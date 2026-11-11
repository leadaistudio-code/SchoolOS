import path from 'node:path'
import { CURRICULA, curriculumByKey } from '../../src/lib/lms/curricula'

const ROOT = path.resolve(__dirname, '../..')

/** Where each course keeps its measured narration lengths (read by the app at build time). */
const TIMING_FILES: Record<string, string> = {
  'robotics-101': 'src/lib/lms/robotics101/narration-timing.json',
  'ai-young-builders': 'src/lib/lms/ai101/narration-timing.json',
}

/** `--course <key>` (default robotics-101) and the paths that course's media lives in. */
export function courseFromArgs(argv: string[]) {
  const i = argv.indexOf('--course')
  const key = i >= 0 ? argv[i + 1] ?? '' : 'robotics-101'
  const curriculum = curriculumByKey(key)
  if (!curriculum) throw new Error(`Unknown course "${key}". Known: ${CURRICULA.map((c) => c.key).join(', ')}`)
  const series = curriculum.videos[0]?.series
  if (!series) throw new Error(`${key} has no videos`)
  return {
    key,
    curriculum,
    series,
    videos: curriculum.videos,
    publicDir: path.join(ROOT, 'public', curriculum.mediaBase, 'video'),
    urlBase: `${curriculum.mediaBase}/video`,
    docsDir: path.join(ROOT, 'docs/lms', key, 'videos'),
    timingFile: path.join(ROOT, TIMING_FILES[key] ?? `src/lib/lms/${key}/narration-timing.json`),
    /** Positional video ids after the flags, e.g. v04 a11. */
    only: argv.filter((a, n) => /^[a-z]\d\d$/.test(a) && argv[n - 1] !== '--course'),
  }
}
