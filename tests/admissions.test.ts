import { describe, expect, it } from 'vitest'
import { admissionsAiRules } from '../src/server/modules/admissions/ai'
import {
  leadCreateSchema,
  leadStageSchema,
  publicEnquireSchema,
} from '../src/server/modules/admissions/schema'
import { STAGE_LABELS } from '../src/lib/admissions'

describe('admissions schemas', () => {
  it('accepts a walk-in enquiry', () => {
    const parsed = leadCreateSchema.parse({
      studentName: 'Asha Kumar',
      parentName: 'Ravi Kumar',
      phone: '+919876543210',
      source: 'WALK_IN',
    })
    expect(parsed.studentName).toBe('Asha Kumar')
  })

  it('requires a lost reason only when moving to LOST via service rules', () => {
    expect(leadStageSchema.parse({ stage: 'CONTACTED' }).stage).toBe('CONTACTED')
    expect(STAGE_LABELS.NEW).toBe('New')
  })

  it('rejects honeypot-filled public enquire payloads at max length 0', () => {
    expect(() =>
      publicEnquireSchema.parse({
        studentName: 'Asha',
        parentName: 'Ravi',
        phone: '9876543210',
        company: 'spam',
      }),
    ).toThrow()
  })
})

describe('admissions AI rule fallbacks', () => {
  it('suggests contacting a NEW lead today', () => {
    const suggestion = admissionsAiRules.ruleNextAction({
      stage: 'NEW',
      nextFollowUpOn: null,
      source: 'WEBSITE',
      updatedAt: new Date(),
    })
    expect(suggestion.source).toBe('rules')
    expect(suggestion.recommendedStage).toBe('CONTACTED')
    expect(suggestion.followUpWithinDays).toBe(0)
    expect(suggestion.talkingPoints.length).toBeGreaterThan(0)
  })

  it('flags overdue follow-ups as high priority', () => {
    const suggestion = admissionsAiRules.ruleNextAction({
      stage: 'INTERESTED',
      nextFollowUpOn: new Date(Date.now() - 5 * 86_400_000),
      source: 'CALL',
      updatedAt: new Date(Date.now() - 5 * 86_400_000),
    })
    expect(suggestion.priority).toBe('high')
    expect(suggestion.followUpWithinDays).toBe(0)
  })

  it('drafts a counsellor-owned message', () => {
    const draft = admissionsAiRules.ruleDraft({
      studentName: 'Asha Kumar',
      parentName: 'Ravi Kumar',
      stage: 'NEW',
      source: 'WALK_IN',
    })
    expect(draft.body).toContain('Ravi Kumar')
    expect(draft.body).toContain('Asha Kumar')
    expect(draft.source).toBe('rules')
  })
})
