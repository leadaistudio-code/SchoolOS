-- CreateTable
CREATE TABLE "PlatformCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mailboxId" TEXT,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'BRANDED',
    "demoButton" BOOLEAN NOT NULL DEFAULT false,
    "includeSignature" BOOLEAN NOT NULL DEFAULT true,
    "documentIds" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceFileName" TEXT,
    "lastError" TEXT,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "schoolName" TEXT,
    "contactName" TEXT,
    "area" TEXT,
    "crmSchoolId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "error" TEXT,
    "messageId" TEXT,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformUnsubscribe" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "campaignId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformUnsubscribe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformCampaign_createdAt_idx" ON "PlatformCampaign"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformCampaignRecipient_token_key" ON "PlatformCampaignRecipient"("token");

-- CreateIndex
CREATE INDEX "PlatformCampaignRecipient_campaignId_status_idx" ON "PlatformCampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "PlatformCampaignRecipient_email_idx" ON "PlatformCampaignRecipient"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformCampaignRecipient_campaignId_email_key" ON "PlatformCampaignRecipient"("campaignId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUnsubscribe_email_key" ON "PlatformUnsubscribe"("email");

-- AddForeignKey
ALTER TABLE "PlatformCampaign" ADD CONSTRAINT "PlatformCampaign_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "PlatformMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCampaignRecipient" ADD CONSTRAINT "PlatformCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PlatformCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
