import { MODULE_1 } from './module1'
import { MODULE_2 } from './module2'
import { MODULE_3 } from './module3'
import { MODULE_4 } from './module4'
import { earnedBadges as earned, lessonResources, type Badge, type Curriculum, type Resource } from '@/lib/lms/curriculum'
import type { LessonDef, ModuleDef } from './types'
import { VIDEOS, videoById } from './videos'

export type { LessonDef, ModuleDef } from './types'

/** The catalogue course this curriculum belongs to (title match, as created by the starter seed). */
export const COURSE_TITLE = 'Robotics 101: Build a line-follower'
export const CURRICULUM_VERSION = 2

export const MODULES: ModuleDef[] = [MODULE_1, MODULE_2, MODULE_3, MODULE_4]

export const LESSONS: (LessonDef & { module: string; number: number })[] = MODULES.flatMap((m) => m.lessons.map((l) => ({ ...l, module: m.key }))).map((l, i) => ({
  ...l,
  number: i + 1,
}))

export function lessonBySlug(slug: string | null | undefined) {
  return slug ? LESSONS.find((l) => l.slug === slug) : undefined
}

export const MEDIA_BASE = '/lms-media/robotics-101'

export type { Resource } from '@/lib/lms/curriculum'

export const RESOURCES: Resource[] = [
  { id: 'handbook', title: 'Student handbook', file: 'resources/robotics-101-student-handbook.pdf', note: 'Every lesson in one booklet', audience: 'student' },
  { id: 'components', title: 'Component identification chart', file: 'resources/robotics-101-component-chart.pdf', note: 'Every part, its name and its job', audience: 'student' },
  { id: 'wiring', title: 'Wiring diagram', file: 'resources/robotics-101-wiring-diagram.pdf', note: 'Uno + L298N + two IR sensors', audience: 'student' },
  { id: 'pins', title: 'Pin connection reference', file: 'resources/robotics-101-pin-reference.pdf', note: 'Print and keep next to your robot', audience: 'student' },
  { id: 'assembly', title: 'Assembly guide', file: 'resources/robotics-101-assembly-guide.pdf', note: 'Step-by-step build', audience: 'student' },
  { id: 'troubleshooting', title: 'Troubleshooting guide', file: 'resources/robotics-101-troubleshooting.pdf', note: 'Symptom, cause, fix', audience: 'student' },
  { id: 'cheatsheet', title: 'Arduino cheat sheet', file: 'resources/robotics-101-arduino-cheat-sheet.pdf', note: 'The commands used in this course', audience: 'student' },
  { id: 'flowchart', title: 'Line-following algorithm flowchart', file: 'resources/robotics-101-algorithm-flowchart.pdf', note: 'The four rules at a glance', audience: 'student' },
  { id: 'tracks', title: 'Printable practice tracks', file: 'resources/robotics-101-printable-tracks.pdf', note: 'A4 tiles to tape together', audience: 'student' },
  { id: 'worksheet', title: 'Student activity worksheet', file: 'resources/robotics-101-worksheet.pdf', note: 'Record readings, tests and fixes', audience: 'student' },
  { id: 'teacher', title: 'Teacher guide', file: 'resources/robotics-101-teacher-guide.pdf', note: 'Timings, set-up, safety, classroom tips', audience: 'teacher' },
  { id: 'rubric', title: 'Assessment rubric', file: 'resources/robotics-101-assessment-rubric.pdf', note: 'How the final challenge is judged', audience: 'teacher' },
]

const SKETCH = 'Arduino sketch, compiled and checked'

export const CODE_FILES: Record<string, { title: string; file: string; note: string }> = {
  first_program: { title: 'first_program.ino', file: 'code/first_program.ino', note: SKETCH },
  ir_sensor_test: { title: 'ir_sensor_test.ino', file: 'code/ir_sensor_test.ino', note: SKETCH },
  motor_test: { title: 'motor_test.ino', file: 'code/motor_test.ino', note: SKETCH },
  line_follower: { title: 'line_follower.ino', file: 'code/line_follower.ino', note: SKETCH },
}

const LESSON_RESOURCES: Record<string, string[]> = {
  'r101-01-welcome': ['handbook'],
  'r101-03-kit': ['components'],
  'r101-06-build-body': ['assembly'],
  'r101-07-electronics': ['wiring', 'pins'],
  'r101-08-first-program': ['cheatsheet', 'code:first_program'],
  'r101-09-read-sensors': ['code:ir_sensor_test', 'worksheet'],
  'r101-10-control-motors': ['code:motor_test', 'cheatsheet'],
  'r101-11-algorithm': ['flowchart', 'worksheet'],
  'r101-12-make-it-follow': ['tracks', 'code:line_follower'],
  'r101-13-troubleshooting': ['troubleshooting'],
  'r101-14-final-challenge': ['rubric', 'tracks'],
  'r101-15-final-assessment': ['handbook'],
}

export const resourcesFor = lessonResources(MEDIA_BASE, RESOURCES, LESSON_RESOURCES, CODE_FILES)

export type { Badge } from '@/lib/lms/curriculum'

export const BADGES: Badge[] = [
  { id: 'robot-explorer', name: 'Robot Explorer', description: 'Finished Meet your robot', lessons: MODULE_1.lessons.map((l) => l.slug) },
  { id: 'sensor-detective', name: 'Sensor Detective', description: 'Mastered IR sensing and reading sensors in code', lessons: ['r101-04-ir-sensors', 'r101-09-read-sensors'] },
  { id: 'circuit-builder', name: 'Circuit Builder', description: 'Built the robot and wired it safely', lessons: ['r101-05-motors', 'r101-06-build-body', 'r101-07-electronics'] },
  { id: 'code-creator', name: 'Code Creator', description: 'Programmed sensors, motors and the algorithm', lessons: ['r101-08-first-program', 'r101-10-control-motors', 'r101-11-algorithm'] },
  { id: 'robot-engineer', name: 'Robot Engineer', description: 'Tested, tuned and fixed a real robot', lessons: ['r101-12-make-it-follow', 'r101-13-troubleshooting'] },
  { id: 'line-follower-champion', name: 'Line-Follower Champion', description: 'Passed the final challenge and assessment', lessons: ['r101-14-final-challenge', 'r101-15-final-assessment'] },
]

/** True when a course's lessons come from this curriculum (badges and kit resources apply). */
export function isRobotics101(slugs: (string | null | undefined)[]) {
  return slugs.some((s) => !!s && LESSONS.some((l) => l.slug === s))
}

export function earnedBadges(completedSlugs: Set<string>) {
  return earned(BADGES, completedSlugs)
}

export const NEXT_COURSE_SUGGESTION = 'AI for Young Builders'

export const ROBOTICS_101: Curriculum = {
  key: 'robotics-101',
  courseTitle: COURSE_TITLE,
  modules: MODULES,
  videos: VIDEOS,
  videoById,
  mediaBase: MEDIA_BASE,
  resources: RESOURCES,
  resourcesFor,
  badges: BADGES,
  player: { capstone: true, notesHint: 'Write what you learned, questions to ask, or your sensor readings.' },
}
