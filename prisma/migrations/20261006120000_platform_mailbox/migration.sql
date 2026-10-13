-- Platform mail: the MyCampusView team's own mailbox, sent log and document library.

-- CreateTable
CREATE TABLE "PlatformMailbox" (
    "id" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "replyTo" TEXT,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL DEFAULT 'smtp.hostinger.com',
    "smtpPort" INTEGER NOT NULL DEFAULT 465,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "imapEnabled" BOOLEAN NOT NULL DEFAULT true,
    "imapHost" TEXT NOT NULL DEFAULT 'imap.hostinger.com',
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "sentFolder" TEXT,
    "signatureName" TEXT,
    "signatureTitle" TEXT,
    "signaturePhone" TEXT,
    "signatureWebsite" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformMailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformEmail" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT,
    "fromName" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "to" TEXT[],
    "cc" TEXT[],
    "bcc" TEXT[],
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'BRANDED',
    "status" TEXT NOT NULL,
    "messageId" TEXT,
    "error" TEXT,
    "savedToSent" BOOLEAN NOT NULL DEFAULT false,
    "sentCopyError" TEXT,
    "crmSchoolId" TEXT,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformEmailAttachment" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "documentId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,

    CONSTRAINT "PlatformEmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploadedByLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformMailbox_fromEmail_key" ON "PlatformMailbox"("fromEmail");

-- CreateIndex
CREATE INDEX "PlatformEmail_createdAt_idx" ON "PlatformEmail"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformEmail_status_idx" ON "PlatformEmail"("status");

-- CreateIndex
CREATE INDEX "PlatformEmail_crmSchoolId_idx" ON "PlatformEmail"("crmSchoolId");

-- CreateIndex
CREATE INDEX "PlatformEmailAttachment_emailId_idx" ON "PlatformEmailAttachment"("emailId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformDocument_storageKey_key" ON "PlatformDocument"("storageKey");

-- CreateIndex
CREATE INDEX "PlatformDocument_deletedAt_createdAt_idx" ON "PlatformDocument"("deletedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformEmail" ADD CONSTRAINT "PlatformEmail_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "PlatformMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformEmail" ADD CONSTRAINT "PlatformEmail_crmSchoolId_fkey" FOREIGN KEY ("crmSchoolId") REFERENCES "CrmSchool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformEmailAttachment" ADD CONSTRAINT "PlatformEmailAttachment_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "PlatformEmail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformEmailAttachment" ADD CONSTRAINT "PlatformEmailAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PlatformDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
