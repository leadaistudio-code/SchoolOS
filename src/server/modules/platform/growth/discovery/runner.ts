import { prisma } from '@/server/db/prisma'
import type { PlatformContext } from '@/server/context'
import { buildSearchQueries } from '@/lib/lead-discovery'
import { annotateHit, getLeadDiscoveryProvider } from './provider'
import { candidateKey, extractSchoolFromHits, scoreDiscovery } from './extract'
import { shouldAutoCreate, syncCandidateToCrm } from './sync'
import { findSchoolContacts, mergeFindings } from './contacts'
import { overallContactConfidence, parseContactFindings, type ContactFindings } from '@/lib/lead-discovery'
import type { Prisma } from '@prisma/client'

/** Contact details are looked up again at most this often per school. */
const CONTACT_RECHECK_MS = 14 * 24 * 60 * 60 * 1000

function contactColumns(findings: ContactFindings, checkedAt: Date) {
  return {
    email: findings.email?.value ?? null,
    phone: findings.phone?.value ?? null,
    alternatePhone: findings.otherPhones[0]?.value ?? null,
    address: findings.address?.value ?? null,
    website: findings.website?.value ?? null,
    contactConfidence: overallContactConfidence(findings),
    contactFindings: findings as unknown as Prisma.InputJsonValue,
    contactCheckedAt: checkedAt,
  }
}

/** Re-runs the contact lookup for one discovered school. */
export async function refreshDiscoveryContacts(candidateId: string) {
  const candidate = await prisma.crmDiscoveryCandidate.findUnique({
    where: { id: candidateId },
    include: { evidence: { orderBy: { weight: 'desc' }, take: 6 } },
  })
  if (!candidate) throw new Error('Discovery not found')
  const provider = getLeadDiscoveryProvider()
  if (provider.name === 'none') {
    throw new Error('No search provider configured (set LEAD_DISCOVERY_SEARCH_DRIVER and its API key)')
  }
  const previous = parseContactFindings(candidate.contactFindings)
  const { findings } = await findSchoolContacts(provider, {
    ...candidate,
    seedEmail: candidate.email,
    seedPhone: candidate.phone,
    seedAddress: candidate.address,
    hits: candidate.evidence.map((e) => ({ title: e.title ?? '', url: e.url, snippet: e.snippet ?? '' })),
  })
  const merged = mergeFindings(previous, findings)
  const cols = contactColumns(merged, new Date())
  return prisma.crmDiscoveryCandidate.update({
    where: { id: candidate.id },
    data: {
      ...cols,
      email: cols.email ?? candidate.email,
      phone: cols.phone ?? candidate.phone,
      alternatePhone: cols.alternatePhone ?? candidate.alternatePhone,
      address: cols.address ?? candidate.address,
      website: cols.website ?? candidate.website,
    },
  })
}

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

        const existing = await prisma.crmDiscoveryCandidate.findFirst({
          where: { normalizedKey: key },
          orderBy: { discoveredAt: 'desc' },
        })

        let contacts: ReturnType<typeof contactColumns> | null = null
        if (!extracted.reject) {
          const previous = parseContactFindings(existing?.contactFindings)
          const fresh =
            existing?.contactCheckedAt && Date.now() - existing.contactCheckedAt.getTime() < CONTACT_RECHECK_MS
          let findings = previous
          if (!fresh) {
            try {
              const lookup = await findSchoolContacts(provider, {
                ...extracted,
                city: extracted.city ?? location.city,
                state: extracted.state ?? location.state,
                website: extracted.website ?? existing?.website,
                seedEmail: extracted.email,
                seedPhone: extracted.phone,
                seedAddress: extracted.address,
                hits,
              })
              report.queries += lookup.queries
              findings = mergeFindings(previous, lookup.findings)
            } catch (err) {
              report.errors.push(`Contacts ${extracted.schoolName}: ${err instanceof Error ? err.message : String(err)}`)
            }
          }
          if (findings) {
            contacts = contactColumns(findings, fresh ? existing!.contactCheckedAt! : new Date())
            extracted.email = contacts.email ?? extracted.email
            extracted.phone = contacts.phone ?? extracted.phone
            extracted.website = contacts.website ?? extracted.website
          }
        }

        const scored = scoreDiscovery(extracted, annotated)

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
              phone: contacts?.phone ?? (existing.phone || extracted.phone || null),
              email: contacts?.email ?? (existing.email || extracted.email || null),
              website: contacts?.website ?? (existing.website || extracted.website || null),
              ...(contacts
                ? {
                    alternatePhone: contacts.alternatePhone ?? existing.alternatePhone,
                    address: contacts.address ?? existing.address,
                    contactConfidence: contacts.contactConfidence,
                    contactFindings: contacts.contactFindings,
                    contactCheckedAt: contacts.contactCheckedAt,
                  }
                : {}),
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
              alternatePhone: contacts?.alternatePhone ?? extracted.alternatePhone ?? null,
              email: extracted.email ?? null,
              website: extracted.website ?? null,
              address: contacts?.address ?? null,
              ...(contacts
                ? {
                    contactConfidence: contacts.contactConfidence,
                    contactFindings: contacts.contactFindings,
                    contactCheckedAt: contacts.contactCheckedAt,
                  }
                : {}),
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
