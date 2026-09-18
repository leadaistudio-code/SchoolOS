import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import type { AppContext } from '@/server/context'
import { ApiException, notFound } from '@/server/api/response'
import { audit } from '@/server/audit'
import { uploadFile } from '@/server/files'
import { prisma } from '@/server/db/prisma'
import { assertClassSubjectAccess, assertStudentAccess } from '@/server/scope'
import { teacherAssignments, assignmentProgress } from '@/server/modules/assessments/attempts'

export const enqueueSheetSchema = z.object({
  assignmentId: z.string().min(8),
  studentId: z.string().min(8),
  attemptId: z.string().min(8).optional(),
  pageCount: z.coerce.number().int().min(1).max(40).default(1),
})

export const reviewAnswerSchema = z.object({
  reviewStatus: z.enum(['APPROVED', 'OVERRIDDEN', 'FLAGGED']),
  teacherMarks: z.coerce.number().min(0).max(100).optional(),
  teacherFeedback: z.string().trim().max(4000).optional(),
})

/**
 * Queues a handwritten answer sheet for async AI evaluation.
 * HTTP returns immediately; the worker advances the job.
 */
export async function uploadAnswerSheet(
  ctx: AppContext,
  input: z.infer<typeof enqueueSheetSchema>,
  file: File,
) {
  ctx.require('assessments.evaluate')

  const assignment = await ctx.db.assessmentAssignment.findFirst({
    where: { id: input.assignmentId, deletedAt: null },
    select: {
      id: true,
      assessment: { select: { id: true, classSubjectId: true, title: true } },
    },
  })
  if (!assignment) throw notFound('Assignment')

  await assertClassSubjectAccess(ctx, assignment.assessment.classSubjectId)
  await assertStudentAccess(ctx, input.studentId)

  const { assertAiEvalPagesQuota } = await import('@/server/modules/ai-assessment/usage')
  await assertAiEvalPagesQuota(ctx.tenant.id, input.pageCount)

  // Prevent duplicate in-flight jobs for the same student + assignment + file fingerprint window.
  const existingQueued = await ctx.db.answerSheet.findFirst({
    where: {
      assignmentId: input.assignmentId,
      studentId: input.studentId,
      status: { in: ['QUEUED', 'PROCESSING'] },
    },
    select: { id: true },
  })
  if (existingQueued) {
    throw new ApiException(
      409,
      'ALREADY_QUEUED',
      'An answer sheet for this student is already queued or processing. Wait for it to finish, or open the existing job.',
    )
  }

  if (input.attemptId) {
    const attempt = await ctx.db.assessmentAttempt.findFirst({
      where: {
        id: input.attemptId,
        assignmentId: input.assignmentId,
        studentId: input.studentId,
      },
      select: { id: true },
    })
    if (!attempt) throw new ApiException(404, 'NOT_FOUND', 'Attempt not found for this student')
  }

  const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  if (!allowed.has(file.type) && file.type) {
    // uploadFile also validates; soft tip for clearer UX before bytes hit storage
  }

  const uploaded = await uploadFile(ctx, file, 'answer-sheets')

  const sheet = await ctx.db.answerSheet.create({
    data: {
      tenantId: ctx.tenant.id,
      assignmentId: input.assignmentId,
      studentId: input.studentId,
      attemptId: input.attemptId ?? null,
      storageKey: uploaded.storageKey,
      fileName: uploaded.fileName,
      mimeType: uploaded.mimeType,
      sizeBytes: uploaded.sizeBytes,
      pageCount: input.pageCount,
      status: 'QUEUED',
      uploadedById: ctx.user.userId,
    },
  })

  const evaluationJob = await ctx.db.evaluationJob.create({
    data: {
      tenantId: ctx.tenant.id,
      answerSheetId: sheet.id,
      status: 'QUEUED',
    },
  })

  const workerJob = await prisma.job.create({
    data: {
      tenantId: ctx.tenant.id,
      queue: 'evaluation',
      name: 'evaluation.process',
      payload: {
        evaluationJobId: evaluationJob.id,
        answerSheetId: sheet.id,
        tenantId: ctx.tenant.id,
      },
      maxAttempts: 3,
    },
    select: { id: true },
  })

  await ctx.db.evaluationJob.update({
    where: { id: evaluationJob.id },
    data: { workerJobId: workerJob.id },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    module: 'assessments',
    action: 'answer_sheet.uploaded',
    entityType: 'AnswerSheet',
    entityId: sheet.id,
    summary: `Uploaded answer sheet for ${assignment.assessment.title}`,
    after: {
      assignmentId: input.assignmentId,
      studentId: input.studentId,
      evaluationJobId: evaluationJob.id,
    },
  })

  return {
    answerSheetId: sheet.id,
    evaluationJobId: evaluationJob.id,
    workerJobId: workerJob.id,
    status: 'QUEUED' as const,
  }
}

export async function listUploadTargets(ctx: AppContext) {
  ctx.require('assessments.evaluate')
  const assignments = await teacherAssignments(ctx)
  return assignments.map((row) => ({
    id: row.id,
    mode: row.mode,
    dueAt: row.dueAt,
    sectionName: row.section?.name ?? null,
    className: row.classLevel?.name ?? null,
    paperId: row.assessment.id,
    title: row.assessment.title,
    totalMarks: row.assessment.totalMarks,
    subject: row.assessment.classSubject.subject.name,
    attemptCount: row._count.attempts,
  }))
}

export async function studentsForAssignment(ctx: AppContext, assignmentId: string) {
  ctx.require('assessments.evaluate')
  const progress = await assignmentProgress(ctx, assignmentId)
  return {
    assignment: progress.assignment,
    students: progress.rows.map((row) => ({
      studentId: row.studentId,
      name: row.name,
      attemptId: row.attemptId,
      status: row.status,
    })),
  }
}

export async function listEvaluationJobs(ctx: AppContext, take = 40) {
  ctx.require('assessments.evaluate')
  return ctx.db.evaluationJob.findMany({
    take,
    orderBy: { createdAt: 'desc' },
    include: {
      answerSheet: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          status: true,
          pageCount: true,
          studentId: true,
          assignmentId: true,
          storageKey: true,
          student: { select: { firstName: true, lastName: true, admissionNo: true } },
          assignment: {
            select: {
              assessment: { select: { id: true, title: true } },
            },
          },
        },
      },
      _count: { select: { answers: true } },
    },
  })
}

export async function getEvaluationJob(ctx: AppContext, jobId: string) {
  ctx.require('assessments.evaluate')
  const job = await ctx.db.evaluationJob.findFirst({
    where: { id: jobId },
    include: {
      answerSheet: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          pageCount: true,
          status: true,
          storageKey: true,
          studentId: true,
          assignmentId: true,
          attemptId: true,
          createdAt: true,
          student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
          assignment: {
            select: {
              id: true,
              mode: true,
              assessment: {
                select: {
                  id: true,
                  title: true,
                  totalMarks: true,
                  classSubjectId: true,
                  classSubject: {
                    select: {
                      classLevel: { select: { name: true } },
                      subject: { select: { name: true } },
                    },
                  },
                  questions: {
                    orderBy: { position: 'asc' },
                    select: {
                      id: true,
                      position: true,
                      marks: true,
                      textSnapshot: true,
                      answerSnapshot: true,
                      typeSnapshot: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      answers: {
        orderBy: [{ questionNumber: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })
  if (!job) throw notFound('Evaluation job')
  await assertClassSubjectAccess(ctx, job.answerSheet.assignment.assessment.classSubjectId)
  return job
}

export async function retryEvaluationJob(ctx: AppContext, jobId: string) {
  ctx.require('assessments.evaluate')
  const job = await getEvaluationJob(ctx, jobId)

  if (!['FAILED', 'REVIEW_REQUIRED'].includes(job.status)) {
    throw new ApiException(
      409,
      'NOT_RETRYABLE',
      'Only failed or review-required jobs can be re-queued.',
    )
  }

  const { assertAiEvalPagesQuota } = await import('@/server/modules/ai-assessment/usage')
  await assertAiEvalPagesQuota(ctx.tenant.id, job.answerSheet.pageCount)

  // Clear stub answers so the worker rebuilds placeholders (Phase 4: re-run OCR).
  await ctx.db.evaluatedAnswer.deleteMany({ where: { evaluationJobId: job.id } })

  await ctx.db.evaluationJob.update({
    where: { id: job.id },
    data: {
      status: 'QUEUED',
      lastError: null,
      finishedAt: null,
      startedAt: null,
    },
  })
  await ctx.db.answerSheet.update({
    where: { id: job.answerSheetId },
    data: { status: 'QUEUED' },
  })

  const workerJob = await prisma.job.create({
    data: {
      tenantId: ctx.tenant.id,
      queue: 'evaluation',
      name: 'evaluation.process',
      payload: {
        evaluationJobId: job.id,
        answerSheetId: job.answerSheetId,
        tenantId: ctx.tenant.id,
      },
      maxAttempts: 3,
    },
    select: { id: true },
  })

  await ctx.db.evaluationJob.update({
    where: { id: job.id },
    data: { workerJobId: workerJob.id },
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    module: 'assessments',
    action: 'evaluation_job.retry',
    entityType: 'EvaluationJob',
    entityId: job.id,
    summary: 'Re-queued answer sheet evaluation',
  })

  return { evaluationJobId: job.id, workerJobId: workerJob.id, status: 'QUEUED' as const }
}

export async function reviewEvaluatedAnswer(
  ctx: AppContext,
  answerId: string,
  input: z.infer<typeof reviewAnswerSchema>,
) {
  ctx.require('assessments.evaluate')
  const answer = await ctx.db.evaluatedAnswer.findFirst({
    where: { id: answerId },
    include: {
      evaluationJob: {
        include: {
          answerSheet: {
            select: {
              id: true,
              studentId: true,
              attemptId: true,
              assignmentId: true,
              assignment: {
                select: {
                  id: true,
                  assessment: {
                    select: {
                      id: true,
                      classSubjectId: true,
                      questions: {
                        select: { id: true, marks: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!answer) throw notFound('Evaluated answer')
  await assertClassSubjectAccess(
    ctx,
    answer.evaluationJob.answerSheet.assignment.assessment.classSubjectId,
  )

  if (input.reviewStatus === 'OVERRIDDEN' && input.teacherMarks === undefined) {
    throw new ApiException(400, 'MARKS_REQUIRED', 'Enter marks when overriding the AI suggestion')
  }

  const marksToApply =
    input.reviewStatus === 'OVERRIDDEN'
      ? input.teacherMarks!
      : input.teacherMarks ?? answer.suggestedMarks ?? undefined

  const updated = await ctx.db.evaluatedAnswer.update({
    where: { id: answerId },
    data: {
      reviewStatus: input.reviewStatus,
      teacherMarks: marksToApply ?? null,
      teacherFeedback: input.teacherFeedback?.trim() || null,
      needsReview: input.reviewStatus === 'FLAGGED',
      reviewedById: ctx.user.userId,
      reviewedAt: new Date(),
    },
  })

  // Write approved / overridden marks onto the attempt (never for FLAGGED alone).
  if (
    (input.reviewStatus === 'APPROVED' || input.reviewStatus === 'OVERRIDDEN') &&
    marksToApply != null &&
    answer.assessmentQuestionId
  ) {
    await applyMarksToStudentAnswer(ctx, {
      sheet: answer.evaluationJob.answerSheet,
      assessmentQuestionId: answer.assessmentQuestionId,
      marksAwarded: marksToApply,
      teacherComment: input.teacherFeedback?.trim() || answer.feedback || null,
      extractedText: answer.extractedText,
    })
  }

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    module: 'assessments',
    action: 'evaluated_answer.review',
    entityType: 'EvaluatedAnswer',
    entityId: answerId,
    summary: `Marked AI evaluation as ${input.reviewStatus.toLowerCase()}`,
    after: input,
  })

  return updated
}

/**
 * Ensures an offline attempt exists and upserts StudentAnswer marks from AI review.
 */
async function applyMarksToStudentAnswer(
  ctx: AppContext,
  args: {
    sheet: {
      id: string
      studentId: string
      attemptId: string | null
      assignmentId: string
      assignment: {
        id: string
        assessment: {
          id: string
          questions: { id: string; marks: number }[]
        }
      }
    }
    assessmentQuestionId: string
    marksAwarded: number
    teacherComment: string | null
    extractedText: string | null
  },
) {
  const sheet = args.sheet
  const question = sheet.assignment.assessment.questions.find(
    (q) => q.id === args.assessmentQuestionId,
  )
  if (!question) return

  const capped = Math.min(Math.max(0, args.marksAwarded), question.marks)

  let attemptId = sheet.attemptId
  if (!attemptId) {
    const existing = await ctx.db.assessmentAttempt.findFirst({
      where: {
        assignmentId: sheet.assignmentId,
        studentId: sheet.studentId,
      },
      orderBy: { attemptNumber: 'desc' },
      select: { id: true, status: true },
    })
    if (existing) {
      attemptId = existing.id
      if (existing.status === 'IN_PROGRESS') {
        await ctx.db.assessmentAttempt.update({
          where: { id: existing.id },
          data: { status: 'SUBMITTED', submittedAt: new Date() },
        })
      }
    } else {
      const created = await ctx.db.assessmentAttempt.create({
        data: {
          tenantId: ctx.tenant.id,
          assignmentId: sheet.assignmentId,
          studentId: sheet.studentId,
          attemptNumber: 1,
          status: 'SUBMITTED',
          submittedAt: new Date(),
        },
        select: { id: true },
      })
      attemptId = created.id
    }
    await ctx.db.answerSheet.update({
      where: { id: sheet.id },
      data: { attemptId },
    })
  }

  const answerRow = await ctx.db.studentAnswer.upsert({
    where: {
      tenantId_attemptId_assessmentQuestionId: {
        tenantId: ctx.tenant.id,
        attemptId,
        assessmentQuestionId: args.assessmentQuestionId,
      },
    },
    create: {
      tenantId: ctx.tenant.id,
      attemptId,
      assessmentQuestionId: args.assessmentQuestionId,
      responseText: args.extractedText,
      marksAwarded: capped,
      teacherComment: args.teacherComment,
      isCorrect: capped >= question.marks,
      evaluatedById: ctx.user.userId,
      evaluatedAt: new Date(),
    },
    update: {
      responseText: args.extractedText ?? undefined,
      marksAwarded: capped,
      teacherComment: args.teacherComment,
      isCorrect: capped >= question.marks,
      evaluatedById: ctx.user.userId,
      evaluatedAt: new Date(),
    },
    select: { id: true },
  })

  return answerRow
}

/** When every AI answer on a job is approved/overridden, finalise the attempt total. */
export async function finaliseEvaluationJob(ctx: AppContext, jobId: string) {
  ctx.require('assessments.evaluate')
  const job = await getEvaluationJob(ctx, jobId)
  const pending = job.answers.filter(
    (a) => a.reviewStatus !== 'APPROVED' && a.reviewStatus !== 'OVERRIDDEN',
  )
  if (pending.length > 0) {
    throw new ApiException(
      409,
      'REVIEW_INCOMPLETE',
      `${pending.length} answer(s) still need Approve or Change marks.`,
    )
  }

  const paperQuestionIds = new Set(job.answerSheet.assignment.assessment.questions.map((q) => q.id))
  const reviewedQuestionIds = new Set(
    job.answers.map((a) => a.assessmentQuestionId).filter(Boolean) as string[],
  )
  for (const id of paperQuestionIds) {
    if (!reviewedQuestionIds.has(id)) {
      throw new ApiException(
        409,
        'REVIEW_INCOMPLETE',
        'Not every paper question has an AI evaluation row. Retry evaluation, then approve all.',
      )
    }
  }

  // Ensure marks are written for every approved answer (covers retries / older stubs).
  for (const row of job.answers) {
    if (!row.assessmentQuestionId) continue
    const marks = row.teacherMarks ?? row.suggestedMarks
    if (marks == null) {
      throw new ApiException(
        409,
        'MARKS_REQUIRED',
        `Question ${row.questionNumber ?? ''} has no marks. Use Change marks or Approve with a suggestion.`,
      )
    }
    await applyMarksToStudentAnswer(ctx, {
      sheet: {
        id: job.answerSheet.id,
        studentId: job.answerSheet.studentId,
        attemptId: job.answerSheet.attemptId,
        assignmentId: job.answerSheet.assignmentId,
        assignment: {
          id: job.answerSheet.assignment.id,
          assessment: {
            id: job.answerSheet.assignment.assessment.id,
            questions: job.answerSheet.assignment.assessment.questions.map((q) => ({
              id: q.id,
              marks: q.marks,
            })),
          },
        },
      },
      assessmentQuestionId: row.assessmentQuestionId,
      marksAwarded: marks,
      teacherComment: row.teacherFeedback ?? row.feedback,
      extractedText: row.extractedText,
    })
  }

  const refreshed = await ctx.db.answerSheet.findFirst({
    where: { id: job.answerSheet.id },
    select: { attemptId: true },
  })
  const attemptId = refreshed?.attemptId
  if (!attemptId) {
    throw new ApiException(409, 'NO_ATTEMPT', 'Could not link an attempt for this sheet.')
  }

  const { finaliseAttempt } = await import('@/server/modules/assessments/evaluation')
  const result = await finaliseAttempt(ctx, attemptId, {})

  await ctx.db.evaluationJob.update({
    where: { id: job.id },
    data: { status: 'COMPLETED', finishedAt: new Date() },
  })
  await ctx.db.answerSheet.update({
    where: { id: job.answerSheet.id },
    data: { status: 'COMPLETED' },
  })

  return { ...result, evaluationJobId: job.id, status: 'COMPLETED' as const }
}

/** Authorize + return bytes for an uploaded answer sheet. */
export async function readAnswerSheetFile(ctx: AppContext, sheetId: string) {
  ctx.require('assessments.evaluate')
  const sheet = await ctx.db.answerSheet.findFirst({
    where: { id: sheetId },
    select: {
      id: true,
      storageKey: true,
      fileName: true,
      mimeType: true,
      studentId: true,
      assignment: {
        select: { assessment: { select: { classSubjectId: true } } },
      },
    },
  })
  if (!sheet) throw notFound('Answer sheet')
  await assertClassSubjectAccess(ctx, sheet.assignment.assessment.classSubjectId)
  await assertStudentAccess(ctx, sheet.studentId)

  const { storageProvider } = await import('@/server/providers')
  const body = await storageProvider().get(sheet.storageKey)
  return { body, mimeType: sheet.mimeType, fileName: sheet.fileName }
}

export async function evaluationUsageSummary(ctx: AppContext) {
  ctx.require('assessments.evaluate')
  const since = new Date()
  since.setDate(1)
  since.setHours(0, 0, 0, 0)

  const { limitFor, FEATURE } = await import('@/server/entitlements')

  const [pages, jobsThisMonth, reviewRequired, pageLimit] = await Promise.all([
    ctx.db.aiUsageEvent.aggregate({
      where: { kind: 'evaluation.pages', createdAt: { gte: since } },
      _sum: { units: true },
      _count: true,
    }),
    ctx.db.evaluationJob.count({ where: { createdAt: { gte: since } } }),
    ctx.db.evaluationJob.count({ where: { status: 'REVIEW_REQUIRED' } }),
    limitFor(ctx.tenant.id, FEATURE.LIMIT_AI_EVAL_PAGES_PER_MONTH),
  ])

  const pagesThisMonth = pages._sum.units ?? 0

  return {
    pagesThisMonth,
    eventsThisMonth: pages._count,
    jobsThisMonth,
    reviewRequired,
    pagesLimit: pageLimit,
    pagesRemaining: pageLimit == null ? null : Math.max(0, pageLimit - pagesThisMonth),
  }
}

/**
 * Async worker body.
 * Phase 4: vision/OCR via AI_DRIVER when configured; otherwise review placeholders.
 * Marks never auto-publish — job always ends REVIEW_REQUIRED for teacher approval.
 */
export async function processEvaluationJob(evaluationJobId: string, tenantId: string) {
  const job = await prisma.evaluationJob.findFirst({
    where: { id: evaluationJobId, tenantId },
    include: {
      answerSheet: {
        include: {
          assignment: {
            select: {
              assessmentId: true,
              assessment: {
                select: {
                  title: true,
                  classSubject: {
                    select: {
                      classLevel: { select: { name: true } },
                      subject: { select: { name: true } },
                    },
                  },
                  questions: {
                    orderBy: { position: 'asc' },
                    select: {
                      id: true,
                      position: true,
                      marks: true,
                      textSnapshot: true,
                      answerSnapshot: true,
                      typeSnapshot: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      answers: { select: { id: true } },
    },
  })
  if (!job) throw new Error(`EvaluationJob ${evaluationJobId} not found`)

  if (job.status === 'COMPLETED') {
    return { skipped: true, status: job.status }
  }

  if (job.status === 'REVIEW_REQUIRED' && job.answers.length > 0) {
    return { skipped: true, status: job.status }
  }

  try {
    await prisma.evaluationJob.update({
      where: { id: job.id },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        startedAt: new Date(),
        lastError: null,
      },
    })
    await prisma.answerSheet.update({
      where: { id: job.answerSheetId },
      data: { status: 'PROCESSING' },
    })

    const paperQuestions = job.answerSheet.assignment.assessment.questions
    const sheet = job.answerSheet
    let mode: 'vision' | 'pdf_text' | 'stub' = 'stub'
    let modelName: string | undefined

    if (job.answers.length === 0) {
      if (paperQuestions.length === 0) {
        await prisma.evaluatedAnswer.create({
          data: {
            tenantId,
            evaluationJobId: job.id,
            questionNumber: 1,
            extractedText: null,
            ocrConfidence: null,
            evaluationConfidence: null,
            suggestedMarks: null,
            maxMarks: null,
            feedback:
              'No questions found on this paper. Add questions to the assessment, then retry evaluation.',
            needsReview: true,
            reviewStatus: 'PENDING',
          },
        })
      } else {
        const { assistantConfigured } = await import('@/server/assistant/providers')
        const { hasFeature } = await import('@/server/entitlements')
        const { FEATURE } = await import('@/lib/features')
        const licensed = await hasFeature(tenantId, FEATURE.MODULE_AI_ASSIST)

        if (assistantConfigured() && licensed) {
          const {
            evaluateAnswerSheetWithVision,
            alignVisionAnswers,
          } = await import('@/server/modules/evaluation/vision')

          const vision = await evaluateAnswerSheetWithVision({
            storageKey: sheet.storageKey,
            mimeType: sheet.mimeType,
            fileName: sheet.fileName,
            pageCount: sheet.pageCount,
            className: sheet.assignment.assessment.classSubject.classLevel.name,
            subjectName: sheet.assignment.assessment.classSubject.subject.name,
            paperTitle: sheet.assignment.assessment.title,
            questions: paperQuestions,
          })

          mode = vision.mode === 'image' ? 'vision' : 'pdf_text'
          modelName = vision.model
          const aligned = alignVisionAnswers(paperQuestions, vision.result)

          await prisma.evaluatedAnswer.createMany({
            data: aligned.map((row) => ({
              tenantId,
              evaluationJobId: job.id,
              assessmentQuestionId: row.assessmentQuestionId,
              questionNumber: row.questionNumber,
              extractedText: row.extractedText,
              ocrConfidence: row.ocrConfidence,
              evaluationConfidence: row.evaluationConfidence,
              suggestedMarks: row.suggestedMarks,
              maxMarks: row.maxMarks,
              feedback: row.feedback,
              needsReview: row.needsReview,
              reviewStatus: 'PENDING',
              rubricNotes: row.rubricNotes as Prisma.InputJsonValue,
            })),
          })
        } else {
          await prisma.evaluatedAnswer.createMany({
            data: paperQuestions.map((q, index) => ({
              tenantId,
              evaluationJobId: job.id,
              assessmentQuestionId: q.id,
              questionNumber: index + 1,
              extractedText: null,
              ocrConfidence: null,
              evaluationConfidence: null,
              suggestedMarks: null,
              maxMarks: q.marks,
              feedback:
                'AI evaluation is not configured (AI_DRIVER / AI_API_KEY or plan). Review the sheet manually, or configure AI and retry.',
              needsReview: true,
              reviewStatus: 'PENDING',
              rubricNotes: {
                expectedAnswer: q.answerSnapshot,
                questionPreview: q.textSnapshot.slice(0, 280),
                mode: 'stub',
              },
            })),
          })
        }
      }
    }

    await prisma.aiUsageEvent.create({
      data: {
        tenantId,
        kind: 'evaluation.pages',
        units: sheet.pageCount,
        model: modelName,
        meta: {
          evaluationJobId: job.id,
          mode,
          questionCount: paperQuestions.length,
        },
      },
    })

    await prisma.evaluationJob.update({
      where: { id: job.id },
      data: {
        status: 'REVIEW_REQUIRED',
        finishedAt: new Date(),
        usage: {
          pages: sheet.pageCount,
          mode,
          model: modelName ?? null,
          questionCount: paperQuestions.length,
        },
      },
    })
    await prisma.answerSheet.update({
      where: { id: job.answerSheetId },
      data: { status: 'REVIEW_REQUIRED' },
    })

    return { skipped: false, status: 'REVIEW_REQUIRED' as const, mode }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.evaluationJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        lastError: message.slice(0, 2000),
        finishedAt: new Date(),
      },
    })
    await prisma.answerSheet.update({
      where: { id: job.answerSheetId },
      data: { status: 'FAILED' },
    })
    throw error
  }
}
