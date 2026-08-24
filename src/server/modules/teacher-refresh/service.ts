import { AppContext } from '@/server/context'
import { TeacherRefreshType, TeacherRefreshStatus } from '@prisma/client'
import { ApiException } from '@/server/api/response'
import { assistantConfigured, assistantModel } from '@/server/assistant/providers'
import { zodToJsonSchema } from '@/server/assistant/json-schema'
import { z } from 'zod'

export async function getPendingRefreshers(ctx: AppContext, teacherId: string) {
  return ctx.db.teacherRefreshAssessment.findMany({
    where: { 
      tenantId: ctx.tenant.id,
      teacherId,
      status: 'PENDING'
    },
    include: {
      classSubject: {
        include: {
          classLevel: true,
          subject: true,
        }
      }
    }
  })
}

export async function getRefresher(ctx: AppContext, id: string) {
  return ctx.db.teacherRefreshAssessment.findUnique({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      classSubject: {
        include: { classLevel: true, subject: true }
      },
      questions: {
        include: {
          question: {
            include: { options: true }
          }
        },
        orderBy: { position: 'asc' }
      }
    }
  })
}

export async function submitRefresherAttempt(
  ctx: AppContext, 
  assessmentId: string, 
  answers: { refreshQuestionId: string, selectedIndexes: number[] }[]
) {
  const assessment = await getRefresher(ctx, assessmentId)
  if (!assessment) throw new Error('Not found')
  
  if (assessment.status !== 'PENDING') {
    throw new Error('Assessment is no longer pending')
  }

  let score = 0
  let maxScore = assessment.questions.length

  const attemptAnswers = assessment.questions.map(rq => {
    const answer = answers.find(a => a.refreshQuestionId === rq.id)
    const selectedIndex = answer ? answer.selectedIndexes[0] : undefined
    const isCorrect = selectedIndex !== undefined 
      ? rq.question.options[selectedIndex]?.isCorrect ?? false 
      : false

    if (isCorrect) score += 1

    return {
      refreshQuestionId: rq.id,
      selectedIndexes: answer ? answer.selectedIndexes : [],
      isCorrect
    }
  })

  // Basic 2-Minute refresh feedback generation
  let feedback = null
  if (assistantConfigured()) {
    try {
      const model = assistantModel()
      const incorrectQuestions = assessment.questions.filter((rq, i) => !attemptAnswers[i]?.isCorrect)
      
      if (incorrectQuestions.length > 0) {
        const prompt = `You are a helpful teacher trainer. The teacher just completed a quick knowledge refresh and missed these concepts:
        ${incorrectQuestions.map(rq => `- Question: ${rq.question.text}\nCorrect Answer: ${rq.question.solution}`).join('\n')}
        
        Write a concise, encouraging "2-Minute Refresh" revision note (max 3 short paragraphs) focusing on the underlying concepts and common student misconceptions for these topics.`

        const result = await model.turn({
          system: 'You are a supportive academic mentor for teachers.',
          turns: [{ role: 'user', text: prompt }],
          tools: [],
          onText: (_delta) => {},
        })
        feedback = { note: result.text }
      } else {
        feedback = { note: "Perfect score! You're fully prepared for these topics. Keep up the excellent work!" }
      }
    } catch (e) {
      console.error('Feedback generation failed', e)
    }
  }

  const attempt = await ctx.db.teacherRefreshAttempt.create({
    data: {
      tenantId: ctx.tenant.id,
      assessmentId,
      teacherId: assessment.teacherId,
      score,
      maxScore,
      submittedAt: new Date(),
      feedback: feedback ?? { note: '' }, // Provide a default value if feedback is null
      answers: {
        create: attemptAnswers.map(a => ({
          tenantId: ctx.tenant.id,
          refreshQuestionId: a.refreshQuestionId,
          selectedIndexes: a.selectedIndexes,
          isCorrect: a.isCorrect
        }))
      }
    }
  })

  await ctx.db.teacherRefreshAssessment.update({
    where: { id: assessmentId },
    data: { status: 'COMPLETED' }
  })

  return attempt
}

export async function generateRefresher(
  ctx: AppContext,
  teacherId: string,
  classSubjectId: string,
  type: TeacherRefreshType,
  count: number = 5
) {
  // Find published questions for this classSubject
  const availableQuestions = await ctx.db.question.findMany({
    where: {
      tenantId: ctx.tenant.id,
      classSubjectId,
      status: 'APPROVED',
      deletedAt: null,
      type: { in: ['MCQ', 'TRUE_FALSE'] } // Only objective for quick refreshers for now
    },
    select: { id: true },
    take: 100 // Grab up to 100 to randomly select from
  })

  if (availableQuestions.length === 0) {
    throw new Error('Not enough approved objective questions in the bank for this subject.')
  }

  // Shuffle and pick
  const shuffled = availableQuestions.sort(() => 0.5 - Math.random())
  const selected = shuffled.slice(0, count)

  const dueAt = new Date()
  dueAt.setHours(dueAt.getHours() + 48) // Default 48h completion window

  return ctx.db.teacherRefreshAssessment.create({
    data: {
      tenantId: ctx.tenant.id,
      teacherId,
      classSubjectId,
      type,
      status: 'PENDING',
      scheduledAt: new Date(),
      dueAt,
      questionCount: selected.length,
      questions: {
        create: selected.map((q, idx) => ({
          tenantId: ctx.tenant.id,
          questionId: q.id,
          position: idx
        }))
      }
    }
  })
}
