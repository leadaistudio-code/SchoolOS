-- AI School Lead Discovery staging tables (platform CRM extension).

CREATE TYPE "CrmDiscoveryVerification" AS ENUM ('VERIFIED', 'STRONG_LEAD', 'NEEDS_VERIFICATION', 'REJECTED');
CREATE TYPE "CrmDiscoveryPriority" AS ENUM ('HOT', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "CrmDiscoveryRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "CrmDiscoveryLocation" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "state" TEXT NOT NULL DEFAULT 'Haryana',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "searchRadius" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmDiscoveryLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmDiscoverySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "minConfidence" INTEGER NOT NULL DEFAULT 60,
    "autoAddVerified" BOOLEAN NOT NULL DEFAULT true,
    "autoAddStrongLead" BOOLEAN NOT NULL DEFAULT true,
    "autoAddNeedsVerification" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmDiscoverySettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmDiscoveryRun" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "status" "CrmDiscoveryRunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "queries" INTEGER NOT NULL DEFAULT 0,
    "resultsFound" INTEGER NOT NULL DEFAULT 0,
    "createdLeads" INTEGER NOT NULL DEFAULT 0,
    "updatedLeads" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "needsReview" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "summary" TEXT,
    "triggeredBy" TEXT,
    CONSTRAINT "CrmDiscoveryRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmDiscoveryCandidate" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "locationId" TEXT,
    "schoolName" TEXT NOT NULL,
    "branchName" TEXT,
    "schoolGroup" TEXT,
    "area" TEXT,
    "sector" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "normalizedKey" TEXT NOT NULL,
    "openingDate" DATE,
    "openingMonth" INTEGER,
    "openingYear" INTEGER,
    "academicSession" TEXT,
    "schoolStatus" TEXT,
    "openingEvidence" TEXT,
    "contactPerson" TEXT,
    "designation" TEXT,
    "phone" TEXT,
    "alternatePhone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "verificationStatus" "CrmDiscoveryVerification" NOT NULL DEFAULT 'NEEDS_VERIFICATION',
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "salesPriority" "CrmDiscoveryPriority" NOT NULL DEFAULT 'MEDIUM',
    "opportunityScore" INTEGER NOT NULL DEFAULT 0,
    "discoverySummary" TEXT,
    "whyThisLead" TEXT,
    "recommendedPitch" TEXT,
    "crmSchoolId" TEXT,
    "crmLinkedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmDiscoveryCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmDiscoveryEvidence" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "sourceName" TEXT,
    "sourceType" TEXT NOT NULL,
    "snippet" TEXT,
    "publishedAt" TIMESTAMP(3),
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weight" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CrmDiscoveryEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmDiscoveryLocation_city_state_key" ON "CrmDiscoveryLocation"("city", "state");
CREATE INDEX "CrmDiscoveryLocation_enabled_priority_idx" ON "CrmDiscoveryLocation"("enabled", "priority");
CREATE INDEX "CrmDiscoveryRun_startedAt_idx" ON "CrmDiscoveryRun"("startedAt");
CREATE INDEX "CrmDiscoveryRun_status_idx" ON "CrmDiscoveryRun"("status");
CREATE UNIQUE INDEX "CrmDiscoveryCandidate_crmSchoolId_key" ON "CrmDiscoveryCandidate"("crmSchoolId");
CREATE INDEX "CrmDiscoveryCandidate_normalizedKey_idx" ON "CrmDiscoveryCandidate"("normalizedKey");
CREATE INDEX "CrmDiscoveryCandidate_verificationStatus_salesPriority_idx" ON "CrmDiscoveryCandidate"("verificationStatus", "salesPriority");
CREATE INDEX "CrmDiscoveryCandidate_city_discoveredAt_idx" ON "CrmDiscoveryCandidate"("city", "discoveredAt");
CREATE INDEX "CrmDiscoveryCandidate_crmSchoolId_idx" ON "CrmDiscoveryCandidate"("crmSchoolId");
CREATE INDEX "CrmDiscoveryEvidence_candidateId_idx" ON "CrmDiscoveryEvidence"("candidateId");
CREATE INDEX "CrmDiscoveryEvidence_url_idx" ON "CrmDiscoveryEvidence"("url");

ALTER TABLE "CrmDiscoveryRun" ADD CONSTRAINT "CrmDiscoveryRun_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "CrmDiscoveryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDiscoveryCandidate" ADD CONSTRAINT "CrmDiscoveryCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CrmDiscoveryRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDiscoveryCandidate" ADD CONSTRAINT "CrmDiscoveryCandidate_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "CrmDiscoveryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmDiscoveryEvidence" ADD CONSTRAINT "CrmDiscoveryEvidence_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CrmDiscoveryCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "CrmDiscoverySettings" ("id", "enabled", "frequency", "minConfidence", "autoAddVerified", "autoAddStrongLead", "autoAddNeedsVerification", "updatedAt")
VALUES ('default', true, 'daily', 60, true, true, false, CURRENT_TIMESTAMP);

INSERT INTO "CrmDiscoveryLocation" ("id", "city", "region", "state", "enabled", "priority", "createdAt", "updatedAt")
VALUES
  ('cldloc_faridabad', 'Faridabad', 'NCR', 'Haryana', true, 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cldloc_greater_faridabad', 'Greater Faridabad', 'NCR', 'Haryana', true, 90, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
