-- CreateTable
CREATE TABLE "CrmTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCommunication" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "contactId" TEXT,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "error" TEXT,
    "templateId" TEXT,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmCommunication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmTemplate_channel_isActive_idx" ON "CrmTemplate"("channel", "isActive");
CREATE INDEX "CrmTemplate_category_idx" ON "CrmTemplate"("category");

CREATE INDEX "CrmCommunication_schoolId_createdAt_idx" ON "CrmCommunication"("schoolId", "createdAt");
CREATE INDEX "CrmCommunication_channel_status_idx" ON "CrmCommunication"("channel", "status");

ALTER TABLE "CrmCommunication" ADD CONSTRAINT "CrmCommunication_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "CrmSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCommunication" ADD CONSTRAINT "CrmCommunication_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmCommunication" ADD CONSTRAINT "CrmCommunication_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CrmTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
