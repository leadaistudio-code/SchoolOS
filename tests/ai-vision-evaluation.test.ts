import { describe, expect, it } from 'vitest'
import {
  alignVisionAnswers,
  needsTeacherReview,
  parseEmitEvaluation,
  CONFIDENCE_REVIEW_THRESHOLD,
} from '@/server/modules/evaluation/vision'

describe('needsTeacherReview', () => {
  it('flags missing confidence', () => {
    expect(needsTeacherReview({ ocrConfidence: null, evaluationConfidence: 90 })).toBe(true)
  })

  it('flags low OCR confidence', () => {
    expect(
      needsTeacherReview({
        ocrConfidence: CONFIDENCE_REVIEW_THRESHOLD - 1,
        evaluationConfidence: 95,
      }),
    ).toBe(true)
  })

  it('passes high confidence', () => {
    expect(needsTeacherReview({ ocrConfidence: 90, evaluationConfidence: 88 })).toBe(false)
  })
})

describe('parseEmitEvaluation', () => {
  it('parses a valid tool payload', () => {
    const result = parseEmitEvaluation(
      JSON.stringify({
        answers: [
          {
            questionNumber: 1,
            assessmentQuestionId: 'q1',
            extractedText: 'x = 5',
            ocrConfidence: 92,
            evaluationConfidence: 88,
            suggestedMarks: 2,
            feedback: 'Correct working',
          },
        ],
      }),
    )
    expect(result.answers).toHaveLength(1)
    expect(result.answers[0]?.suggestedMarks).toBe(2)
  })

  it('rejects empty answers', () => {
    expect(() => parseEmitEvaluation(JSON.stringify({ answers: [] }))).toThrow()
  })
})

describe('alignVisionAnswers', () => {
  const questions = [
    {
      id: 'qa',
      position: 0,
      marks: 5,
      textSnapshot: 'Solve 2x+5=15',
      answerSnapshot: 'x=5',
      typeSnapshot: 'NUMERICAL',
    },
    {
      id: 'qb',
      position: 1,
      marks: 3,
      textSnapshot: 'Define force',
      answerSnapshot: 'Push or pull',
      typeSnapshot: 'SHORT',
    },
  ]

  it('maps by assessmentQuestionId and caps marks', () => {
    const aligned = alignVisionAnswers(questions, {
      answers: [
        {
          questionNumber: 1,
          assessmentQuestionId: 'qa',
          suggestedMarks: 99,
          ocrConfidence: 80,
          evaluationConfidence: 80,
          extractedText: 'x=5',
        },
        {
          questionNumber: 2,
          assessmentQuestionId: 'qb',
          suggestedMarks: 2,
          ocrConfidence: 50,
          evaluationConfidence: 60,
          extractedText: 'Push',
        },
      ],
    })
    expect(aligned[0]?.suggestedMarks).toBe(5)
    expect(aligned[0]?.needsReview).toBe(false)
    expect(aligned[1]?.needsReview).toBe(true)
  })

  it('fills gaps when the model skips a question', () => {
    const aligned = alignVisionAnswers(questions, {
      answers: [
        {
          questionNumber: 1,
          assessmentQuestionId: 'qa',
          suggestedMarks: 5,
          ocrConfidence: 90,
          evaluationConfidence: 90,
        },
      ],
    })
    expect(aligned).toHaveLength(2)
    expect(aligned[1]?.assessmentQuestionId).toBe('qb')
    expect(aligned[1]?.needsReview).toBe(true)
  })
})
