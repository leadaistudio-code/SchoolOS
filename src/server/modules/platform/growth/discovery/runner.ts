import { prisma } from '@/server/db/prisma'
import type { PlatformContext } from '@/server/context'
import { buildSearchQueries } from '@/lib/lead-discovery'
import { annotateHit, getLeadDiscoveryProvider } from './provider'
import { candidateKey, extractSchoolFromHits, scoreDiscovery } from './extract'
import { shouldAutoCreate, syncCandidateToCrm } from './sync'

export type DiscoveryRunReport = {
  runId: string
  queries: number
  resultsFound: number
  createdLeads: number
  updatedLeads: number
  duplicates: number
  rejected: number
  needsReview: number
  errors: string[]
  provider: string
}

async function ensureDefaults() {
  await prisma.crmDiscoverySettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  })
  const count = await prisma.crmDiscoveryLocation.count()
  if (count === 0) {
    await prisma.crmDiscoveryLocation.createMany({
      data: [
        { id: 'cldloc_faridabad', city: 'Faridabad', region: 'NCR', state: 'Haryana', priority: 100 },
        {
          id: 'cldloc_greater_faridabad',
          city: 'Greater Faridabad',
          region: 'NCR',
          state: 'Haryana',
          priority: 90,
        },
      ],
      skipDuplicates: true,
    })
  }
}

/**
 * Full discovery pass for enabled locations.
 * When ctx is provided (manual run), auto-created leads use the existing CRM services.
 * Cron jobs should pass a platform operator PlatformContext when available.
 */
export async function runSchoolLeadDiscovery(
  ctx: PlatformContext | null,
  opts?: { locationId?: string; triggeredBy?: string },
): Promise<DiscoveryRunReport> {
  await ensureDefaults()
  const settings = await prisma.crmDiscoverySettings.findUnique({ where: { id: 'default' } })
  if (settings && !settings.enabled) {
    throw new Error('AI Lead Discovery is disabled in settings')
  }

  const locations = await prisma.crmDiscoveryLocation.findMany({
    where: {
      enabled: true,
      ...(opts?.locationId ? { id: opts.locationId } : {}),
    },
    orderBy: { priority: 'desc' },
  })

  const provider = getLeadDiscoveryProvider()
  const run = await prisma.crmDiscoveryRun.create({
    data: {
      status: 'RUNNING',
      triggeredBy: opts?.triggeredBy ?? (ctx ? ctx.user.userId : 'cron'),
      locationId: opts?.locationId ?? locations[0]?.id ?? null,
    },
  })

  const report: DiscoveryRunReport = {
    runId: run.id,
    queries: 0,
    resultsFound: 0,
    createdLeads: 0,
    updatedLeads: 0,
    duplicates: 0,
    rejected: 0,
    needsReview: 0,
    errors: [],
    provider: provider.name,
  }

  const seenKeys = new Set<string>()

  try {
    for (const location of locations) {
      const queries = buildSearchQueries(location.city)
      for (const query of queries) {
        report.queries += 1
        let hits
        try {
          hits = await provider.searchSchools(query)
        } catch (err) {
          report.errors.push(`${query}: ${err instanceof Error ? err.message : String(err)}`)
          continue
        }
        if (hits.length === 0) continue
        report.resultsFound += hits.length

        const annotated = hits.map(annotateHit)
        const extracted = await extractSchoolFromHits(hits, location.city)
        if (!extracted) continue

        const key = candidateKey(extracted)
        if (seenKeys.has(key)) {
          report.duplicates += 1
          continue
        }
        seenKeys.add(key)

        const scored = scoreDiscovery(extracted, annotated)

        const existing = await prisma.crmDiscoveryCandidate.findFirst({
          where: { normalizedKey: key },
          orderBy: { discoveredAt: 'desc' },
        })

        if (scored.verificationStatus === 'REJECTED' || extracted.reject) {
          report.rejected += 1
          await prisma.crmDiscoveryCandidate.create({
            data: {
              runId: run.id,
              locationId: location.id,
              schoolName: extracted.schoolName,
              branchName: extracted.branchName ?? null,
              schoolGroup: extracted.schoolGroup ?? null,
              area: extracted.area ?? null,
              sector: extracted.sector ?? null,
              city: extracted.city ?? location.city,
              state: extracted.state ?? location.state,
              postalCode: extracted.postalCode ?? null,
              normalizedKey: key,
              openingMonth: extracted.openingMonth ?? null,
              openingYear: extracted.openingYear ?? null,
              academicSession: extracted.academicSession ?? null,
              schoolStatus: extracted.schoolStatus ?? null,
              openingEvidence: extracted.openingEvidence ?? null,
              contactPerson: extracted.contactPerson ?? null,
              designation: extracted.designation ?? null,
              phone: extracted.phone ?? null,
              alternatePhone: extracted.alternatePhone ?? null,
              email: extracted.email ?? null,
              website: extracted.website ?? null,
              verificationStatus: 'REJECTED',
              confidenceScore: scored.confidenceScore,
              salesPriority: scored.salesPriority,
              opportunityScore: scored.opportunityScore,
              discoverySummary: extracted.discoverySummary ?? null,
              whyThisLead: extracted.whyThisLead ?? null,
              recommendedPitch: extracted.recommendedPitch ?? null,
              rejectedAt: new Date(),
              rejectedReason: extracted.rejectReason ?? 'Rejected by discovery rules',
              lastVerifiedAt: new Date(),
              evidence: {
                create: annotated.slice(0, 5).map((h) => ({
                  url: h.url,
                  title: h.title,
                  sourceName: h.sourceName ?? null,
                  sourceType: h.sourceType,
                  snippet: h.snippet.slice(0, 500),
                  weight: h.weight,
                })),
              },
            },
          })
          continue
        }

        let candidateId: string
        if (existing) {
          report.duplicates += 1
          const updated = await prisma.crmDiscoveryCandidate.update({
            where: { id: existing.id },
            data: {
              runId: run.id,
              verificationStatus: scored.verificationStatus,
              confidenceScore: scored.confidenceScore,
              salesPriority: scored.salesPriority,
              opportunityScore: scored.opportunityScore,
              phone: existing.phone || extracted.phone || null,
              email: existing.email || extracted.email || null,
              website: existing.website || extracted.website || null,
              openingEvidence: extracted.openingEvidence ?? existing.openingEvidence,
              discoverySummary: extracted.discoverySummary ?? existing.discoverySummary,
              whyThisLead: extracted.whyThisLead ?? existing.whyThisLead,
              recommendedPitch: extracted.recommendedPitch ?? existing.recommendedPitch,
              academicSession: extracted.academicSession ?? existing.academicSession,
              schoolStatus: extracted.schoolStatus ?? existing.schoolStatus,
              lastVerifiedAt: new Date(),
            },
          })
          candidateId = updated.id
          await prisma.crmDiscoveryEvidence.createMany({
            data: annotated.slice(0, 3).map((h) => ({
              candidateId,
              url: h.url,
              title: h.title,
              sourceName: h.sourceName ?? null,
              sourceType: h.sourceType,
              snippet: h.snippet.slice(0, 500),
              weight: h.weight,
            })),
          })
        } else {
          const created = await prisma.crmDiscoveryCandidate.create({
            data: {
              runId: run.id,
              locationId: location.id,
              schoolName: extracted.schoolName,
              branchName: extracted.branchName ?? null,
              schoolGroup: extracted.schoolGroup ?? null,
              area: extracted.area ?? null,
              sector: extracted.sector ?? null,
              city: extracted.city ?? location.city,
              state: extracted.state ?? location.state,
              postalCode: extracted.postalCode ?? null,
              normalizedKey: key,
              openingMonth: extracted.openingMonth ?? null,
              openingYear: extracted.openingYear ?? null,
              academicSession: extracted.academicSession ?? null,
              schoolStatus: extracted.schoolStatus ?? null,
              openingEvidence: extracted.openingEvidence ?? null,
              contactPerson: extracted.contactPerson ?? null,
              designation: extracted.designation ?? null,
              phone: extracted.phone ?? null,
              alternatePhone: extracted.alternatePhone ?? null,
              email: extracted.email ?? null,
              website: extracted.website ?? null,
              verificationStatus: scored.verificationStatus,
              confidenceScore: scored.confidenceScore,
              salesPriority: scored.salesPriority,
              opportunityScore: scored.opportunityScore,
              discoverySummary: extracted.discoverySummary ?? null,
              whyThisLead: extracted.whyThisLead ?? null,
              recommendedPitch: extracted.recommendedPitch ?? null,
              lastVerifiedAt: new Date(),
              evidence: {
                create: annotated.slice(0, 5).map((h) => ({
                  url: h.url,
                  title: h.title,
                  sourceName: h.sourceName ?? null,
                  sourceType: h.sourceType,
                  snippet: h.snippet.slice(0, 500),
                  weight: h.weight,
                })),
              },
            },
          })
          candidateId = created.id
        }

        if (scored.verificationStatus === 'NEEDS_VERIFICATION') report.needsReview += 1

        if (ctx && (await shouldAutoCreate(scored.verificationStatus, scored.confidenceScore))) {
          try {
            const sync = await syncCandidateToCrm(ctx, candidateId)
            if (sync.action === 'created') report.createdLeads += 1
            if (sync.action === 'updated') report.updatedLeads += 1
          } catch (err) {
            report.errors.push(
              `CRM sync ${extracted.schoolName}: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
      }
    }

    await prisma.crmDiscoveryRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        queries: report.queries,
        resultsFound: report.resultsFound,
        createdLeads: report.createdLeads,
        updatedLeads: report.updatedLeads,
        duplicates: report.duplicates,
        rejected: report.rejected,
        needsReview: report.needsReview,
        errors: report.errors.length ? report.errors : undefined,
        summary: `Provider ${provider.name}: ${report.resultsFound} hits, ${report.createdLeads} created, ${report.updatedLeads} updated`,
      },
    })
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err))
    await prisma.crmDiscoveryRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errors: report.errors,
        summary: report.errors[0] ?? 'Discovery failed',
      },
    })
  }

  return report
}
