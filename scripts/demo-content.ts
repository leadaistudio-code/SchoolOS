import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

/**
 * Demo content for the assessments and feedback modules.
 *
 *   npm run demo:content -- demo
 *
 * Deliberately not part of `db:seed`. That script builds a school from nothing
 * — two tenants, hundreds of users, every one of them holding the same
 * published password — and must never be pointed at a deployment. This one adds
 * only the rows the two new modules need, to a school that already exists, and
 * creates no users at all.
 *
 * Idempotent: it looks for what it made last time and stops rather than
 * doubling it, so re-running before a demo is safe.
 */

const prisma = new PrismaClient()

const MARK = 'Demo content' // stamped on the assessment so a re-run can find it

function target(): string {
  const url = process.env.DATABASE_URL
  if (!url) return 'no DATABASE_URL set'
  try {
    const { hostname, port, pathname } = new URL(url)
    const local = hostname === 'localhost' || hostname === '127.0.0.1'
    const internal = hostname.endsWith('.railway.internal')
    return `${hostname}:${port || '5432'}${pathname} (${local ? 'local' : internal ? 'inside Railway' : 'REMOTE'})`
  } catch {
    return 'DATABASE_URL is not a valid URL'
  }
}

/** Chapters and topics for a Class 8 science course, with real substance. */
const SYLLABUS = [
  {
    code: 'Ch 1',
    name: 'Crop Production and Management',
    topics: [
      {
        name: 'Agricultural practices',
        summary:
          'The sequence of tasks from preparing soil to harvesting: ploughing, levelling, sowing, adding manure and fertiliser, irrigation, weeding, harvesting and storage.',
        outcomes: ['List the steps of crop production in order', 'Explain why soil is loosened before sowing'],
      },
      {
        name: 'Irrigation',
        summary:
          'Sources of irrigation and the difference between traditional methods (moat, chain pump, dhekli) and modern ones (sprinkler and drip systems), including water economy.',
        outcomes: ['Compare drip and sprinkler irrigation'],
      },
      {
        name: 'Manure and fertilisers',
        summary:
          'Manure is organic and prepared from decomposed plant and animal waste; fertilisers are manufactured and nutrient-specific. Excess fertiliser harms soil fertility.',
        outcomes: ['Distinguish manure from fertiliser'],
      },
    ],
  },
  {
    code: 'Ch 2',
    name: 'Microorganisms: Friend and Foe',
    topics: [
      {
        name: 'Kinds of microorganisms',
        summary:
          'Bacteria, fungi, protozoa, algae and viruses. Viruses reproduce only inside a host cell, which sets them apart from the rest.',
        outcomes: ['Name the five groups of microorganisms'],
      },
      {
        name: 'Useful microorganisms',
        summary:
          'Fermentation in bread and curd, production of alcohol, antibiotics from bacteria and fungi, vaccines, and nitrogen fixation in soil by Rhizobium.',
        outcomes: ['Explain how curd is set from milk', 'Describe nitrogen fixation'],
      },
      {
        name: 'Harmful microorganisms and food preservation',
        summary:
          'Communicable diseases and their carriers, food poisoning and spoilage, and preservation by salt, sugar, oil, heat and pasteurisation.',
        outcomes: ['List three methods of food preservation'],
      },
    ],
  },
  {
    code: 'Ch 3',
    name: 'Coal and Petroleum',
    topics: [
      {
        name: 'Exhaustible and inexhaustible resources',
        summary:
          'Natural resources classified by whether they are limited in supply. Coal, petroleum and natural gas are exhaustible and formed over millions of years.',
        outcomes: ['Classify given resources as exhaustible or inexhaustible'],
      },
      {
        name: 'Coal and its products',
        summary:
          'Carbonisation, and the products obtained from coal: coke, coal tar and coal gas, with a use for each.',
        outcomes: ['Name three products obtained from coal'],
      },
      {
        name: 'Petroleum refining',
        summary:
          'Petroleum as a mixture separated by fractional distillation into petroleum gas, petrol, kerosene, diesel, lubricating oil and paraffin wax.',
        outcomes: ['Explain why petroleum is called black gold'],
      },
    ],
  },
]

type QuestionSpec = {
  text: string
  type: 'MCQ' | 'SHORT' | 'LONG' | 'TRUE_FALSE'
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  marks: number
  topic: string
  solution: string
  options?: { text: string; isCorrect: boolean }[]
}

const QUESTIONS: QuestionSpec[] = [
  // Section A material — one mark each.
  {
    text: 'Which of the following is the first step in crop production?',
    type: 'MCQ', difficulty: 'EASY', marks: 1, topic: 'Agricultural practices',
    solution: 'Preparation of soil',
    options: [
      { text: 'Preparation of soil', isCorrect: true },
      { text: 'Sowing', isCorrect: false },
      { text: 'Harvesting', isCorrect: false },
      { text: 'Weeding', isCorrect: false },
    ],
  },
  {
    text: 'Which irrigation method delivers water drop by drop directly to the roots?',
    type: 'MCQ', difficulty: 'EASY', marks: 1, topic: 'Irrigation',
    solution: 'Drip irrigation',
    options: [
      { text: 'Drip irrigation', isCorrect: true },
      { text: 'Sprinkler system', isCorrect: false },
      { text: 'Moat', isCorrect: false },
      { text: 'Chain pump', isCorrect: false },
    ],
  },
  {
    text: 'Which of these is a manufactured source of plant nutrients?',
    type: 'MCQ', difficulty: 'EASY', marks: 1, topic: 'Manure and fertilisers',
    solution: 'Fertiliser',
    options: [
      { text: 'Fertiliser', isCorrect: true },
      { text: 'Manure', isCorrect: false },
      { text: 'Compost', isCorrect: false },
      { text: 'Cattle dung', isCorrect: false },
    ],
  },
  {
    text: 'Which microorganism can reproduce only inside a host organism?',
    type: 'MCQ', difficulty: 'MEDIUM', marks: 1, topic: 'Kinds of microorganisms',
    solution: 'Virus',
    options: [
      { text: 'Virus', isCorrect: true },
      { text: 'Bacterium', isCorrect: false },
      { text: 'Fungus', isCorrect: false },
      { text: 'Alga', isCorrect: false },
    ],
  },
  {
    text: 'Curd is set from milk by the action of which organism?',
    type: 'MCQ', difficulty: 'EASY', marks: 1, topic: 'Useful microorganisms',
    solution: 'Lactobacillus',
    options: [
      { text: 'Lactobacillus', isCorrect: true },
      { text: 'Rhizobium', isCorrect: false },
      { text: 'Penicillium', isCorrect: false },
      { text: 'Amoeba', isCorrect: false },
    ],
  },
  {
    text: 'Which bacterium fixes atmospheric nitrogen in the root nodules of legumes?',
    type: 'MCQ', difficulty: 'MEDIUM', marks: 1, topic: 'Useful microorganisms',
    solution: 'Rhizobium',
    options: [
      { text: 'Rhizobium', isCorrect: true },
      { text: 'Lactobacillus', isCorrect: false },
      { text: 'Yeast', isCorrect: false },
      { text: 'Chlorella', isCorrect: false },
    ],
  },
  {
    text: 'Pasteurisation is used to preserve which of the following?',
    type: 'MCQ', difficulty: 'EASY', marks: 1, topic: 'Harmful microorganisms and food preservation',
    solution: 'Milk',
    options: [
      { text: 'Milk', isCorrect: true },
      { text: 'Pickles', isCorrect: false },
      { text: 'Jam', isCorrect: false },
      { text: 'Dried fish', isCorrect: false },
    ],
  },
  {
    text: 'Which of these is an inexhaustible natural resource?',
    type: 'MCQ', difficulty: 'EASY', marks: 1, topic: 'Exhaustible and inexhaustible resources',
    solution: 'Sunlight',
    options: [
      { text: 'Sunlight', isCorrect: true },
      { text: 'Coal', isCorrect: false },
      { text: 'Petroleum', isCorrect: false },
      { text: 'Natural gas', isCorrect: false },
    ],
  },
  {
    text: 'The process of converting wood into coal over millions of years is called:',
    type: 'MCQ', difficulty: 'MEDIUM', marks: 1, topic: 'Coal and its products',
    solution: 'Carbonisation',
    options: [
      { text: 'Carbonisation', isCorrect: true },
      { text: 'Fractional distillation', isCorrect: false },
      { text: 'Fermentation', isCorrect: false },
      { text: 'Pasteurisation', isCorrect: false },
    ],
  },
  {
    text: 'Petroleum is separated into its constituents by:',
    type: 'MCQ', difficulty: 'MEDIUM', marks: 1, topic: 'Petroleum refining',
    solution: 'Fractional distillation',
    options: [
      { text: 'Fractional distillation', isCorrect: true },
      { text: 'Filtration', isCorrect: false },
      { text: 'Evaporation', isCorrect: false },
      { text: 'Sublimation', isCorrect: false },
    ],
  },
  {
    text: 'Manure improves the water-holding capacity of soil.',
    type: 'TRUE_FALSE', difficulty: 'EASY', marks: 1, topic: 'Manure and fertilisers',
    solution: 'True',
    options: [
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false },
    ],
  },
  {
    text: 'All microorganisms are harmful to human beings.',
    type: 'TRUE_FALSE', difficulty: 'EASY', marks: 1, topic: 'Kinds of microorganisms',
    solution: 'False — many are useful, for example in fermentation and nitrogen fixation.',
    options: [
      { text: 'True', isCorrect: false },
      { text: 'False', isCorrect: true },
    ],
  },

  // Section B material — two marks each.
  {
    text: 'Distinguish between manure and fertiliser, giving one point of difference and one example of each.',
    type: 'SHORT', difficulty: 'MEDIUM', marks: 2, topic: 'Manure and fertilisers',
    solution:
      'Manure is organic, prepared from decomposed plant and animal waste (example: compost). Fertiliser is manufactured and supplies a specific nutrient (example: urea). One mark for the difference, one for the examples.',
  },
  {
    text: 'Why is drip irrigation considered water-efficient? Give two reasons.',
    type: 'SHORT', difficulty: 'MEDIUM', marks: 2, topic: 'Irrigation',
    solution:
      'Water is delivered directly to the roots so little is lost to evaporation; and the flow is slow and controlled so there is no run-off. One mark each.',
  },
  {
    text: 'Name any two useful microorganisms and state one use of each.',
    type: 'SHORT', difficulty: 'EASY', marks: 2, topic: 'Useful microorganisms',
    solution:
      'Any two of: Lactobacillus — sets curd from milk; yeast — fermentation in bread and alcohol; Rhizobium — fixes nitrogen in soil; Penicillium — source of the antibiotic penicillin. One mark each.',
  },
  {
    text: 'State two methods of food preservation and explain briefly how each prevents spoilage.',
    type: 'SHORT', difficulty: 'MEDIUM', marks: 2, topic: 'Harmful microorganisms and food preservation',
    solution:
      'Any two of: salting or sugaring draws water out so microorganisms cannot grow; heating or pasteurisation kills the microorganisms present; oil and vinegar cut off air and lower pH. One mark each.',
  },
  {
    text: 'Name the three products obtained from coal and state one use of each.',
    type: 'SHORT', difficulty: 'MEDIUM', marks: 2, topic: 'Coal and its products',
    solution:
      'Coke — used in steel making; coal tar — used to make dyes, explosives and paints; coal gas — used as a fuel. Two marks for all three with uses, one for a partial answer.',
  },
  {
    text: 'Why is petroleum described as "black gold"?',
    type: 'SHORT', difficulty: 'HARD', marks: 2, topic: 'Petroleum refining',
    solution:
      'Because it is dark in colour and extremely valuable: it yields petrol, diesel, kerosene, lubricants and raw material for plastics, and its supply is limited.',
  },
  {
    text: 'What is carbonisation? Why does it take millions of years?',
    type: 'SHORT', difficulty: 'HARD', marks: 2, topic: 'Coal and its products',
    solution:
      'The slow conversion of buried dead vegetation into coal under high pressure and temperature in the absence of air. It is slow because the pressure and heat build over geological time as sediment accumulates.',
  },

  // Section C material — ten marks each.
  {
    text: 'Describe the steps of crop production in order, explaining the purpose of each step.',
    type: 'LONG', difficulty: 'MEDIUM', marks: 10, topic: 'Agricultural practices',
    solution:
      'Expected points, one mark each to a maximum of ten: preparation of soil (loosening lets roots breathe and brings nutrients up); ploughing; levelling; sowing at correct depth and spacing; use of a seed drill; adding manure or fertiliser to replace nutrients; irrigation at the right intervals; weeding to remove competition; harvesting; threshing and winnowing; safe storage against moisture and pests.',
  },
  {
    text: 'Microorganisms are described as both friend and foe. Justify this statement with examples from both sides.',
    type: 'LONG', difficulty: 'HARD', marks: 10, topic: 'Useful microorganisms',
    solution:
      'Expected points: as friends — fermentation in curd, bread and alcohol; antibiotics such as penicillin; vaccines; nitrogen fixation by Rhizobium; decomposition of organic waste; cleaning of sewage. As foes — communicable diseases such as tuberculosis, cholera and measles; carriers such as the mosquito and housefly; food poisoning; spoilage of food; diseases of plants and cattle. Up to five marks for each side, credit given for named examples.',
  },
  {
    text: 'Explain the difference between exhaustible and inexhaustible natural resources, and discuss why coal and petroleum must be used carefully.',
    type: 'LONG', difficulty: 'MEDIUM', marks: 10, topic: 'Exhaustible and inexhaustible resources',
    solution:
      'Expected points: definitions of each with examples; coal and petroleum take millions of years to form so are effectively non-renewable on a human timescale; known reserves are limited; burning them causes air pollution and contributes to global warming; conservation measures — public transport, efficient engines, switching off when idling, alternative sources. Marks distributed across definition, examples and conservation.',
  },
]

async function main() {
  const slug = process.argv[2] ?? 'demo'
  console.log(`database: ${target()}`)
  console.log(`school:   ${slug}\n`)

  const tenant = await prisma.tenant.findFirst({
    where: { slug },
    include: { school: { select: { name: true } } },
  })
  if (!tenant) {
    console.error(`No school with slug "${slug}".`)
    process.exitCode = 1
    return
  }
  console.log(`Found ${tenant.school?.name ?? tenant.name}`)

  const session = await prisma.academicSession.findFirst({
    where: { tenantId: tenant.id, isCurrent: true },
  })
  if (!session) {
    console.error('That school has no current academic session.')
    process.exitCode = 1
    return
  }

  const tenantId = tenant.id

  /* ---------------------------------------------------- pick a subject ---- */
  const candidates = await prisma.classSubject.findMany({
    where: { tenantId, teacherId: { not: null }, classLevel: { sessionId: session.id } },
    include: {
      classLevel: { select: { id: true, name: true, numeric: true } },
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  const chosen =
    candidates.find((c) => c.classLevel.numeric === 8 && /science/i.test(c.subject.name)) ??
    candidates.find((c) => /science/i.test(c.subject.name)) ??
    candidates[0]

  if (!chosen) {
    console.error('No class-subject with a teacher assigned. Assign teachers in Academics first.')
    process.exitCode = 1
    return
  }

  const section = await prisma.section.findFirst({
    where: { tenantId, classLevelId: chosen.classLevel.id, deletedAt: null },
    orderBy: { name: 'asc' },
  })
  const students = await prisma.student.findMany({
    where: {
      tenantId,
      deletedAt: null,
      enrollments: { some: { isCurrent: true, ...(section ? { sectionId: section.id } : {}) } },
    },
    select: { id: true, userId: true, firstName: true, lastName: true },
    orderBy: { firstName: 'asc' },
    take: 12,
  })

  console.log(
    `Using ${chosen.classLevel.name}${section ? `-${section.name}` : ''} ${chosen.subject.name}, ` +
      `taught by ${chosen.teacher!.firstName} ${chosen.teacher!.lastName}, ${students.length} students\n`,
  )

  if (students.length === 0) {
    console.error('That section has no enrolled students.')
    process.exitCode = 1
    return
  }

  /* ------------------------------------------------------- 1. syllabus ---- */
  let curriculum = await prisma.curriculum.findFirst({
    where: { tenantId, sessionId: session.id, classSubjectId: chosen.id, deletedAt: null },
  })

  if (!curriculum) {
    curriculum = await prisma.curriculum.create({
      data: {
        tenantId,
        sessionId: session.id,
        classSubjectId: chosen.id,
        title: `${chosen.subject.name} — ${chosen.classLevel.name}`,
        board: 'CBSE',
        isPublished: true,
      },
    })

    for (const [chapterIndex, chapter] of SYLLABUS.entries()) {
      const createdChapter = await prisma.chapter.create({
        data: {
          tenantId,
          curriculumId: curriculum.id,
          name: chapter.name,
          code: chapter.code,
          position: chapterIndex,
        },
      })
      for (const [topicIndex, topic] of chapter.topics.entries()) {
        const createdTopic = await prisma.topic.create({
          data: {
            tenantId,
            chapterId: createdChapter.id,
            name: topic.name,
            summary: topic.summary,
            position: topicIndex,
          },
        })
        for (const [outcomeIndex, statement] of topic.outcomes.entries()) {
          await prisma.learningOutcome.create({
            data: { tenantId, topicId: createdTopic.id, statement, position: outcomeIndex },
          })
        }
      }
    }
    console.log(`  syllabus     ${SYLLABUS.length} chapters, published`)
  } else {
    if (!curriculum.isPublished) {
      await prisma.curriculum.update({ where: { id: curriculum.id }, data: { isPublished: true } })
    }
    console.log('  syllabus     already present')
  }

  const topics = await prisma.topic.findMany({
    where: { tenantId, chapter: { curriculumId: curriculum.id } },
    select: { id: true, name: true },
  })
  const topicByName = new Map(topics.map((topic) => [topic.name, topic.id]))

  /* -------------------------------------------------- 2. question bank ---- */
  const existingQuestions = await prisma.question.count({
    where: { tenantId, classSubjectId: chosen.id, deletedAt: null },
  })

  if (existingQuestions === 0) {
    for (const spec of QUESTIONS) {
      const topicId = topicByName.get(spec.topic)
      await prisma.question.create({
        data: {
          tenantId,
          classSubjectId: chosen.id,
          text: spec.text,
          type: spec.type,
          difficulty: spec.difficulty,
          marks: spec.marks,
          solution: spec.solution,
          status: 'APPROVED',
          origin: 'MANUAL',
          isShared: true,
          fingerprint: spec.text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(),
          ...(spec.options
            ? {
                options: {
                  create: spec.options.map((option, position) => ({
                    tenantId,
                    text: option.text,
                    isCorrect: option.isCorrect,
                    position,
                  })),
                },
              }
            : {}),
          ...(topicId ? { topics: { create: [{ tenantId, topicId }] } } : {}),
        },
      })
    }
    console.log(`  bank         ${QUESTIONS.length} questions, approved`)
  } else {
    console.log(`  bank         ${existingQuestions} questions already present`)
  }

  /* ------------------------------------------------------- 3. the paper --- */
  const paperTitle = `Unit Test I — ${chosen.subject.name}`
  let assessment = await prisma.assessment.findFirst({
    where: { tenantId, classSubjectId: chosen.id, title: paperTitle, deletedAt: null },
  })

  if (!assessment) {
    let type = await prisma.assessmentType.findFirst({ where: { tenantId, key: 'UNIT_TEST' } })
    if (!type) {
      type = await prisma.assessmentType.create({
        data: { tenantId, key: 'UNIT_TEST', name: 'Unit test', marks: 40, minutes: 60, isSystem: true },
      })
    }

    assessment = await prisma.assessment.create({
      data: {
        tenantId,
        sessionId: session.id,
        classSubjectId: chosen.id,
        sectionId: section?.id ?? null,
        assessmentTypeId: type.id,
        title: paperTitle,
        totalMarks: 40,
        durationMinutes: 60,
        instructions:
          'All questions are compulsory. Section A carries one mark each, Section B two marks each and Section C ten marks each. Write answers in the space provided.',
        answerKeyNotes: `${MARK} — marking scheme for the demonstration paper.`,
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    })

    const pool = await prisma.question.findMany({
      where: { tenantId, classSubjectId: chosen.id, deletedAt: null, status: 'APPROVED' },
      include: { options: { orderBy: { position: 'asc' } } },
    })

    const plan: { title: string; instructions: string; take: number; marks: number; types: string[] }[] = [
      { title: 'Section A', instructions: 'Multiple choice. Choose the correct option.', take: 10, marks: 1, types: ['MCQ', 'TRUE_FALSE'] },
      { title: 'Section B', instructions: 'Short answer questions.', take: 5, marks: 2, types: ['SHORT'] },
      { title: 'Section C', instructions: 'Long answer questions.', take: 2, marks: 10, types: ['LONG'] },
    ]

    let placedTotal = 0
    for (const [sectionIndex, part] of plan.entries()) {
      const paperSection = await prisma.assessmentSection.create({
        data: {
          tenantId,
          assessmentId: assessment.id,
          title: part.title,
          instructions: part.instructions,
          position: sectionIndex,
        },
      })

      const picks = pool
        .filter((question) => part.types.includes(question.type) && question.marks === part.marks)
        .slice(0, part.take)

      for (const [position, question] of picks.entries()) {
        await prisma.assessmentQuestion.create({
          data: {
            tenantId,
            assessmentId: assessment.id,
            sectionId: paperSection.id,
            questionId: question.id,
            position,
            marks: question.marks,
            textSnapshot: question.text,
            optionsSnapshot:
              question.options.length > 0
                ? question.options.map((option) => ({
                    text: option.text,
                    isCorrect: option.isCorrect,
                    matchWith: option.matchWith,
                  }))
                : undefined,
            answerSnapshot: question.solution,
            typeSnapshot: question.type,
            difficultySnapshot: question.difficulty,
          },
        })
        placedTotal += question.marks
        await prisma.questionUsage.createMany({
          data: [{ tenantId, questionId: question.id, assessmentId: assessment.id }],
          skipDuplicates: true,
        })
      }
    }

    // The builder refuses to approve an unbalanced paper, so the demo data must
    // not be one either — otherwise the first thing shown is a warning banner.
    if (placedTotal !== 40) {
      await prisma.assessment.update({
        where: { id: assessment.id },
        data: { totalMarks: placedTotal },
      })
    }
    console.log(`  paper        ${paperTitle}, ${placedTotal} marks, approved`)
  } else {
    console.log('  paper        already present')
  }

  /* --------------------------------------------------- 4. the sitting ----- */
  let assignment = await prisma.assessmentAssignment.findFirst({
    where: { tenantId, assessmentId: assessment.id, deletedAt: null },
  })

  if (!assignment) {
    assignment = await prisma.assessmentAssignment.create({
      data: {
        tenantId,
        assessmentId: assessment.id,
        classLevelId: chosen.classLevel.id,
        sectionId: section?.id ?? null,
        mode: 'ONLINE',
        opensAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        autoSubmit: true,
        attemptLimit: 1,
      },
    })
    await prisma.assessment.update({
      where: { id: assessment.id },
      data: { status: 'ASSIGNED' },
    })
    console.log('  assigned     online, open now, closes in five days')
  } else {
    console.log('  assigned     already present')
  }

  const placements = await prisma.assessmentQuestion.findMany({
    where: { tenantId, assessmentId: assessment.id },
    orderBy: { position: 'asc' },
  })

  const existingAttempts = await prisma.assessmentAttempt.count({
    where: { tenantId, assignmentId: assignment.id },
  })

  if (existingAttempts === 0 && placements.length > 0) {
    // A spread of states, so every screen has something in it: marked and
    // released, marked but held back, submitted and waiting, and one still in
    // progress. Two students have not started, which is what the "not started"
    // column exists to show.
    const plan = [
      { state: 'released', accuracy: 0.9 },
      { state: 'released', accuracy: 0.75 },
      { state: 'released', accuracy: 0.55 },
      { state: 'marked', accuracy: 0.8 },
      { state: 'submitted', accuracy: 0.65 },
      { state: 'submitted', accuracy: 0.45 },
      { state: 'submitted', accuracy: 0.85 },
      { state: 'in_progress', accuracy: 0.5 },
    ] as const

    for (const [index, student] of students.slice(0, plan.length).entries()) {
      const spec = plan[index]!
      const attempt = await prisma.assessmentAttempt.create({
        data: {
          tenantId,
          assignmentId: assignment.id,
          studentId: student.id,
          attemptNumber: 1,
          status: spec.state === 'in_progress' ? 'IN_PROGRESS' : 'SUBMITTED',
          startedAt: new Date(Date.now() - 90 * 60 * 1000),
          submittedAt: spec.state === 'in_progress' ? null : new Date(Date.now() - 30 * 60 * 1000),
        },
      })

      let objective = 0
      let written = 0

      for (const [position, placement] of placements.entries()) {
        // Deterministic rather than random: the same student is right on the
        // same questions every run, so a demo can be rehearsed.
        const correct = (position * 7 + index * 3) % 100 < spec.accuracy * 100
        const options = Array.isArray(placement.optionsSnapshot)
          ? (placement.optionsSnapshot as { text: string; isCorrect?: boolean }[])
          : []

        if (options.length > 0) {
          const correctIndex = options.findIndex((option) => option.isCorrect)
          const chosenIndex = correct
            ? correctIndex
            : (correctIndex + 1) % options.length
          const awarded = chosenIndex === correctIndex ? placement.marks : 0
          objective += awarded

          await prisma.studentAnswer.create({
            data: {
              tenantId,
              attemptId: attempt.id,
              assessmentQuestionId: placement.id,
              selectedIndexes: [chosenIndex],
              isCorrect: awarded > 0,
              marksAwarded: awarded,
            },
          })
        } else if (spec.state !== 'in_progress' || position < 12) {
          const awarded =
            spec.state === 'released' || spec.state === 'marked'
              ? Math.round(placement.marks * spec.accuracy * 2) / 2
              : null
          if (awarded !== null) written += awarded

          await prisma.studentAnswer.create({
            data: {
              tenantId,
              attemptId: attempt.id,
              assessmentQuestionId: placement.id,
              responseText:
                'Manure is made from decomposed plant and animal waste and adds humus to the soil, while fertilisers are made in a factory and supply one nutrient. Manure improves the soil itself; fertiliser only feeds the crop.',
              ...(awarded !== null
                ? { marksAwarded: awarded, isCorrect: awarded >= placement.marks }
                : {}),
            },
          })
        }
      }

      const finished = spec.state === 'released' || spec.state === 'marked'
      await prisma.assessmentAttempt.update({
        where: { id: attempt.id },
        data: {
          objectiveScore: spec.state === 'in_progress' ? null : objective,
          ...(finished
            ? {
                status: 'EVALUATED',
                totalScore: objective + written,
                evaluatedAt: new Date(),
                teacherComment:
                  'Good grasp of the factual questions. Work on writing fuller answers in Section C — list the points before you write.',
              }
            : {}),
          ...(spec.state === 'released' ? { publishedAt: new Date() } : {}),
        },
      })
    }
    console.log(`  attempts     ${plan.length} across every state, 3 released`)
  } else {
    console.log(`  attempts     ${existingAttempts} already present`)
  }

  /* ---------------------------------------------------- 5. feedback ------- */
  const templateName = 'Fortnightly teacher feedback'
  let template = await prisma.feedbackTemplate.findFirst({
    where: { tenantId, name: templateName, deletedAt: null },
    include: { questions: true },
  })

  if (!template) {
    template = await prisma.feedbackTemplate.create({
      data: {
        tenantId,
        name: templateName,
        audience: 'STUDENT',
        target: 'TEACHER',
        isAnonymousToTarget: true,
        minimumResponses: 5,
        questions: {
          create: [
            { tenantId, label: 'My teacher explains ideas in a way I understand.', category: 'Clarity', type: 'RATING_5', sortOrder: 0 },
            { tenantId, label: 'I feel able to ask questions in this class.', category: 'Support', type: 'RATING_5', sortOrder: 1 },
            { tenantId, label: 'The pace of the class suits me.', category: 'Pace', type: 'RATING_5', sortOrder: 2 },
            { tenantId, label: 'My teacher treats everyone with respect.', category: 'Respect', type: 'RATING_5', sortOrder: 3 },
            { tenantId, label: 'The classes hold my attention.', category: 'Engagement', type: 'RATING_5', sortOrder: 4 },
            { tenantId, label: 'What do you like most about these classes?', category: 'Appreciation', type: 'LONG_TEXT', required: false, sortOrder: 5 },
            { tenantId, label: 'What would make these classes better?', category: 'Suggestion', type: 'LONG_TEXT', required: false, sortOrder: 6 },
            { tenantId, label: 'Is there anything in this class that makes you uncomfortable or worried?', category: 'Concern', type: 'YES_NO', isConcern: true, sortOrder: 7 },
          ],
        },
      },
      include: { questions: true },
    })
    console.log(`  template     ${templateName}, 8 questions`)
  } else {
    console.log('  template     already present')
  }

  let campaign = await prisma.feedbackCampaign.findFirst({
    where: { tenantId, templateId: template.id },
  })

  if (!campaign) {
    campaign = await prisma.feedbackCampaign.create({
      data: {
        tenantId,
        templateId: template.id,
        sessionId: session.id,
        name: 'August fortnightly feedback',
        audience: 'STUDENT',
        target: 'TEACHER',
        status: 'ACTIVE',
        frequency: 'FORTNIGHTLY',
        startsAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000),
        classLevelIds: [chosen.classLevel.id],
        sectionIds: section ? [section.id] : [],
        subjectIds: [chosen.subject.id],
        teacherIds: [chosen.teacher!.id],
        studentIds: [],
        isAnonymousToTarget: true,
        minimumResponses: 5,
      },
    })
    console.log('  campaign     August fortnightly feedback, active')
  } else {
    console.log('  campaign     already present')
  }

  const existingAssignments = await prisma.feedbackAssignment.count({
    where: { tenantId, campaignId: campaign.id },
  })

  if (existingAssignments === 0) {
    const periodKey = new Date().toISOString().slice(0, 10)
    const ratingQuestions = template.questions.filter((q) => q.type === 'RATING_5')
    const likeQuestion = template.questions.find((q) => q.category === 'Appreciation')
    const betterQuestion = template.questions.find((q) => q.category === 'Suggestion')
    const concernQuestion = template.questions.find((q) => q.isConcern)

    const comments = [
      ['The examples from real farming made it click.', 'A bit more time on the numerical parts.'],
      ['Ma’am never makes you feel silly for asking.', 'Sometimes we move on before I finish writing.'],
      ['The experiments in the microorganism chapter.', 'More practice questions before the test.'],
      ['Clear board work, easy to copy.', 'The last ten minutes feel rushed.'],
      ['She checks whether we understood before moving on.', 'Nothing, the class is good.'],
      ['Good revision sheets.', 'Could we have the notes a day earlier?'],
      ['I like that we discuss answers together.', 'Slightly slower in the coal chapter please.'],
    ]

    for (const [index, student] of students.slice(0, 9).entries()) {
      const assignmentRow = await prisma.feedbackAssignment.create({
        data: {
          tenantId,
          campaignId: campaign.id,
          templateId: template.id,
          studentId: student.id,
          targetStaffId: chosen.teacher!.id,
          subjectId: chosen.subject.id,
          classLevelId: chosen.classLevel.id,
          sectionId: section?.id ?? null,
          periodKey,
          dueAt: campaign.endsAt,
          status: index < 7 ? 'SUBMITTED' : 'PENDING',
          submittedAt: index < 7 ? new Date(Date.now() - index * 3600_000) : null,
        },
      })

      // Two of the nine are left pending on purpose, so the response rate is a
      // real number rather than a flat hundred per cent.
      if (index >= 7 || !student.userId) continue

      const response = await prisma.feedbackResponse.create({
        data: {
          tenantId,
          assignmentId: assignmentRow.id,
          respondentUserId: student.userId,
          studentId: student.id,
          submittedAt: new Date(Date.now() - index * 3600_000),
          answers: {
            create: [
              ...ratingQuestions.map((question, questionIndex) => ({
                tenantId,
                questionId: question.id,
                // 3 to 5, varied by student and question so the averages differ
                // per category rather than every bar reading the same.
                rating: 3 + ((index + questionIndex) % 3),
              })),
              ...(likeQuestion
                ? [{ tenantId, questionId: likeQuestion.id, value: comments[index % comments.length]![0] }]
                : []),
              ...(betterQuestion
                ? [{ tenantId, questionId: betterQuestion.id, value: comments[index % comments.length]![1] }]
                : []),
              ...(concernQuestion
                ? [{ tenantId, questionId: concernQuestion.id, value: index === 4 ? 'YES' : 'NO' }]
                : []),
            ],
          },
        },
      })

      // One flagged concern, so the confidential queue has something in it the
      // day that screen is built.
      if (index === 4) {
        await prisma.feedbackConcern.create({
          data: {
            tenantId,
            responseId: response.id,
            detail:
              'Some students at the back talk through the lesson and it is hard to hear. I did not want to say it in front of the class.',
            status: 'NEW',
          },
        })
      }
    }
    console.log('  responses    7 of 9 submitted, 1 concern flagged')
  } else {
    console.log(`  responses    ${existingAssignments} assignments already present`)
  }

  console.log('\nDone. Sign in and open Academics → Syllabus, Assessments, and Feedback.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
