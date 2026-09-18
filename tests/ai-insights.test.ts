import { describe, expect, it } from 'vitest'
import {
  remedialGenerateHref,
  rollupTopics,
  splitStrengthsAndGaps,
  TOPIC_GAP_THRESHOLD,
  TOPIC_STRENGTH_THRESHOLD,
} from '@/server/modules/ai-assessment/insights'

describe('rollupTopics', () => {
  it('aggregates marks by topic and sorts weakest first', () => {
    const topics = rollupTopics([
      {
        topicId: 't1',
        topicName: 'Force',
        chapterId: 'c1',
        chapterName: 'Motion',
        marks: 5,
        marksAwarded: 5,
      },
      {
        topicId: 't1',
        topicName: 'Force',
        chapterId: 'c1',
        chapterName: 'Motion',
        marks: 5,
        marksAwarded: 1,
      },
      {
        topicId: 't2',
        topicName: 'Friction',
        chapterId: 'c1',
        chapterName: 'Motion',
        marks: 4,
        marksAwarded: 0,
      },
    ])
    expect(topics[0]?.id).toBe('t2')
    expect(topics[0]?.successRate).toBe(0)
    expect(topics[1]?.successRate).toBe(60)
  })

  it('ignores unmarked answers', () => {
    const topics = rollupTopics([
      {
        topicId: 't1',
        topicName: 'Force',
        chapterId: 'c1',
        chapterName: 'Motion',
        marks: 5,
        marksAwarded: null,
      },
    ])
    expect(topics).toHaveLength(0)
  })
})

describe('splitStrengthsAndGaps', () => {
  it('splits by thresholds', () => {
    const { strengths, gaps, mid } = splitStrengthsAndGaps([
      {
        id: 'a',
        name: 'A',
        chapterId: 'c',
        chapter: 'C',
        questions: 1,
        successRate: TOPIC_STRENGTH_THRESHOLD,
      },
      {
        id: 'b',
        name: 'B',
        chapterId: 'c',
        chapter: 'C',
        questions: 1,
        successRate: TOPIC_GAP_THRESHOLD - 1,
      },
      {
        id: 'c',
        name: 'C',
        chapterId: 'c',
        chapter: 'C',
        questions: 1,
        successRate: 70,
      },
    ])
    expect(strengths.map((t) => t.id)).toEqual(['a'])
    expect(gaps.map((t) => t.id)).toEqual(['b'])
    expect(mid.map((t) => t.id)).toEqual(['c'])
  })
})

describe('remedialGenerateHref', () => {
  it('builds a generate URL with chapters and createPaper', () => {
    const href = remedialGenerateHref({
      classSubjectId: 'cs1',
      chapterIds: ['ch1', 'ch2', 'ch1'],
      title: 'Remedial · Science',
      count: 8,
    })
    expect(href).toContain('/assessments/bank/generate?')
    expect(href).toContain('classSubjectId=cs1')
    expect(href).toContain('createPaper=1')
    expect(href).toContain('chapterIds=ch1%2Cch2')
    expect(href).toContain('count=8')
  })
})
