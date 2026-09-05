import type { PlatformContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { createFollowUp, createSchool, createTask, findDuplicates, logActivity, updateSchool } from '../service'
import type { CrmDiscoveryCandidate, CrmDiscoveryEvidence } from '@prisma/client'

type CandidateWithEvidence = CrmDiscoveryCandidate & { evidence: CrmDiscoveryEvidence[] }

function temperatureFromPriority(priority: string): 'HOT' | 'WARM' | 'COLD' {
  if (priority === 'HOT') return 'HOT'
  if (priority === 'HIGH') return 'WARM'
  return 'COLD'
}

function dueInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function buildNotes(c: CandidateWithEvidence): string {
  const bits = [
    c.discoverySummary,
    c.openingEvidence ? `Opening evidence: ${c.openingEvidence}` : null,
    c.whyThisLead ? `Why this lead:\n${c.whyThisLead}` : null,
    c.recommendedPitch ? `Recommended pitch:\n${c.recommendedPitch}` : null,
    `Verification: ${c.verificationStatus} · Opportunity ${c.opportunityScore}/100 · Priority ${c.salesPriority}`,
  ]
  return bits.filter(Boolean).join('\n\n')
}

function materialUpdates(
  existing: {
    phone: string | null
    email: string | null
    website: string | null
    notes: string | null
  },
  c: CandidateWithEvidence,
): { patch: Record<string, unknown>; lines: string[] } {
  const lines: string[] = []
  const patch: Record<string, unknown> = {}

  // Human data wins: only fill empty CRM fields from AI
  if (!existing.phone && c.phone) {
    patch.phone = c.phone
    lines.push(`New phone: ${c.phone}`)
  }
  if (!existing.email && c.email) {
    patch.email = c.email
    lines.push(`New email: ${c.email}`)
  }
  if (!existing.website && c.website) {
    patch.website = c.website
    lines.push(`Official website found: ${c.website}`)
  }
  if (c.openingEvidence && !(existing.notes ?? '').includes(c.openingEvidence.slice(0, 40))) {
    lines.push(`New evidence: ${c.openingEvidence.slice(0, 180)}`)
  }
  return { patch, lines }
}

async function createFollowUpsForPriority(
  ctx: PlatformContext,
  schoolId: string,
  priority: string,
  verification: string,
) {
  if (verification === 'NEEDS_VERIFICATION') {
    await createFollowUp(ctx, schoolId, {
      dueAt: dueInDays(3),
      type: 'OTHER',
      priority: 'NORMAL',
      note: 'AI Discovery: verify contact details and campus status',
    })
    await createTask(ctx, schoolId, {
      title: 'Verify AI-discovered school',
      description: 'Confirm campus exists, contacts and opening timing before outreach.',
      dueAt: dueInDays(3),
      priority: 'NORMAL',
    })
    return
  }
  if (priority === 'HOT') {
    await createFollowUp(ctx, schoolId, {
      dueAt: dueInDays(1),
      type: 'CALL',
      priority: 'HIGH',
      note: 'AI Discovery HOT: contact within 24 hours',
    })
  } else if (priority === 'HIGH') {
    await createFollowUp(ctx, schoolId, {
      dueAt: dueInDays(2),
      type: 'CALL',
      priority: 'HIGH',
      note: 'AI Discovery HIGH: contact within 48 hours',
    })
  } else {
    await createFollowUp(ctx, schoolId, {
      dueAt: dueInDays(4),
      type: 'CALL',
      priority: 'NORMAL',
      note: 'AI Discovery: contact within 3–5 days',
    })
  }
}

/**
 * Create or update a CrmSchool from a discovery candidate using EXISTING CRM services.
 */
export async function syncCandidateToCrm(
  ctx: PlatformContext,
  candidateId: string,
  opts?: { forceCreate?: boolean },
): Promise<{ action: 'created' | 'updated' | 'skipped' | 'linked'; schoolId: string | null }> {
  const candidate = await prisma.crmDiscoveryCandidate.findUnique({
    where: { id: candidateId },
    include: { evidence: true },
  })
  if (!candidate) return { action: 'skipped', schoolId: null }
  if (candidate.verificationStatus === 'REJECTED') return { action: 'skipped', schoolId: null }

  if (candidate.crmSchoolId) {
    const existing = await prisma.crmSchool.findFirst({
      where: { id: candidate.crmSchoolId, deletedAt: null },
    })
    if (existing) {
      const { patch, lines } = materialUpdates(existing, candidate)
      if (Object.keys(patch).length > 0) {
        await updateSchool(ctx, existing.id, patch as never)
      }
      if (lines.length > 0 || candidate.verificationStatus) {
        await logActivity(ctx, existing.id, {
          type: 'NOTE',
          summary: 'AI Discovery Update',
          body: [
            `Verification: ${candidate.verificationStatus}`,
            `Priority: ${candidate.salesPriority}`,
            ...lines,
          ].join('\n'),
        })
      }
      return { action: 'updated', schoolId: existing.id }
    }
  }

  const duplicates = await findDuplicates(ctx, {
    name: candidate.schoolName,
    phone: candidate.phone,
    website: candidate.website,
  })

  // Prefer same-city campus match
  const cityDup = duplicates.find(
    (d) =>
      (d.city ?? '').toLowerCase() === (candidate.city ?? '').toLowerCase() ||
      !candidate.city ||
      !d.city,
  )

  if (cityDup && !opts?.forceCreate) {
    const existing = await prisma.crmSchool.findFirst({ where: { id: cityDup.id } })
    if (existing) {
      const { patch, lines } = materialUpdates(existing, candidate)
      if (Object.keys(patch).length > 0) {
        await updateSchool(ctx, existing.id, {
          ...patch,
          sourceDetails: [
            existing.sourceDetails,
            `AI Discovery match ${new Date().toISOString().slice(0, 10)}`,
          ]
            .filter(Boolean)
            .join('\n'),
        } as never)
      }
      await logActivity(ctx, existing.id, {
        type: 'NOTE',
        summary: 'AI Discovery Update',
        body: [
          `Matched existing CRM lead (${existing.name}).`,
          `Verification: ${candidate.verificationStatus}`,
          ...lines,
        ].join('\n'),
      })
      await prisma.crmDiscoveryCandidate.update({
        where: { id: candidate.id },
        data: { crmSchoolId: existing.id, crmLinkedAt: new Date() },
      })
      return { action: 'updated', schoolId: existing.id }
    }
  }

  const school = await createSchool(ctx, {
    name: candidate.branchName
      ? `${candidate.schoolName} — ${candidate.branchName}`
      : candidate.schoolName,
    city: candidate.city ?? undefined,
    state: candidate.state ?? undefined,
    address: [candidate.sector, candidate.area].filter(Boolean).join(', ') || undefined,
    website: candidate.website ?? undefined,
    phone: candidate.phone ?? undefined,
    email: candidate.email ?? undefined,
    leadSource: 'AI_DISCOVERY',
    campaign: candidate.schoolStatus ?? 'AI_DISCOVERED',
    sourceDetails: [
      `Category: ${candidate.schoolStatus ?? 'UNKNOWN'}`,
      `Verification: ${candidate.verificationStatus}`,
      `Opportunity: ${candidate.opportunityScore}/100`,
      candidate.academicSession ? `Session: ${candidate.academicSession}` : null,
      `Evidence sources: ${candidate.evidence.length}`,
    ]
      .filter(Boolean)
      .join('\n'),
    notes: buildNotes(candidate),
    stage: 'PROSPECT',
    temperature: temperatureFromPriority(candidate.salesPriority),
    dealValue: 0,
    arr: 0,
    confirmDuplicate: !!opts?.forceCreate || duplicates.length > 0,
  })

  await logActivity(ctx, school.id, {
    type: 'NOTE',
    summary: 'AI discovered school',
    body: buildNotes(candidate),
  })

  if (candidate.contactPerson) {
    await prisma.crmContact.create({
      data: {
        schoolId: school.id,
        fullName: candidate.contactPerson,
        designation: candidate.designation ?? null,
        mobile: candidate.phone ?? null,
        email: candidate.email ?? null,
        isPrimary: true,
        isDecisionMaker: true,
      },
    })
  }

  await createFollowUpsForPriority(
    ctx,
    school.id,
    candidate.salesPriority,
    candidate.verificationStatus,
  )

  await prisma.crmDiscoveryCandidate.update({
    where: { id: candidate.id },
    data: { crmSchoolId: school.id, crmLinkedAt: new Date() },
  })

  return { action: 'created', schoolId: school.id }
}

export async function shouldAutoCreate(
  verification: string,
  confidence: number,
): Promise<boolean> {
  const settings = await prisma.crmDiscoverySettings.findUnique({ where: { id: 'default' } })
  if (!settings?.enabled) return false
  if (confidence < settings.minConfidence) return false
  if (verification === 'VERIFIED') return settings.autoAddVerified
  if (verification === 'STRONG_LEAD') return settings.autoAddStrongLead
  if (verification === 'NEEDS_VERIFICATION') return settings.autoAddNeedsVerification
  return false
}
