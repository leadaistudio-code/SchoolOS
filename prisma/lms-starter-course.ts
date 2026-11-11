import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * The Robotics 101 catalogue course (tenantId null), published. Returns null
 * when it already exists, so it is safe to run against any database.
 */

export const STARTER_COURSE_TITLE = 'Robotics 101: Build a line-follower'

const MODULES: { module: string; items: Record<string, unknown>[] }[] = [
  {
    module: 'How robots work',
    items: [
      {
        title: 'Sense, think, act',
        kind: 'TEXT',
        durationMinutes: 10,
        body: '# Every robot does three things\n\n- **Sense**: sensors measure the world (light, distance, touch).\n- **Think**: a microcontroller decides what to do.\n- **Act**: motors, lights and buzzers do it.\n\nA line-follower *senses* the line with IR sensors, *thinks* about which way it is drifting and *acts* by changing motor speeds.',
      },
      {
        title: 'Quick check',
        kind: 'QUIZ',
        durationMinutes: 5,
        passPercent: 60,
        quiz: {
          questions: [
            {
              id: 'q1',
              prompt: 'Which part of a robot makes decisions?',
              multiple: false,
              options: [
                { id: 'a', text: 'The motor', correct: false },
                { id: 'b', text: 'The microcontroller', correct: true },
                { id: 'c', text: 'The wheel', correct: false },
              ],
              explanation: 'The microcontroller (for example an Arduino) runs the program that decides.',
            },
            {
              id: 'q2',
              prompt: 'Which of these are sensors?',
              multiple: true,
              options: [
                { id: 'a', text: 'IR sensor', correct: true },
                { id: 'b', text: 'Ultrasonic distance sensor', correct: true },
                { id: 'c', text: 'DC motor', correct: false },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    module: 'Build the robot',
    items: [
      {
        title: 'Reading the IR sensor',
        kind: 'CODE',
        durationMinutes: 15,
        codeLanguage: 'arduino',
        body: 'Upload this sketch and open the Serial Monitor. Move the sensor over black tape and white paper and watch the value change.',
        code: 'const int SENSOR = 2;\n\nvoid setup() {\n  pinMode(SENSOR, INPUT);\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int onLine = digitalRead(SENSOR);\n  Serial.println(onLine ? "Black line" : "White floor");\n  delay(200);\n}',
      },
      {
        title: 'Project: follow the line',
        kind: 'PROJECT',
        durationMinutes: 60,
        body: '# Your challenge\n\nBuild a robot that follows a black line around a track.\n\n1. Mount two IR sensors at the front, about 2 cm apart.\n2. If the left sensor sees black, slow the left motor.\n3. If the right sensor sees black, slow the right motor.\n4. Test on a simple oval first, then try a figure of eight.\n\n**Share** a short video of your robot with your teacher.',
      },
    ],
  },
]

export async function createStarterCourse(prisma: PrismaClient): Promise<{ id: string } | null> {
  if (await prisma.lmsCourse.findFirst({ where: { tenantId: null, title: STARTER_COURSE_TITLE, deletedAt: null } })) return null

  return prisma.$transaction(async (tx) => {
    const course = await tx.lmsCourse.create({
      data: {
        tenantId: null,
        title: STARTER_COURSE_TITLE,
        subtitle: 'Sensors, motors and your first Arduino program',
        description: 'A hands-on first robotics course. Students learn how a robot senses, decides and moves, then build a robot that follows a black line.',
        category: 'ROBOTICS',
        level: 'BEGINNER',
        gradeFrom: 5,
        gradeTo: 8,
        outcomes: ['Explain sense, think, act', 'Read an IR sensor', 'Drive two motors with a motor driver', 'Write a simple line-following program'],
        status: 'PUBLISHED',
        publishedAt: new Date(),
        createdByLabel: 'MyCampusView',
      },
      select: { id: true },
    })
    let modulePosition = 0
    for (const m of MODULES) {
      const mod = await tx.lmsModule.create({ data: { tenantId: null, courseId: course.id, title: m.module, position: ++modulePosition } })
      let position = 0
      for (const l of m.items) {
        await tx.lmsLesson.create({
          data: { ...(l as object), tenantId: null, courseId: course.id, moduleId: mod.id, position: ++position } as Prisma.LmsLessonUncheckedCreateInput,
        })
      }
    }
    return course
  })
}
