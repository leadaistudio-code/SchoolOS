import { describe, expect, it } from 'vitest'
import {
  buildSearchQueries,
  normalizeSchoolKey,
  opportunityLabel,
} from '@/lib/lead-discovery'
import { annotateHit } from '@/server/modules/platform/growth/discovery/provider'
import { scoreDiscovery, type ExtractedSchool } from '@/server/modules/platform/growth/discovery/extract'

describe('lead discovery helpers', () => {
  it('builds Faridabad query variants', () => {
    const q = buildSearchQueries('Faridabad')
    expect(q.some((x) => /new school Faridabad 2026/i.test(x))).toBe(true)
    expect(q.some((x) => /Sector 89/i.test(x))).toBe(true)
  })

  it('normalizes DPS name variants with campus awareness', () => {
    const a = normalizeSchoolKey({
      schoolName: 'Delhi Public School Faridabad',
      city: 'Faridabad',
    })
    const b = normalizeSchoolKey({
      schoolName: 'DPS Faridabad',
      city: 'Faridabad',
    })
    expect(a).toBe(b)

    const c = normalizeSchoolKey({
      schoolName: 'DPS',
      sector: 'Sector 19',
      city: 'Faridabad',
    })
    const d = normalizeSchoolKey({
      schoolName: 'DPS',
      sector: 'Greater Faridabad',
      city: 'Faridabad',
    })
    expect(c).not.toBe(d)
  })

  it('scores official new campus as strong/verified hot opportunity', () => {
    const extracted: ExtractedSchool = {
      schoolName: 'The Gurukulam School',
      city: 'Greater Faridabad',
      sector: 'Sector 89',
      schoolStatus: 'NEW_CAMPUS',
      academicSession: '2026-27',
      openingYear: 2026,
      phone: '9999999999',
      openingEvidence: 'Admissions open for 2026-27 Faridabad campus',
    }
    const hits = [
      annotateHit({
        title: 'Official campus',
        url: 'https://gurukulam.edu.in/faridabad',
        snippet: 'New campus admissions 2026-27 official about school',
      }),
    ]
    // Force official weight
    hits[0]!.sourceType = 'OFFICIAL_WEBSITE'
    hits[0]!.weight = 40

    const scored = scoreDiscovery(extracted, hits)
    expect(scored.verificationStatus === 'VERIFIED' || scored.verificationStatus === 'STRONG_LEAD').toBe(
      true,
    )
    expect(scored.opportunityScore).toBeGreaterThanOrEqual(70)
    expect(['HOT', 'HIGH']).toContain(scored.salesPriority)
  })

  it('rejects coaching-like extracts', () => {
    const scored = scoreDiscovery(
      {
        schoolName: 'Faridabad NEET Coaching',
        reject: true,
        rejectReason: 'coaching',
      },
      [],
    )
    expect(scored.verificationStatus).toBe('REJECTED')
    expect(scored.opportunityScore).toBe(0)
  })

  it('labels opportunity bands', () => {
    expect(opportunityLabel(92)).toMatch(/Excellent/i)
    expect(opportunityLabel(55)).toMatch(/Medium/i)
  })
})
