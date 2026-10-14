-- Phase 8: WhatsApp fee receipts. Three new tables and three enums. No existing
-- table, column, constraint or row is changed, and nothing references them.

-- CreateEnum
CREATE TYPE "WhatsAppReceiptProvider" AS ENUM ('META_CLOUD', 'AISENSY');

-- CreateEnum
CREATE TYPE "WhatsAppConsentStatus" AS ENUM ('OPTED_IN', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "WhatsAppOutboxStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'DEAD', 'SKIPPED');

-- CreateTable
CREATE TABLE "WhatsAppReceiptConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "WhatsAppReceiptProvider" NOT NULL,
    "phoneNumberId" TEXT,
    "templateName" TEXT,
    "templateLanguage" TEXT NOT NULL DEFAULT 'en',
    "campaignName" TEXT,
    "accessTokenEncrypted" TEXT,
    "appSecretEncrypted" TEXT,
    "apiKeyEncrypted" TEXT,
    "webhookKeyHash" TEXT NOT NULL,
    "webhookKeyEncrypted" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppReceiptConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "WhatsAppConsentStatus" NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "optedInAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "paymentId" TEXT,
    "receiptId" TEXT,
    "studentId" TEXT,
    "toPhone" TEXT,
    "provider" "WhatsAppReceiptProvider",
    "status" "WhatsAppOutboxStatus" NOT NULL DEFAULT 'QUEUED',
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "linkExpiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppReceiptConfig_tenantId_key" ON "WhatsAppReceiptConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppReceiptConfig_webhookKeyHash_key" ON "WhatsAppReceiptConfig"("webhookKeyHash");

-- CreateIndex
CREATE INDEX "WhatsAppConsent_tenantId_status_idx" ON "WhatsAppConsent"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConsent_tenantId_phone_key" ON "WhatsAppConsent"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "WhatsAppOutbox_tenantId_status_createdAt_idx" ON "WhatsAppOutbox"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppOutbox_tenantId_providerMessageId_idx" ON "WhatsAppOutbox"("tenantId", "providerMessageId");

-- CreateIndex: at most one message per event (e.g. per fee receipt).
CREATE UNIQUE INDEX "WhatsAppOutbox_tenantId_eventKey_key" ON "WhatsAppOutbox"("tenantId", "eventKey");

-- Checks: consent carries the time it was given or withdrawn, a message the
-- provider accepted carries the time it was sent, and counts are never negative.
ALTER TABLE "WhatsAppConsent"
  ADD CONSTRAINT "WhatsAppConsent_timestamps_check" CHECK (
    ("status" = 'OPTED_IN' AND "optedInAt" IS NOT NULL)
    OR ("status" = 'OPTED_OUT' AND "optedOutAt" IS NOT NULL)
  );

ALTER TABLE "WhatsAppOutbox"
  ADD CONSTRAINT "WhatsAppOutbox_attempts_check" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "WhatsAppOutbox_sent_check" CHECK (
    "status" NOT IN ('SENT', 'DELIVERED', 'READ') OR "sentAt" IS NOT NULL
  );
