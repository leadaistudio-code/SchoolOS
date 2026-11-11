import type { PrismaClient } from '@prisma/client'

/**
 * Two short videos and a quiz at the start of "Build the robot" in the
 * Robotics 101 catalogue course. Idempotent: does nothing once the first video
 * lesson exists, so it is safe to run against a database that already has it.
 */

const COURSE_TITLE = 'Robotics 101: Build a line-follower'
const MODULE_TITLE = 'Build the robot'

const LESSONS = [
  {
    title: 'Video: How a robot sees the line',
    kind: 'VIDEO' as const,
    durationMinutes: 1,
    videoUrl: '/lms-media/lms-line-follower-ir-sensors.mp4',
    body: [
      '# What to watch for',
      '',
      '- Under the front of the robot are two **IR (infrared) sensors**, just above the tape.',
      '- Each sensor shines invisible IR light down and measures how much bounces back.',
      '- **White floor** reflects a lot of light. **Black tape** absorbs it, so very little comes back.',
      '- That is how the robot "sees" the line: one sensor on black, the other on white.',
      '',
      '# Why it wiggles',
      '',
      'When the left sensor sees black, the robot has drifted right, so it turns left a little. When the right sensor sees black, it turns right. Lots of tiny corrections look like a wiggle, and keep it on the line.',
      '',
      '**Try it:** watch the video again and say out loud which way the robot will turn next.',
    ].join('\n'),
  },
  {
    title: 'Video: Driving the motors',
    kind: 'VIDEO' as const,
    durationMinutes: 1,
    videoUrl: '/lms-media/lms-motor-driver.mp4',
    body: [
      '# The parts on the bench',
      '',
      '- **Arduino Uno**: the brain. It runs your program.',
      '- **L298N motor driver** (the red board): the muscle. The Arduino cannot power a motor directly, so it tells the driver what to do and the driver sends battery power to the motors.',
      '- **Two DC gear motors** with wheels, and a **battery pack**.',
      '',
      '# Making it move',
      '',
      '- Both wheels forward: the robot drives straight.',
      '- One wheel forward, the other backward: the robot **spins on the spot**.',
      '- One wheel slower than the other: the robot **curves** towards the slower side. This is what a line-follower uses.',
      '',
      '**Safety:** unplug the battery before you change any wires.',
    ].join('\n'),
  },
  {
    title: 'Quiz: Sensors and motors',
    kind: 'QUIZ' as const,
    durationMinutes: 5,
    passPercent: 60,
    quiz: {
      questions: [
        {
          id: 'q1',
          prompt: 'Why does black tape look different to an IR sensor than a white floor?',
          multiple: false,
          options: [
            { id: 'a', text: 'Black tape absorbs the IR light, so little bounces back', correct: true },
            { id: 'b', text: 'Black tape is warmer than the floor', correct: false },
            { id: 'c', text: 'The sensor can see colours like a camera', correct: false },
          ],
          explanation: 'IR sensors measure reflected light. Dark surfaces absorb it; light surfaces reflect it.',
        },
        {
          id: 'q2',
          prompt: 'The left sensor sees the black line. Which way should the robot turn?',
          multiple: false,
          options: [
            { id: 'a', text: 'Left', correct: true },
            { id: 'b', text: 'Right', correct: false },
            { id: 'c', text: 'Stop and reverse', correct: false },
          ],
          explanation: 'The line is under the left side, so the robot has drifted right. Turning left brings it back over the line.',
        },
        {
          id: 'q3',
          prompt: 'Why do we need an L298N motor driver?',
          multiple: false,
          options: [
            { id: 'a', text: 'The Arduino cannot supply enough power to run motors directly', correct: true },
            { id: 'b', text: 'It makes the motors quieter', correct: false },
            { id: 'c', text: 'It replaces the battery', correct: false },
          ],
          explanation: 'The Arduino sends small control signals; the driver switches the bigger battery current to the motors.',
        },
        {
          id: 'q4',
          prompt: 'How can a two-wheeled robot turn? Choose all that are correct.',
          multiple: true,
          options: [
            { id: 'a', text: 'Run one wheel slower than the other', correct: true },
            { id: 'b', text: 'Run the wheels in opposite directions', correct: true },
            { id: 'c', text: 'Run both wheels forward at the same speed', correct: false },
          ],
          explanation: 'Different speeds make it curve; opposite directions make it spin on the spot. Equal speeds go straight.',
        },
        {
          id: 'q5',
          prompt: 'What should you do before changing any wires?',
          multiple: false,
          options: [
            { id: 'a', text: 'Unplug the battery', correct: true },
            { id: 'b', text: 'Turn the motors on to test them', correct: false },
            { id: 'c', text: 'Nothing, it is always safe', correct: false },
          ],
        },
      ],
    },
  },
]

export async function addStarterVideoLessons(prisma: PrismaClient): Promise<'added' | 'present' | 'no-course'> {
  const course = await prisma.lmsCourse.findFirst({ where: { tenantId: null, title: COURSE_TITLE, deletedAt: null }, select: { id: true } })
  if (!course) return 'no-course'
  const mod = await prisma.lmsModule.findFirst({ where: { courseId: course.id, title: MODULE_TITLE }, select: { id: true } })
  if (!mod) return 'no-course'
  if (await prisma.lmsLesson.findFirst({ where: { moduleId: mod.id, title: LESSONS[0]!.title } })) return 'present'

  await prisma.$transaction(async (tx) => {
    await tx.lmsLesson.updateMany({ where: { moduleId: mod.id }, data: { position: { increment: LESSONS.length } } })
    let position = 0
    for (const lesson of LESSONS) {
      await tx.lmsLesson.create({ data: { ...lesson, tenantId: null, courseId: course.id, moduleId: mod.id, position: ++position } })
    }
  })
  return 'added'
}
