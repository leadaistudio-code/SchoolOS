-- AlterTable
ALTER TABLE "CrmDiscoveryCandidate" ADD COLUMN "address" TEXT,
ADD COLUMN "contactConfidence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "contactFindings" JSONB,
ADD COLUMN "contactCheckedAt" TIMESTAMP(3);
